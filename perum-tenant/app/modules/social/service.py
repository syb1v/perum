from datetime import timedelta
import re
import unicodedata

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models import User
from app.models.academic import Class, ClassStudent
from app.models.social import Conversation, ConversationMember, EvidenceHold, FriendRequest, Friendship, Message, ModerationCase, ModerationReport, SocialReadReceipt, SocialSettings, UserBlock
from app.modules.social.schemas import ReportCreate, SettingsPatch, StudentProfile


async def get_settings(db: AsyncSession, school_id: int) -> SocialSettings:
    settings = await db.get(SocialSettings, school_id)
    if settings is None:
        settings = SocialSettings(school_id=school_id)
        db.add(settings)
        await db.flush()
    return settings


async def patch_settings(db: AsyncSession, school_id: int, payload: SettingsPatch) -> SocialSettings:
    settings = await get_settings(db, school_id)
    values = payload.model_dump(exclude_unset=True)
    minimum = values.get("social_min_grade", settings.social_min_grade)
    maximum = values.get("social_max_grade", settings.social_max_grade)
    if minimum is not None and maximum is not None and minimum > maximum:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid grade range")
    for key, value in values.items():
        setattr(settings, key, value)
    settings.social_moderation_enabled = settings.social_enabled
    await db.commit()
    await db.refresh(settings)
    return settings


def _pair(first: int, second: int) -> tuple[int, int]:
    return (first, second) if first < second else (second, first)


_LINK_RE = re.compile(r"(?i)(?:https?\s*:\s*/\s*/|www\s*\.|(?<![\w@])(?:[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?\s*\.\s*)+(?:com|org|net|edu|gov|io|ru|рф|su|me|app|dev|site|online|xyz|info|biz)(?=$|[^\w]))")


def canonical_message(body: str) -> str:
    return unicodedata.normalize("NFKC", body).replace("\u200b", "").replace("\u200c", "").replace("\u200d", "").replace("\ufeff", "").strip()


async def _student_row(db: AsyncSession, school_id: int, student_id: int):
    row = (await db.execute(select(User, Class).join(ClassStudent, ClassStudent.student_id == User.id).join(Class, Class.id == ClassStudent.class_id).where(User.id == student_id, User.school_id == school_id, User.role == "student", User.is_active.is_(True), Class.school_id == school_id))).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "student not found")
    return row


def _profile(user: User, class_: Class) -> StudentProfile:
    name = " ".join(part for part in (user.last_name, user.first_name, user.patronymic) if part)
    return StudentProfile(id=user.id, name=name or user.login, avatar=user.avatar_url, class_name=class_.name)


async def _social_context(db: AsyncSession, user: User):
    if user.school_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "school not found")
    settings = await get_settings(db, user.school_id)
    own_user, own_class = await _student_row(db, user.school_id, user.id)
    if not settings.social_enabled or own_class.grade_level is None or (settings.social_min_grade is not None and own_class.grade_level < settings.social_min_grade) or (settings.social_max_grade is not None and own_class.grade_level > settings.social_max_grade):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "social features are unavailable")
    return settings, own_user, own_class


async def _eligible_target(db: AsyncSession, user: User, student_id: int):
    if student_id == user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "student not found")
    settings, _, own_class = await _social_context(db, user)
    target, target_class = await _student_row(db, user.school_id, student_id)
    if target_class.grade_level is None or (settings.social_min_grade is not None and target_class.grade_level < settings.social_min_grade) or (settings.social_max_grade is not None and target_class.grade_level > settings.social_max_grade) or (settings.friend_scope == "classmates" and target_class.id != own_class.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "student not found")
    return target, target_class


async def students(db: AsyncSession, user: User, query: str, cursor: int | None, limit: int):
    settings, _, own_class = await _social_context(db, user)
    stmt = select(User, Class).join(ClassStudent, ClassStudent.student_id == User.id).join(Class, Class.id == ClassStudent.class_id).where(User.school_id == user.school_id, User.role == "student", User.is_active.is_(True), User.id != user.id, Class.school_id == user.school_id)
    if settings.friend_scope == "classmates": stmt = stmt.where(Class.id == own_class.id)
    if settings.social_min_grade is not None: stmt = stmt.where(Class.grade_level >= settings.social_min_grade)
    if settings.social_max_grade is not None: stmt = stmt.where(Class.grade_level <= settings.social_max_grade)
    if query: stmt = stmt.where(or_(User.first_name.ilike(f"%{query}%"), User.last_name.ilike(f"%{query}%")))
    if cursor is not None: stmt = stmt.where(User.id > cursor)
    rows = (await db.execute(stmt.order_by(User.id).limit(limit + 1))).all()
    return [_profile(*row) for row in rows[:limit]], rows[limit][0].id if len(rows) > limit else None


async def create_request(db: AsyncSession, user: User, student_id: int, client_request_id: str):
    await _eligible_target(db, user, student_id)
    existing = await db.scalar(select(FriendRequest).where(FriendRequest.school_id == user.school_id, FriendRequest.requester_id == user.id, FriendRequest.client_request_id == client_request_id))
    if existing is not None: return existing
    low, high = _pair(user.id, student_id)
    if await db.scalar(select(Friendship.id).where(Friendship.school_id == user.school_id, Friendship.user_low_id == low, Friendship.user_high_id == high, Friendship.ended_at.is_(None))):
        raise HTTPException(status.HTTP_409_CONFLICT, "already friends")
    if await db.scalar(select(UserBlock.id).where(UserBlock.school_id == user.school_id, UserBlock.released_at.is_(None), or_(and_(UserBlock.blocker_id == user.id, UserBlock.blocked_id == student_id), and_(UserBlock.blocker_id == student_id, UserBlock.blocked_id == user.id)))):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "student not found")
    pending = await db.scalar(select(FriendRequest).where(FriendRequest.school_id == user.school_id, FriendRequest.user_low_id == low, FriendRequest.user_high_id == high, FriendRequest.status == "pending"))
    if pending is not None: return pending
    request = FriendRequest(school_id=user.school_id, requester_id=user.id, addressee_id=student_id, user_low_id=low, user_high_id=high, client_request_id=client_request_id, expires_at=utc_now() + timedelta(days=30))
    db.add(request); await db.commit(); await db.refresh(request); return request


async def request_action(db: AsyncSession, user: User, request_id: int, action: str):
    await _social_context(db, user)
    request = await db.scalar(select(FriendRequest).where(FriendRequest.id == request_id, FriendRequest.school_id == user.school_id))
    allowed = request is not None and request.status == "pending" and ((action in {"accept", "reject"} and request.addressee_id == user.id) or (action == "cancel" and request.requester_id == user.id))
    if not allowed: raise HTTPException(status.HTTP_404_NOT_FOUND, "request not found")
    request.status = {"accept": "accepted", "reject": "rejected", "cancel": "cancelled"}[action]; request.responded_at = utc_now()
    if action == "accept": db.add(Friendship(school_id=user.school_id, user_low_id=request.user_low_id, user_high_id=request.user_high_id, created_from_request_id=request.id))
    await db.commit(); return request


async def block(db: AsyncSession, user: User, student_id: int, reason_code: str | None):
    await _eligible_target(db, user, student_id); low, high = _pair(user.id, student_id); now = utc_now()
    existing = await db.scalar(select(UserBlock).where(UserBlock.school_id == user.school_id, UserBlock.blocker_id == user.id, UserBlock.blocked_id == student_id, UserBlock.released_at.is_(None)))
    if existing is not None: return existing
    block_ = UserBlock(school_id=user.school_id, blocker_id=user.id, blocked_id=student_id, reason_code=reason_code); db.add(block_)
    for request in (await db.scalars(select(FriendRequest).where(FriendRequest.school_id == user.school_id, FriendRequest.user_low_id == low, FriendRequest.user_high_id == high, FriendRequest.status == "pending"))).all(): request.status = "cancelled"; request.responded_at = now
    friendship = await db.scalar(select(Friendship).where(Friendship.school_id == user.school_id, Friendship.user_low_id == low, Friendship.user_high_id == high, Friendship.ended_at.is_(None)))
    if friendship: friendship.ended_at = now; friendship.ended_by_id = user.id; friendship.end_reason = "blocked"
    await db.commit(); await publish_conversation_changed(db, user.school_id, user.id, student_id, "blocked"); await db.refresh(block_); return block_


async def end_friendship(db: AsyncSession, user: User, student_id: int):
    await _eligible_target(db, user, student_id); low, high = _pair(user.id, student_id)
    friendship = await db.scalar(select(Friendship).where(Friendship.school_id == user.school_id, Friendship.user_low_id == low, Friendship.user_high_id == high, Friendship.ended_at.is_(None)))
    if friendship is None: raise HTTPException(status.HTTP_404_NOT_FOUND, "friend not found")
    friendship.ended_at = utc_now(); friendship.ended_by_id = user.id; friendship.end_reason = "removed"; await db.commit(); await publish_conversation_changed(db, user.school_id, user.id, student_id, "unfriended")


async def publish_conversation_changed(db: AsyncSession, school_id: int, user_id: int, peer_id: int, reason: str) -> None:
    low, high = _pair(user_id, peer_id)
    conversation = await db.scalar(select(Conversation).where(Conversation.school_id == school_id, Conversation.user_low_id == low, Conversation.user_high_id == high))
    if conversation is not None:
        from app.modules.social.realtime import publish_conversation
        await publish_conversation("conversation.changed", school_id, conversation.id, {low, high}, reason=reason)


async def _can_message(db: AsyncSession, user: User, peer_id: int) -> bool:
    try:
        await _eligible_target(db, user, peer_id)
    except HTTPException:
        return False
    low, high = _pair(user.id, peer_id)
    friendship = await db.scalar(select(Friendship.id).where(Friendship.school_id == user.school_id, Friendship.user_low_id == low, Friendship.user_high_id == high, Friendship.ended_at.is_(None)))
    blocked = await db.scalar(select(UserBlock.id).where(UserBlock.school_id == user.school_id, UserBlock.released_at.is_(None), or_(and_(UserBlock.blocker_id == user.id, UserBlock.blocked_id == peer_id), and_(UserBlock.blocker_id == peer_id, UserBlock.blocked_id == user.id))))
    return friendship is not None and blocked is None


async def create_conversation(db: AsyncSession, user: User, peer_id: int) -> Conversation:
    if not await _can_message(db, user, peer_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "student not found")
    low, high = _pair(user.id, peer_id)
    conversation = await db.scalar(select(Conversation).where(Conversation.school_id == user.school_id, Conversation.user_low_id == low, Conversation.user_high_id == high))
    if conversation is None:
        conversation = Conversation(school_id=user.school_id, user_low_id=low, user_high_id=high)
        db.add(conversation); await db.flush()
        db.add_all([ConversationMember(school_id=user.school_id, conversation_id=conversation.id, user_id=low), ConversationMember(school_id=user.school_id, conversation_id=conversation.id, user_id=high)])
        await db.commit(); await db.refresh(conversation)
    return conversation


async def conversation_for_member(db: AsyncSession, user: User, conversation_id: int) -> tuple[Conversation, ConversationMember]:
    row = (await db.execute(select(Conversation, ConversationMember).join(ConversationMember, ConversationMember.conversation_id == Conversation.id).where(Conversation.id == conversation_id, Conversation.school_id == user.school_id, ConversationMember.school_id == user.school_id, ConversationMember.user_id == user.id))).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "conversation not found")
    return row


async def conversation_out(db: AsyncSession, user: User, conversation: Conversation) -> dict:
    peer_id = conversation.user_high_id if conversation.user_low_id == user.id else conversation.user_low_id
    peer_row = (await db.execute(select(User, Class).join(ClassStudent, ClassStudent.student_id == User.id).join(Class, Class.id == ClassStudent.class_id).where(User.id == peer_id, User.school_id == user.school_id, Class.school_id == user.school_id))).first()
    if peer_row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "conversation not found")
    peer, class_ = peer_row
    member = await db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id == user.id, ConversationMember.school_id == user.school_id))
    now = utc_now()
    unread = await db.scalar(select(func.count(Message.id)).where(Message.conversation_id == conversation.id, Message.school_id == user.school_id, Message.sender_id != user.id, Message.is_visible.is_(True), Message.expires_at > now, Message.id > (member.last_read_message_id or 0)))
    last = await db.scalar(select(Message).where(Message.id == conversation.last_message_id, Message.school_id == user.school_id, Message.is_visible.is_(True), Message.expires_at > now)) if conversation.last_message_id else None
    can_send = conversation.is_active and not conversation.is_locked and await _can_message(db, user, peer_id)
    return {"id": conversation.id, "peer": _profile(peer, class_), "last_message": last, "unread_count": unread or 0, "can_send": can_send, "disabled_reason": None if can_send else "unavailable", "created_at": conversation.created_at}


async def send_message(db: AsyncSession, user: User, conversation_id: int, client_message_id: str, body: str) -> Message:
    conversation, _ = await conversation_for_member(db, user, conversation_id)
    canonical = canonical_message(body)
    if not canonical or len(canonical) > 4000:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "invalid message")
    existing = await db.scalar(select(Message).where(Message.conversation_id == conversation.id, Message.sender_id == user.id, Message.client_message_id == client_message_id))
    if existing is not None:
        if existing.body != canonical:
            raise HTTPException(status.HTTP_409_CONFLICT, "client_message_id conflict")
        return existing
    if not conversation.is_active or conversation.is_locked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "conversation locked")
    peer_id = conversation.user_high_id if conversation.user_low_id == user.id else conversation.user_low_id
    if not await _can_message(db, user, peer_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "messaging unavailable")
    settings = await get_settings(db, user.school_id)
    if not settings.message_links_allowed and _LINK_RE.search(canonical):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "links are not allowed")
    now = utc_now()
    message = Message(school_id=user.school_id, conversation_id=conversation.id, sender_id=user.id, client_message_id=client_message_id, body=canonical, expires_at=now + timedelta(days=settings.message_retention_days))
    db.add(message); await db.flush(); conversation.last_message_id = message.id; conversation.last_message_at = message.created_at or now
    from app.modules.push.service import enqueue
    await enqueue(db, user.school_id, peer_id, f"chat:{message.id}", "chat_message", f"conversation:{conversation.id}")
    await db.commit()
    from app.modules.social.realtime import publish_conversation
    await publish_conversation("message.created", user.school_id, conversation.id, {conversation.user_low_id, conversation.user_high_id}, message_id=message.id, sender_id=user.id)
    await db.refresh(message); return message


async def mark_read(db: AsyncSession, user: User, conversation_id: int, message_id: int, client_action_id: str | None = None) -> ConversationMember:
    conversation, _ = await conversation_for_member(db, user, conversation_id)
    if client_action_id is not None:
        existing = await db.scalar(select(SocialReadReceipt).where(SocialReadReceipt.actor_id == user.id, SocialReadReceipt.client_action_id == client_action_id))
        if existing is not None:
            if existing.school_id != user.school_id or existing.conversation_id != conversation_id or existing.message_id != message_id:
                raise HTTPException(status.HTTP_409_CONFLICT, "client_action_id reused")
            return await db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == conversation_id, ConversationMember.user_id == user.id, ConversationMember.school_id == user.school_id))
    message = await db.scalar(select(Message).where(Message.id == message_id, Message.conversation_id == conversation_id, Message.school_id == user.school_id))
    if message is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "message not found")
    member = await db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == conversation_id, ConversationMember.user_id == user.id, ConversationMember.school_id == user.school_id).with_for_update())
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "conversation not found")
    advanced = member.last_read_message_id is None or message_id > member.last_read_message_id
    if advanced:
        member.last_read_message_id = message_id
    if client_action_id is not None:
        db.add(SocialReadReceipt(school_id=user.school_id, actor_id=user.id, conversation_id=conversation_id, message_id=message_id, client_action_id=client_action_id))
    if advanced or client_action_id is not None:
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            if client_action_id is not None:
                existing = await db.scalar(select(SocialReadReceipt).where(SocialReadReceipt.actor_id == user.id, SocialReadReceipt.client_action_id == client_action_id))
                if existing is not None and existing.school_id == user.school_id and existing.conversation_id == conversation_id and existing.message_id == message_id:
                    member = await db.scalar(select(ConversationMember).where(ConversationMember.conversation_id == conversation_id, ConversationMember.user_id == user.id, ConversationMember.school_id == user.school_id))
                    if member is None:
                        raise HTTPException(status.HTTP_404_NOT_FOUND, "conversation not found")
                    return member
            raise HTTPException(status.HTTP_409_CONFLICT, "client_action_id reused")
    if advanced:
        from app.modules.social.realtime import publish_conversation
        await publish_conversation("conversation.read", user.school_id, conversation_id, {conversation.user_low_id, conversation.user_high_id}, user_id=user.id, message_id=message_id)
    return member


async def create_report(db: AsyncSession, user: User, payload: ReportCreate) -> ModerationReport:
    await _social_context(db, user)
    existing = await db.scalar(select(ModerationReport).where(ModerationReport.school_id == user.school_id, ModerationReport.reporter_id == user.id, ModerationReport.client_report_id == payload.client_report_id))
    if existing is not None:
        if existing.message_id != payload.message_id or existing.category != payload.category or existing.comment != payload.comment:
            raise HTTPException(status.HTTP_409_CONFLICT, "client_report_id conflict")
        return existing
    now = utc_now()
    message = await db.scalar(select(Message).join(ConversationMember, ConversationMember.conversation_id == Message.conversation_id).where(Message.id == payload.message_id, Message.school_id == user.school_id, ConversationMember.school_id == user.school_id, ConversationMember.user_id == user.id, Message.sender_id != user.id, Message.is_visible.is_(True), Message.expires_at > now))
    if message is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "message not found")
    report = ModerationReport(school_id=user.school_id, reporter_id=user.id, reported_user_id=message.sender_id, message_id=message.id, category=payload.category, comment=payload.comment, client_report_id=payload.client_report_id)
    db.add(report)
    await db.flush()
    case = ModerationCase(school_id=user.school_id, report_id=report.id, conversation_id=message.conversation_id, reported_message_id=message.id)
    db.add(case)
    await db.flush()
    db.add(EvidenceHold(school_id=user.school_id, case_id=case.id, message_id=message.id, release_at=now + timedelta(days=90)))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.scalar(select(ModerationReport).where(ModerationReport.school_id == user.school_id, ModerationReport.reporter_id == user.id, ModerationReport.client_report_id == payload.client_report_id))
        if existing is None or existing.message_id != payload.message_id or existing.category != payload.category or existing.comment != payload.comment:
            raise HTTPException(status.HTTP_409_CONFLICT, "client_report_id conflict")
        return existing
    await db.refresh(report)
    return report

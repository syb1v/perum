from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utc_now
from app.models import User
from app.models.academic import Class, ClassStudent
from app.models.social import FriendRequest, Friendship, SocialSettings, UserBlock
from app.modules.social.schemas import SettingsPatch, StudentProfile


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
    await db.commit(); await db.refresh(block_); return block_


async def end_friendship(db: AsyncSession, user: User, student_id: int):
    await _eligible_target(db, user, student_id); low, high = _pair(user.id, student_id)
    friendship = await db.scalar(select(Friendship).where(Friendship.school_id == user.school_id, Friendship.user_low_id == low, Friendship.user_high_id == high, Friendship.ended_at.is_(None)))
    if friendship is None: raise HTTPException(status.HTTP_404_NOT_FOUND, "friend not found")
    friendship.ended_at = utc_now(); friendship.ended_by_id = user.id; friendship.end_reason = "removed"; await db.commit()

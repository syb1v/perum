from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_admin, require_student
from app.models import User
from app.models.academic import Class, ClassStudent
from app.models.social import Conversation, FriendRequest, Friendship, Message, UserBlock
from app.modules.social import service
from app.modules.social.schemas import BlockCreate, BlockOut, ConversationCreate, ConversationOut, ConversationPage, FriendRequestCreate, FriendRequestOut, MessageCreate, MessageOut, MessagePage, ModerationActionCreate, ReadCreate, RealtimeTicketOut, ReportCreate, ReportOut, SettingsOut, SettingsPatch, StudentPage, UnreadCountOut

router = APIRouter(prefix="/social")
admin_router = APIRouter(prefix="/social")


async def _profiles(db: AsyncSession, ids: list[int]):
    rows = (await db.execute(select(User, Class).join(ClassStudent, ClassStudent.student_id == User.id).join(Class, Class.id == ClassStudent.class_id).where(User.id.in_(ids)))).all()
    return {user.id: service._profile(user, class_) for user, class_ in rows}


@router.get("/settings", response_model=SettingsOut)
async def settings(user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    return await service.get_settings(db, user.school_id)


@router.post("/realtime-ticket", response_model=RealtimeTicketOut)
async def realtime_ticket(response: Response, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    from app.modules.social.realtime import issue_ticket
    ticket, expires_at = await issue_ticket(db, user)
    response.headers["Cache-Control"] = "no-store"
    return {"ticket": ticket, "expires_at": expires_at, "websocket_path": "/ws/social"}


@admin_router.patch("/settings", response_model=SettingsOut)
async def update_settings(payload: SettingsPatch, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await service.patch_settings(db, user.school_id, payload)


@admin_router.get("/moderation/cases")
async def moderation_cases(cursor: int | None = None, limit: int = Query(20, ge=1, le=100), user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    from app.modules.social import moderation
    rows = await moderation.inbox(db, user.school_id, cursor, limit)
    return {"items": [{"id": row.id, "status": row.status, "version": row.version, "created_at": row.created_at, "updated_at": row.updated_at} for row in rows[:limit]], "next_cursor": rows[limit - 1].id if len(rows) > limit else None}


@admin_router.get("/moderation/cases/{case_id}")
async def moderation_case(case_id: int, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    from app.modules.social import moderation
    return await moderation.detail(db, user, case_id)


@admin_router.post("/moderation/cases/{case_id}/actions")
async def moderation_action(case_id: int, payload: ModerationActionCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    from app.modules.social import moderation
    row = await moderation.action(db, user, case_id, payload)
    return {"id": row.id, "status": row.status, "version": row.version, "updated_at": row.updated_at}


@router.get("/students", response_model=StudentPage)
async def student_search(query: str = "", cursor: int | None = None, limit: int = Query(20, ge=1, le=100), user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    items, next_cursor = await service.students(db, user, query, cursor, limit)
    return {"items": items, "next_cursor": next_cursor}


@router.get("/friend-requests", response_model=list[FriendRequestOut])
async def requests(direction: Literal["incoming", "outgoing"], user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    await service._social_context(db, user)
    field = FriendRequest.addressee_id if direction == "incoming" else FriendRequest.requester_id
    rows = (await db.scalars(select(FriendRequest).where(FriendRequest.school_id == user.school_id, field == user.id, FriendRequest.status == "pending").order_by(FriendRequest.id.desc()))).all()
    profiles = await _profiles(db, [row.requester_id if direction == "incoming" else row.addressee_id for row in rows])
    return [{"id": row.id, "status": row.status, "student": profiles[row.requester_id if direction == "incoming" else row.addressee_id], "created_at": row.created_at, "expires_at": row.expires_at} for row in rows]


@router.post("/friend-requests", response_model=FriendRequestOut)
async def send_request(payload: FriendRequestCreate, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    row = await service.create_request(db, user, payload.student_id, payload.client_request_id)
    target, class_ = await service._student_row(db, user.school_id, row.addressee_id if row.requester_id == user.id else row.requester_id)
    return {"id": row.id, "status": row.status, "student": service._profile(target, class_), "created_at": row.created_at, "expires_at": row.expires_at}


@router.post("/friend-requests/{request_id}/accept", response_model=FriendRequestOut)
async def accept(request_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    row = await service.request_action(db, user, request_id, "accept"); target, class_ = await service._student_row(db, user.school_id, row.requester_id)
    return {"id": row.id, "status": row.status, "student": service._profile(target, class_), "created_at": row.created_at, "expires_at": row.expires_at}


@router.post("/friend-requests/{request_id}/reject", response_model=FriendRequestOut)
async def reject(request_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    row = await service.request_action(db, user, request_id, "reject"); target, class_ = await service._student_row(db, user.school_id, row.requester_id)
    return {"id": row.id, "status": row.status, "student": service._profile(target, class_), "created_at": row.created_at, "expires_at": row.expires_at}


@router.post("/friend-requests/{request_id}/cancel", response_model=FriendRequestOut)
async def cancel(request_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    row = await service.request_action(db, user, request_id, "cancel"); target, class_ = await service._student_row(db, user.school_id, row.addressee_id)
    return {"id": row.id, "status": row.status, "student": service._profile(target, class_), "created_at": row.created_at, "expires_at": row.expires_at}


@router.get("/friends", response_model=StudentPage)
async def friends(cursor: int | None = None, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    await service._social_context(db, user)
    rows = (await db.scalars(select(Friendship).where(Friendship.school_id == user.school_id, Friendship.ended_at.is_(None), or_(Friendship.user_low_id == user.id, Friendship.user_high_id == user.id)).order_by(Friendship.id))).all()
    ids = sorted(row.user_high_id if row.user_low_id == user.id else row.user_low_id for row in rows)
    ids = [id_ for id_ in ids if cursor is None or id_ > cursor]
    page_ids = ids[:20]
    profiles = await _profiles(db, page_ids)
    return {"items": [profiles[id_] for id_ in page_ids], "next_cursor": page_ids[-1] if len(ids) > 20 else None}


@router.delete("/friends/{student_id}", status_code=204)
async def remove_friend(student_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    await service.end_friendship(db, user, student_id)


@router.get("/blocks", response_model=list[BlockOut])
async def blocks(user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    await service._social_context(db, user)
    rows = (await db.scalars(select(UserBlock).where(UserBlock.school_id == user.school_id, UserBlock.blocker_id == user.id, UserBlock.released_at.is_(None)).order_by(UserBlock.id.desc()))).all(); profiles = await _profiles(db, [row.blocked_id for row in rows])
    return [{"id": row.id, "student": profiles[row.blocked_id], "reason_code": row.reason_code, "created_at": row.created_at} for row in rows]


@router.post("/blocks", response_model=BlockOut)
async def create_block(payload: BlockCreate, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    row = await service.block(db, user, payload.student_id, payload.reason_code); target, class_ = await service._student_row(db, user.school_id, payload.student_id)
    return {"id": row.id, "student": service._profile(target, class_), "reason_code": row.reason_code, "created_at": row.created_at}


@router.delete("/blocks/{student_id}", status_code=204)
async def release_block(student_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    await service._social_context(db, user); await service._student_row(db, user.school_id, student_id)
    row = await db.scalar(select(UserBlock).where(UserBlock.school_id == user.school_id, UserBlock.blocker_id == user.id, UserBlock.blocked_id == student_id, UserBlock.released_at.is_(None)))
    if row is not None:
        row.released_at = service.utc_now(); await db.commit(); await service.publish_conversation_changed(db, user.school_id, user.id, student_id, "unblocked")


@router.get("/conversations", response_model=ConversationPage)
async def conversations(cursor: int | None = None, limit: int = Query(20, ge=1, le=100), user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    stmt = select(Conversation).where(Conversation.school_id == user.school_id, or_(Conversation.user_low_id == user.id, Conversation.user_high_id == user.id))
    if cursor is not None: stmt = stmt.where(Conversation.id < cursor)
    rows = (await db.scalars(stmt.order_by(Conversation.id.desc()).limit(limit + 1))).all()
    return {"items": [await service.conversation_out(db, user, row) for row in rows[:limit]], "next_cursor": rows[limit - 1].id if len(rows) > limit else None}


@router.post("/conversations", response_model=ConversationOut)
async def start_conversation(payload: ConversationCreate, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    return await service.conversation_out(db, user, await service.create_conversation(db, user, payload.student_id))


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
async def conversation(conversation_id: int, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    row, _ = await service.conversation_for_member(db, user, conversation_id)
    return await service.conversation_out(db, user, row)


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
async def messages(conversation_id: int, cursor: int | None = None, limit: int = Query(50, ge=1, le=100), user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    await service.conversation_for_member(db, user, conversation_id)
    stmt = select(Message).where(Message.conversation_id == conversation_id, Message.school_id == user.school_id, Message.expires_at > service.utc_now())
    if cursor is not None: stmt = stmt.where(Message.id < cursor)
    rows = (await db.scalars(stmt.order_by(Message.id.desc()).limit(limit + 1))).all()
    items = [{"id": row.id, "sender_id": row.sender_id, "client_message_id": row.client_message_id, "body": row.body if row.is_visible else None, "created_at": row.created_at, "expires_at": row.expires_at} for row in rows[:limit]]
    return {"items": items, "next_cursor": rows[limit - 1].id if len(rows) > limit else None}


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut)
async def send_message(conversation_id: int, payload: MessageCreate, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    return await service.send_message(db, user, conversation_id, payload.client_message_id, payload.body)


@router.post("/conversations/{conversation_id}/read", status_code=204)
async def read_conversation(conversation_id: int, payload: ReadCreate, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    await service.mark_read(db, user, conversation_id, payload.message_id, payload.client_action_id)


@router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(Conversation).where(Conversation.school_id == user.school_id, or_(Conversation.user_low_id == user.id, Conversation.user_high_id == user.id)))).all()
    total = 0
    for row in rows:
        total += (await service.conversation_out(db, user, row))["unread_count"]
    return {"unread_count": total}


@router.post("/reports", response_model=ReportOut)
async def report_message(payload: ReportCreate, user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    return await service.create_report(db, user, payload)

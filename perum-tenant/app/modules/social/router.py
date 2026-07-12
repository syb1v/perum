from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_admin, require_student
from app.models import User
from app.models.academic import Class, ClassStudent
from app.models.social import FriendRequest, Friendship, UserBlock
from app.modules.social import service
from app.modules.social.schemas import BlockCreate, BlockOut, FriendRequestCreate, FriendRequestOut, SettingsOut, SettingsPatch, StudentPage

router = APIRouter(prefix="/social")
admin_router = APIRouter(prefix="/social")


async def _profiles(db: AsyncSession, ids: list[int]):
    rows = (await db.execute(select(User, Class).join(ClassStudent, ClassStudent.student_id == User.id).join(Class, Class.id == ClassStudent.class_id).where(User.id.in_(ids)))).all()
    return {user.id: service._profile(user, class_) for user, class_ in rows}


@router.get("/settings", response_model=SettingsOut)
async def settings(user: User = Depends(require_student), db: AsyncSession = Depends(get_db)):
    return await service.get_settings(db, user.school_id)


@admin_router.patch("/settings", response_model=SettingsOut)
async def update_settings(payload: SettingsPatch, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await service.patch_settings(db, user.school_id, payload)


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
    ids = [row.user_high_id if row.user_low_id == user.id else row.user_low_id for row in rows]
    ids = [id_ for id_ in ids if cursor is None or id_ > cursor]
    profiles = await _profiles(db, ids[:21]); page_ids = ids[:20]
    return {"items": [profiles[id_] for id_ in page_ids], "next_cursor": ids[20] if len(ids) > 20 else None}


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
    if row is not None: row.released_at = service.utc_now(); await db.commit()

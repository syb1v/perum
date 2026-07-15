import asyncio
import hashlib
import json
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException, WebSocket, status
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.core.time import utc_now
from app.models import School, User
from app.models.social import SocialRealtimeTicket
from app.modules.social.service import _social_context


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


async def issue_ticket(db: AsyncSession, user: User) -> tuple[str, datetime]:
    await _social_context(db, user)
    await db.scalar(select(User.id).where(User.id == user.id, User.school_id == user.school_id).with_for_update())
    now = utc_now()
    await db.execute(delete(SocialRealtimeTicket).where(SocialRealtimeTicket.user_id == user.id, SocialRealtimeTicket.school_id == user.school_id, (SocialRealtimeTicket.expires_at <= now) | SocialRealtimeTicket.consumed_at.is_not(None)))
    active = await db.scalar(select(func.count(SocialRealtimeTicket.id)).where(SocialRealtimeTicket.user_id == user.id, SocialRealtimeTicket.school_id == user.school_id, SocialRealtimeTicket.expires_at > now, SocialRealtimeTicket.consumed_at.is_(None)))
    if active is not None and active >= 3:
        await db.rollback()
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many active realtime tickets")
    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(seconds=60)
    db.add(SocialRealtimeTicket(school_id=user.school_id, user_id=user.id, token_digest=token_digest(token), expires_at=expires_at))
    await db.commit()
    return token, expires_at


async def consume_ticket(db: AsyncSession, token: str) -> tuple[User, int] | None:
    if not token or len(token) > 128:
        return None
    try:
        digest = token_digest(token)
    except UnicodeEncodeError:
        return None
    now = utc_now()
    result = await db.execute(update(SocialRealtimeTicket).where(SocialRealtimeTicket.token_digest == digest, SocialRealtimeTicket.expires_at > now, SocialRealtimeTicket.consumed_at.is_(None)).values(consumed_at=now).returning(SocialRealtimeTicket.user_id, SocialRealtimeTicket.school_id))
    row = result.first()
    if row is None:
        await db.rollback()
        return None
    await db.commit()
    user = await db.get(User, row.user_id)
    school = await db.get(School, row.school_id)
    if user is None or school is None or not school.is_active or not user.is_active or user.role != "student" or user.school_id != row.school_id:
        return None
    try:
        await _social_context(db, user)
    except HTTPException:
        return None
    return user, row.school_id


def event(event_type: str, **data: Any) -> dict[str, Any]:
    return {"v": 1, "type": event_type, "occurred_at": utc_now().isoformat(), "data": data}


@dataclass(eq=False)
class Connection:
    school_id: int
    user_id: int
    queue: asyncio.Queue[dict[str, Any]]


class SocialRealtimeManager:
    def __init__(self, max_sockets: int = 3, queue_size: int = 64):
        self.max_sockets = max_sockets
        self.queue_size = queue_size
        self._connections: dict[tuple[int, int], set[Connection]] = {}
        self._lock = asyncio.Lock()

    async def register(self, school_id: int, user_id: int) -> Connection | None:
        async with self._lock:
            key = (school_id, user_id)
            connections = self._connections.setdefault(key, set())
            if len(connections) >= self.max_sockets:
                return None
            connection = Connection(school_id, user_id, asyncio.Queue(self.queue_size))
            connections.add(connection)
            return connection

    async def unregister(self, connection: Connection) -> None:
        async with self._lock:
            key = (connection.school_id, connection.user_id)
            connections = self._connections.get(key)
            if connections is None:
                return
            connections.discard(connection)
            if not connections:
                self._connections.pop(key, None)

    async def publish(self, school_id: int, user_ids: set[int], payload: dict[str, Any]) -> None:
        async with self._lock:
            targets = [connection for user_id in user_ids for connection in self._connections.get((school_id, user_id), ())]
            for connection in targets:
                try:
                    connection.queue.put_nowait(payload)
                except asyncio.QueueFull:
                    pass


manager = SocialRealtimeManager()


async def publish_conversation(event_type: str, school_id: int, conversation_id: int, user_ids: set[int], **data: Any) -> None:
    await manager.publish(school_id, user_ids, event(event_type, conversation_id=conversation_id, **data))


async def websocket_endpoint(websocket: WebSocket) -> None:
    ticket = websocket.query_params.get("ticket", "")
    async with SessionLocal() as db:
        identity = await consume_ticket(db, ticket)
    if identity is None:
        await websocket.close(code=1008)
        return
    user, school_id = identity
    connection = await manager.register(school_id, user.id)
    if connection is None:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    await websocket.send_json(event("connected"))

    async def send_events() -> None:
        while True:
            await websocket.send_json(await connection.queue.get())

    sender = asyncio.create_task(send_events())
    try:
        while True:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=45)
            if len(raw) > 1024:
                break
            try:
                frame = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                break
            if frame != {"type": "pong"}:
                break
    except Exception:
        pass
    finally:
        sender.cancel()
        await manager.unregister(connection)
        try:
            await websocket.close()
        except Exception:
            pass

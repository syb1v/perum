from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import require_admin, require_roles
from app.core.roles import PARENT, STUDENT, TEACHER
from app.models import User
from app.modules.support import service
from app.modules.support.schemas import MessageCreate, MessageOut, MessagePage, ReadCreate, TicketCreate, TicketCreateOut, TicketOut, TicketPage, UnreadOut

router = APIRouter(prefix="/support")
admin_router = APIRouter(prefix="/support")
requester = require_roles(STUDENT, PARENT, TEACHER)


@router.get("/tickets", response_model=TicketPage)
async def tickets(limit: int = Query(20, ge=1, le=100), cursor: int | None = None, user: User = Depends(requester), db: AsyncSession = Depends(get_db)):
    return await service.list_tickets(db, user, False, limit, cursor)


@router.post("/tickets", response_model=TicketCreateOut, status_code=201)
async def create(data: TicketCreate, user: User = Depends(requester), db: AsyncSession = Depends(get_db)):
    return await service.create_ticket(db, user, data)


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def detail(ticket_id: str, user: User = Depends(requester), db: AsyncSession = Depends(get_db)):
    return await service.get_ticket(db, user, ticket_id, False)


@router.get("/tickets/{ticket_id}/messages", response_model=MessagePage)
async def thread(ticket_id: str, before: str | None = None, limit: int = Query(50, ge=1, le=100), user: User = Depends(requester), db: AsyncSession = Depends(get_db)):
    return await service.messages(db, user, ticket_id, False, before, limit)


@router.post("/tickets/{ticket_id}/messages", response_model=MessageOut)
async def reply(ticket_id: str, data: MessageCreate, user: User = Depends(requester), db: AsyncSession = Depends(get_db)):
    return await service.send(db, user, ticket_id, data, False)


@router.post("/tickets/{ticket_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def read(ticket_id: str, data: ReadCreate, user: User = Depends(requester), db: AsyncSession = Depends(get_db)):
    await service.mark_read(db, user, ticket_id, data.message_id, False)


@router.get("/unread-count", response_model=UnreadOut)
async def unread(user: User = Depends(requester), db: AsyncSession = Depends(get_db)):
    return await service.unread(db, user, False)


@admin_router.get("/tickets", response_model=TicketPage)
async def admin_tickets(limit: int = Query(30, ge=1, le=100), cursor: int | None = None, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await service.list_tickets(db, user, True, limit, cursor)


@admin_router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def admin_detail(ticket_id: str, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await service.get_ticket(db, user, ticket_id, True)


@admin_router.get("/tickets/{ticket_id}/messages", response_model=MessagePage)
async def admin_thread(ticket_id: str, before: str | None = None, limit: int = Query(50, ge=1, le=100), user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await service.messages(db, user, ticket_id, True, before, limit)


@admin_router.post("/tickets/{ticket_id}/messages", response_model=MessageOut)
async def admin_reply(ticket_id: str, data: MessageCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await service.send(db, user, ticket_id, data, True)


@admin_router.post("/tickets/{ticket_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def admin_read(ticket_id: str, data: ReadCreate, user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await service.mark_read(db, user, ticket_id, data.message_id, True)


@admin_router.get("/unread-count", response_model=UnreadOut)
async def admin_unread(user: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    return await service.unread(db, user, True)

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_refresh_session, get_current_user
from app.models import RefreshSession, User
from app.modules.push import service
from app.modules.push.schemas import RegistrationPut

router = APIRouter()


@router.get("/push/registration")
async def get_registration(user: User = Depends(get_current_user), session: RefreshSession = Depends(get_current_refresh_session), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.registration(db, user, session)


@router.put("/push/installations/{installation_id}/registration")
async def put_registration(installation_id: UUID, data: RegistrationPut, user: User = Depends(get_current_user), session: RefreshSession = Depends(get_current_refresh_session), db: AsyncSession = Depends(get_db)) -> dict:
    return await service.register(db, user, session, str(installation_id), data)


@router.delete("/push/installations/{installation_id}/registration")
async def delete_registration(installation_id: UUID, installation_secret: str = Header(alias="X-Installation-Proof", min_length=43, max_length=128), user: User = Depends(get_current_user), session: RefreshSession = Depends(get_current_refresh_session), db: AsyncSession = Depends(get_db)) -> dict:
    if not await service.revoke(db, user, session, str(installation_id), installation_secret):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "registration not found")
    return {"success": True}

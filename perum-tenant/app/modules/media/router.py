from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Response, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import User
from app.modules.media import service
from app.modules.media.schemas import MediaObjectOut, UploadSessionCreate, UploadSessionOut

router = APIRouter(prefix="/media")


@router.post("/upload-sessions", response_model=UploadSessionOut, status_code=201)
async def create_upload_session(payload: UploadSessionCreate, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.create_session(db, user, payload)


@router.put("/upload-sessions/{session_id}/content", response_model=MediaObjectOut)
async def put_upload_content(session_id: str, file: UploadFile = File(...), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.upload_content(db, user, session_id, file)


@router.get("/upload-sessions/{session_id}", response_model=UploadSessionOut)
async def get_upload_session(session_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.owned_session(db, user, session_id)


@router.delete("/upload-sessions/{session_id}", status_code=204)
async def cancel_upload_session(session_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await service.delete_session(db, user, session_id)
    return Response(status_code=204)


@router.get("/objects/{object_id}", response_model=MediaObjectOut)
async def get_media_object(object_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.authorized_object(db, user, object_id)


def _chunks(path):
    with path.open("rb") as source:
        while chunk := source.read(64 * 1024):
            yield chunk


@router.get("/objects/{object_id}/content")
async def get_media_content(object_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    object_ = await service.authorized_object(db, user, object_id, content=True)
    path = service.storage().path(object_.storage_key)
    if not path.is_file():
        return Response(status_code=404)
    headers = {
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(object_.filename, safe='')}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "sandbox",
    }
    return StreamingResponse(_chunks(path), media_type=object_.mime_type, headers=headers)

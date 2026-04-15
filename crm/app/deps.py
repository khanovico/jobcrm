from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import decode_access_token
from app.models import UserInDB
from app.repository import BaseRepository, MongoRepository

security = HTTPBearer(auto_error=False)
_repo: BaseRepository | None = None


def get_repository() -> BaseRepository:
    global _repo
    if _repo is None:
        _repo = MongoRepository()
    return _repo


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    repo: BaseRepository = Depends(get_repository),
) -> UserInDB:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    try:
        user_id = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    user = repo.get_user(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

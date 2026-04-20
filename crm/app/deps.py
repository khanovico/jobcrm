from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.agent_auth import hash_api_key
from app.auth import decode_access_token
from app.config import settings
from app.models import AgentContext, UserInDB, UserRole
from app.rate_limit import MinuteRateLimiter
from app.repository import BaseRepository, InMemoryRepository, MongoRepository

security = HTTPBearer(auto_error=False)
_repo: BaseRepository | None = None
_agent_limiter = MinuteRateLimiter(settings.agent_rate_limit_per_minute)


def get_repository() -> BaseRepository:
    global _repo
    if _repo is None:
        _repo = InMemoryRepository() if settings.use_memory_repository else MongoRepository()
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


def get_current_admin(user: UserInDB = Depends(get_current_user)) -> UserInDB:
    if user.role != UserRole.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user


def get_current_admin_or_readonly_user(user: UserInDB = Depends(get_current_user)) -> UserInDB:
    if user.role != UserRole.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Profile write access requires admin role",
        )
    return user


def get_agent_context(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    repo: BaseRepository = Depends(get_repository),
) -> AgentContext:
    if not x_api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")

    key_hash = hash_api_key(x_api_key)
    rec = repo.get_agent_api_key_by_hash(key_hash)
    if not rec:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    if not _agent_limiter.allow(rec.id):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limited")

    repo.touch_agent_api_key_used(rec.id)
    return AgentContext(key_id=rec.id, scopes=rec.scopes)


def require_agent_scope(agent: AgentContext, scope: str) -> None:
    if scope in agent.scopes:
        return
    if "admin" in agent.scopes:
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient API key scope")

from fastapi import Depends, FastAPI, HTTPException, status

from app.auth import create_access_token, hash_password, verify_password
from app.config import settings
from app.deps import get_current_user, get_repository
from app.models import (
    Application,
    ApplicationCreate,
    ApplicationMarkApplied,
    ApplicationStatus,
    ApplicationUpdate,
    Company,
    CompanyCreate,
    CompanyUpdate,
    Profile,
    ProfileCreate,
    ProfileUpdate,
    TokenResponse,
    UserCreate,
    UserLogin,
    UserPublic,
)
from app.repository import BaseRepository

app = FastAPI(title=settings.app_name)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/auth/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, repo: BaseRepository = Depends(get_repository)) -> UserPublic:
    try:
        user = repo.create_user(payload, hash_password(payload.password))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return UserPublic(
        id=user.id,
        name=user.name,
        email=user.email,
        admin=user.admin,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(payload: UserLogin, repo: BaseRepository = Depends(get_repository)) -> TokenResponse:
    user = repo.get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id))


@app.get("/api/v1/companies", response_model=list[Company])
def list_companies(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[Company]:
    return repo.list_companies(skip=skip, limit=limit, search=search)


@app.post("/api/v1/companies", response_model=Company, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Company:
    return repo.create_company(payload)


@app.get("/api/v1/companies/{company_id}", response_model=Company)
def get_company(
    company_id: str,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Company:
    company = repo.get_company(company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@app.put("/api/v1/companies/{company_id}", response_model=Company)
def update_company(
    company_id: str,
    payload: CompanyUpdate,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Company:
    company = repo.update_company(company_id, payload)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return company


@app.delete("/api/v1/companies/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company(
    company_id: str,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> None:
    deleted = repo.delete_company(company_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")


@app.get("/api/v1/profiles", response_model=list[Profile])
def list_profiles(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[Profile]:
    return repo.list_profiles(skip=skip, limit=limit, search=search)


@app.post("/api/v1/profiles", response_model=Profile, status_code=status.HTTP_201_CREATED)
def create_profile(
    payload: ProfileCreate,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Profile:
    return repo.create_profile(payload)


@app.get("/api/v1/profiles/{profile_id}", response_model=Profile)
def get_profile(
    profile_id: str,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Profile:
    profile = repo.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@app.put("/api/v1/profiles/{profile_id}", response_model=Profile)
def update_profile(
    profile_id: str,
    payload: ProfileUpdate,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Profile:
    profile = repo.update_profile(profile_id, payload)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@app.delete("/api/v1/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    profile_id: str,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> None:
    deleted = repo.delete_profile(profile_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")


@app.get("/api/v1/applications", response_model=list[Application])
def list_applications(
    skip: int = 0,
    limit: int = 50,
    status_filter: ApplicationStatus | None = None,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[Application]:
    return repo.list_applications(skip=skip, limit=limit, status=status_filter)


@app.post("/api/v1/applications", response_model=Application, status_code=status.HTTP_201_CREATED)
def create_application(
    payload: ApplicationCreate,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    if not repo.get_company(payload.company_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid company_id")
    return repo.create_application(payload)


@app.get("/api/v1/applications/{application_id}", response_model=Application)
def get_application(
    application_id: str,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    application = repo.get_application(application_id)
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return application


@app.put("/api/v1/applications/{application_id}", response_model=Application)
def update_application(
    application_id: str,
    payload: ApplicationUpdate,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    try:
        application = repo.update_application(application_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return application


@app.post("/api/v1/applications/{application_id}/mark-applied", response_model=Application)
def mark_applied(
    application_id: str,
    payload: ApplicationMarkApplied,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    try:
        application = repo.mark_application_applied(application_id, payload.applied)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return application


@app.delete("/api/v1/applications/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(
    application_id: str,
    _: UserPublic = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> None:
    deleted = repo.delete_application(application_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )

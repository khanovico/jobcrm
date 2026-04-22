from __future__ import annotations

from datetime import datetime

from fastapi import Body, Depends, FastAPI, HTTPException, Query, status
from fastapi.responses import Response
from starlette.middleware.cors import CORSMiddleware

from app.agent_auth import generate_api_key, hash_api_key
from app.auth import create_access_token, verify_password
from app.config import settings
from app.deps import (
    get_agent_context,
    get_current_admin,
    get_current_admin_or_readonly_user,
    get_current_user,
    get_repository,
    require_agent_scope,
)
from app.lifecycle import notify_if_preparation_ready
from app.notification_links import enrich_notification_link
from app.models import (
    ActorType,
    AgentApiKeyCreate,
    AgentApiKeyCreated,
    AgentCompaniesBulkUpdateRequest,
    AgentIndustriesBulkCreateRequest,
    AgentContext,
    AgentHealthResponse,
    AgentNotificationCreate,
    Application,
    ApplicationBootstrapCreate,
    ApplicationCreate,
    ApplicationDetailResponse,
    ApplicationListItem,
    ApplicationMarkApplied,
    ApplicationMarkEmailSent,
    ApplicationStatus,
    ApplicationUpdate,
    AuditEvent,
    AuditListQuery,
    Company,
    CompanyApplicationCountResponse,
    ClearCompanyResearchDetailRequest,
    CompanyCreate,
    CompanyUpdate,
    DeleteCompanyResponse,
    DashboardMetrics,
    Email,
    EmailCreate,
    EmailMarkSent,
    EmailUpdate,
    GlobalSearchResult,
    Industry,
    IndustryBulkCreateRequest,
    IndustryCreate,
    IndustryUpdate,
    NotificationListQuery,
    PerProfileApplication,
    PerProfileApplicationCreate,
    PerProfileApplicationDetail,
    PerProfileApplicationUpdate,
    Profile,
    ProfileCreate,
    ProfileIdList,
    ProfileUpdate,
    TokenResponse,
    UserInDB,
    UserLogin,
    UserNotification,
    UserPublic,
    WorkerAssignResponse,
    WorkerCountResponse,
    WorkerReleaseAllRequest,
    WorkerReleaseRequest,
    WorkerSettings,
    WorkerSettingsUpdate,
    WorkerStateResponse,
    WorkerType,
)
from app.repository import BaseRepository

app = FastAPI(title=settings.app_name)

_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _audit(
    repo: BaseRepository,
    *,
    actor_type: ActorType,
    actor_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    metadata: dict | None = None,
) -> None:
    repo.create_audit_event(
        actor_type=actor_type.value,
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata=metadata or {},
    )


def _validate_bulk_industry_names(repo: BaseRepository, names: list[str]) -> None:
    normalized = [name.strip().lower() for name in names]
    duplicate_names = sorted({n for n in normalized if normalized.count(n) > 1})
    if duplicate_names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Duplicate industry names in request: {', '.join(duplicate_names)}",
        )

    existing_names = {i.name.strip().lower() for i in repo.list_industries(0, 10_000, None)}
    existing_conflicts = sorted({n for n in normalized if n in existing_names})
    if existing_conflicts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Industry names already exist: {', '.join(existing_conflicts)}",
        )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(payload: UserLogin, repo: BaseRepository = Depends(get_repository)) -> TokenResponse:
    user = repo.get_user_by_email(payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return TokenResponse(access_token=create_access_token(user.id))


@app.get("/api/v1/auth/me", response_model=UserPublic)
def auth_me(user: UserInDB = Depends(get_current_user)) -> UserPublic:
    return UserPublic(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        admin=user.admin,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


@app.get("/api/v1/metrics/dashboard", response_model=DashboardMetrics)
def dashboard_metrics(
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> DashboardMetrics:
    apps = repo.list_applications(
        skip=0,
        limit=10_000,
        status=None,
        exclude_status=ApplicationStatus.archived,
    )
    pipeline = sum(
        1
        for a in apps
        if a.status
        in (ApplicationStatus.company_research_pending, ApplicationStatus.company_researching)
    )
    ready = sum(1 for a in apps if a.status == ApplicationStatus.application_ready)
    actions = sum(
        1
        for a in apps
        if a.status == ApplicationStatus.application_ready and not a.applied
    )
    notes = repo.list_notifications(
        user.id, NotificationListQuery(skip=0, limit=200, unread_only=True)
    )
    return DashboardMetrics(
        company_research_pipeline=pipeline,
        application_ready=ready,
        actions_need_review=actions,
        unread_notifications=len(notes),
    )


@app.get("/api/v1/search", response_model=GlobalSearchResult)
def global_search(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> GlobalSearchResult:
    return repo.global_search(q, limit)


@app.get("/api/v1/industries", response_model=list[Industry])
def list_industries(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[Industry]:
    return repo.list_industries(skip=skip, limit=limit, search=search)


@app.post("/api/v1/industries", response_model=Industry, status_code=status.HTTP_201_CREATED)
def create_industry(
    payload: IndustryCreate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Industry:
    try:
        industry = repo.create_industry(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="create",
        entity_type="industry",
        entity_id=industry.id,
    )
    return industry


@app.post("/api/v1/industries/bulk", response_model=list[Industry], status_code=status.HTTP_201_CREATED)
def bulk_create_industries(
    body: IndustryBulkCreateRequest,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[Industry]:
    _validate_bulk_industry_names(repo, [item.name for item in body.industries])
    created: list[Industry] = []
    for item in body.industries:
        industry = repo.create_industry(item)
        _audit(
            repo,
            actor_type=ActorType.user,
            actor_id=user.id,
            action="bulk_create",
            entity_type="industry",
            entity_id=industry.id,
        )
        created.append(industry)
    return created


@app.put("/api/v1/industries/{industry_id}", response_model=Industry)
def update_industry(
    industry_id: str,
    payload: IndustryUpdate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Industry:
    industry = repo.update_industry(industry_id, payload)
    if not industry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Industry not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="update",
        entity_type="industry",
        entity_id=industry_id,
    )
    return industry


@app.delete("/api/v1/industries/{industry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_industry(
    industry_id: str,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Response:
    deleted = repo.delete_industry(industry_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Industry not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="delete",
        entity_type="industry",
        entity_id=industry_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/v1/admin/agent-keys", response_model=AgentApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_agent_key(
    payload: AgentApiKeyCreate,
    admin: UserInDB = Depends(get_current_admin),
    repo: BaseRepository = Depends(get_repository),
) -> AgentApiKeyCreated:
    raw = generate_api_key()
    rec = repo.create_agent_api_key(payload, hash_api_key(raw))
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=admin.id,
        action="create_agent_key",
        entity_type="agent_api_key",
        entity_id=rec.id,
    )
    return AgentApiKeyCreated(
        id=rec.id,
        name=rec.name,
        scopes=rec.scopes,
        created_at=rec.created_at,
        last_used_at=rec.last_used_at,
        raw_key=raw,
    )


@app.get("/api/v1/companies", response_model=list[Company])
def list_companies(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[Company]:
    return repo.list_companies(skip=skip, limit=limit, search=search)


@app.post("/api/v1/companies", response_model=Company, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Company:
    company = repo.create_company(payload)
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="create",
        entity_type="company",
        entity_id=company.id,
    )
    return company


@app.get("/api/v1/companies/{company_id}", response_model=Company)
def get_company(
    company_id: str,
    _: UserInDB = Depends(get_current_user),
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
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Company:
    company = repo.update_company(company_id, payload)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="update",
        entity_type="company",
        entity_id=company_id,
    )
    return company


@app.get(
    "/api/v1/companies/{company_id}/application-count",
    response_model=CompanyApplicationCountResponse,
)
def company_application_count(
    company_id: str,
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> CompanyApplicationCountResponse:
    if not repo.get_company(company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return CompanyApplicationCountResponse(count=repo.count_applications_for_company(company_id))


@app.delete("/api/v1/companies/{company_id}", response_model=DeleteCompanyResponse)
def delete_company(
    company_id: str,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> DeleteCompanyResponse:
    deleted, applications_archived = repo.delete_company(company_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="delete",
        entity_type="company",
        entity_id=company_id,
        metadata={"applications_archived": applications_archived},
    )
    return DeleteCompanyResponse(applications_archived=applications_archived)


@app.post(
    "/api/v1/companies/{company_id}/clear-research-detail",
    response_model=Company,
)
def clear_company_research_detail_route(
    company_id: str,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
    body: ClearCompanyResearchDetailRequest | None = Body(None),
) -> Company:
    req = body or ClearCompanyResearchDetailRequest()
    company = repo.clear_company_research_detail(
        company_id, related_applications=req.related_applications
    )
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="clear_company_research_detail",
        entity_type="company",
        entity_id=company_id,
        metadata={"related_applications": req.related_applications},
    )
    return company


@app.get("/api/v1/profiles", response_model=list[Profile])
def list_profiles(
    skip: int = 0,
    limit: int = 50,
    search: str | None = None,
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[Profile]:
    return repo.list_profiles(skip=skip, limit=limit, search=search)


@app.post("/api/v1/profiles", response_model=Profile, status_code=status.HTTP_201_CREATED)
def create_profile(
    payload: ProfileCreate,
    user: UserInDB = Depends(get_current_admin_or_readonly_user),
    repo: BaseRepository = Depends(get_repository),
) -> Profile:
    profile = repo.create_profile(payload)
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="create",
        entity_type="profile",
        entity_id=profile.id,
    )
    return profile


@app.get("/api/v1/profiles/{profile_id}", response_model=Profile)
def get_profile(
    profile_id: str,
    _: UserInDB = Depends(get_current_user),
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
    user: UserInDB = Depends(get_current_admin_or_readonly_user),
    repo: BaseRepository = Depends(get_repository),
) -> Profile:
    profile = repo.update_profile(profile_id, payload)
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="update",
        entity_type="profile",
        entity_id=profile_id,
    )
    return profile


@app.delete("/api/v1/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(
    profile_id: str,
    user: UserInDB = Depends(get_current_admin_or_readonly_user),
    repo: BaseRepository = Depends(get_repository),
) -> Response:
    deleted = repo.delete_profile(profile_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="delete",
        entity_type="profile",
        entity_id=profile_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/applications", response_model=list[ApplicationListItem])
def list_applications(
    skip: int = 0,
    limit: int = 50,
    status_filter: ApplicationStatus | None = None,
    exclude_status: ApplicationStatus | None = None,
    company_id: str | None = None,
    applied: bool | None = None,
    email_sent: bool | None = None,
    sort: str = "created_at_desc",
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[ApplicationListItem]:
    return repo.list_applications(
        skip=skip,
        limit=limit,
        status=status_filter,
        company_id=company_id,
        applied=applied,
        email_sent=email_sent,
        sort=sort,
        exclude_status=exclude_status,
    )


@app.post("/api/v1/applications", response_model=Application, status_code=status.HTTP_201_CREATED)
def create_application(
    payload: ApplicationCreate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    if not repo.get_company(payload.company_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid company_id")
    application = repo.create_application(payload, created_by_user_id=user.id)
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="create",
        entity_type="application",
        entity_id=application.id,
    )
    return application


@app.post(
    "/api/v1/applications/bootstrap",
    response_model=Application,
    status_code=status.HTTP_201_CREATED,
)
def bootstrap_application(
    payload: ApplicationBootstrapCreate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    _, application = repo.bootstrap_application(payload, created_by_user_id=user.id)
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="bootstrap_application",
        entity_type="application",
        entity_id=application.id,
    )
    return application


@app.get("/api/v1/applications/{application_id}", response_model=Application)
def get_application(
    application_id: str,
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    application = repo.get_application(application_id)
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return application


@app.get("/api/v1/applications/{application_id}/detail", response_model=ApplicationDetailResponse)
def get_application_detail(
    application_id: str,
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> ApplicationDetailResponse:
    application = repo.get_application(application_id)
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    company = repo.get_company(application.company_id)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    ppas = repo.list_per_profile_for_application(application_id)
    ppa_rows: list[PerProfileApplicationDetail] = []
    for ppa in ppas:
        profile = repo.get_profile(ppa.profile_id)
        ppa_rows.append(
            PerProfileApplicationDetail(
                **ppa.model_dump(),
                profile_name=profile.name if profile else "Unknown profile",
                emails=repo.list_emails_for_ppa(ppa.id),
            )
        )
    return ApplicationDetailResponse(
        application=application,
        company=company,
        per_profile_applications=ppa_rows,
    )


@app.put("/api/v1/applications/{application_id}", response_model=Application)
def update_application(
    application_id: str,
    payload: ApplicationUpdate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    before = repo.get_application(application_id)
    try:
        application = repo.update_application(application_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="update",
        entity_type="application",
        entity_id=application_id,
        metadata={"fields": list(payload.model_dump(exclude_none=True).keys())},
    )
    notify_if_preparation_ready(repo, before, application)
    return application


@app.post("/api/v1/applications/{application_id}/mark-applied", response_model=Application)
def mark_applied(
    application_id: str,
    payload: ApplicationMarkApplied,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    try:
        application = repo.mark_application_applied(application_id, payload.applied)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="mark_applied",
        entity_type="application",
        entity_id=application_id,
        metadata={"applied": payload.applied},
    )
    return application


@app.post("/api/v1/applications/{application_id}/mark-email-sent", response_model=Application)
def mark_application_email_sent_route(
    application_id: str,
    payload: ApplicationMarkEmailSent,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    application = repo.mark_application_email_sent(application_id, payload.sent)
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="mark_email_sent",
        entity_type="application",
        entity_id=application_id,
        metadata={"sent": payload.sent},
    )
    return application


@app.post(
    "/api/v1/applications/{application_id}/clear-to-company-research-pending",
    response_model=Application,
)
def clear_application_to_company_research_pending_route(
    application_id: str,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    """Remove all per-profile rows and their emails; set status to initial workflow for the company (ppa_pending if indexed, else company_research_pending)."""
    application = repo.clear_application_to_company_research_pending(application_id)
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="clear_to_company_research_pending",
        entity_type="application",
        entity_id=application_id,
        metadata={},
    )
    return application


@app.delete("/api/v1/applications/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(
    application_id: str,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Response:
    deleted = repo.delete_application(application_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="delete",
        entity_type="application",
        entity_id=application_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/v1/applications/{application_id}/per-profile-applications",
    response_model=list[PerProfileApplication],
)
def list_per_profile_apps(
    application_id: str,
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[PerProfileApplication]:
    if not repo.get_application(application_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return repo.list_per_profile_for_application(application_id)


@app.post(
    "/api/v1/applications/{application_id}/per-profile-applications",
    response_model=PerProfileApplication,
    status_code=status.HTTP_201_CREATED,
)
def create_per_profile_app(
    application_id: str,
    payload: PerProfileApplicationCreate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> PerProfileApplication:
    if payload.application_id != application_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="application_id mismatch")
    try:
        ppa = repo.create_per_profile_application(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="create",
        entity_type="per_profile_application",
        entity_id=ppa.id,
    )
    return ppa


@app.put("/api/v1/per-profile-applications/{ppa_id}", response_model=PerProfileApplication)
def update_per_profile_app(
    ppa_id: str,
    payload: PerProfileApplicationUpdate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> PerProfileApplication:
    try:
        ppa = repo.update_per_profile_application(ppa_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not ppa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="update",
        entity_type="per_profile_application",
        entity_id=ppa_id,
    )
    return ppa


@app.delete("/api/v1/per-profile-applications/{ppa_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_per_profile_app(
    ppa_id: str,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Response:
    deleted = repo.delete_per_profile_application(ppa_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="delete",
        entity_type="per_profile_application",
        entity_id=ppa_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/v1/per-profile-applications/{ppa_id}/emails",
    response_model=list[Email],
)
def list_emails(
    ppa_id: str,
    _: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[Email]:
    if not repo.get_per_profile_application(ppa_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return repo.list_emails_for_ppa(ppa_id)


@app.post(
    "/api/v1/per-profile-applications/{ppa_id}/emails",
    response_model=Email,
    status_code=status.HTTP_201_CREATED,
)
def create_email_route(
    ppa_id: str,
    payload: EmailCreate,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Email:
    if payload.per_profile_application_id != ppa_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ppa id mismatch")
    try:
        email = repo.create_email(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="create",
        entity_type="email",
        entity_id=email.id,
    )
    return email


@app.post("/api/v1/emails/{email_id}/mark-sent", response_model=Email)
def mark_email_sent_route(
    email_id: str,
    payload: EmailMarkSent,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Email:
    email = repo.mark_email_sent(email_id, payload.sent)
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="mark_sent",
        entity_type="email",
        entity_id=email_id,
        metadata={"sent": payload.sent},
    )
    return email


@app.delete("/api/v1/emails/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_email_route(
    email_id: str,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Response:
    deleted = repo.delete_email(email_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    _audit(
        repo,
        actor_type=ActorType.user,
        actor_id=user.id,
        action="delete",
        entity_type="email",
        entity_id=email_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get(
    "/api/v1/notifications",
    response_model=list[UserNotification],
    response_model_by_alias=True,
)
def list_notifications_route(
    skip: int = 0,
    limit: int = 50,
    unread_only: bool = False,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> list[UserNotification]:
    rows = repo.list_notifications(
        user.id, NotificationListQuery(skip=skip, limit=limit, unread_only=unread_only)
    )
    return [enrich_notification_link(repo, user.id, n) for n in rows]


@app.post("/api/v1/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def read_notification(
    notification_id: str,
    user: UserInDB = Depends(get_current_user),
    repo: BaseRepository = Depends(get_repository),
) -> Response:
    updated = repo.mark_notification_read(user.id, notification_id)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/v1/audit-events", response_model=list[AuditEvent])
def list_audit(
    skip: int = 0,
    limit: int = 100,
    actor_type: ActorType | None = None,
    entity_type: str | None = None,
    from_ts: str | None = None,
    to_ts: str | None = None,
    _: UserInDB = Depends(get_current_admin),
    repo: BaseRepository = Depends(get_repository),
):
    def _parse(ts: str | None):
        if not ts:
            return None
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))

    q = AuditListQuery(
        skip=skip,
        limit=limit,
        actor_type=actor_type,
        entity_type=entity_type,
        from_ts=_parse(from_ts),
        to_ts=_parse(to_ts),
    )
    return repo.list_audit_events(q)


@app.get("/api/v1/settings/workers", response_model=WorkerStateResponse)
def get_worker_settings_route(
    _: UserInDB = Depends(get_current_admin),
    repo: BaseRepository = Depends(get_repository),
) -> WorkerStateResponse:
    return repo.get_worker_state()


@app.patch("/api/v1/settings/workers", response_model=WorkerSettings)
def patch_worker_settings_route(
    payload: WorkerSettingsUpdate,
    _: UserInDB = Depends(get_current_admin),
    repo: BaseRepository = Depends(get_repository),
) -> WorkerSettings:
    return repo.update_worker_settings(payload)


@app.post("/api/v1/settings/workers/release-all")
def release_all_workers_route(
    payload: WorkerReleaseAllRequest,
    _: UserInDB = Depends(get_current_admin),
    repo: BaseRepository = Depends(get_repository),
) -> dict[str, int]:
    released = repo.release_all_workers(payload.worker_type)
    return {"released": released}


# --- Agent routes ---

_AGENT_WORKER_PATH: dict[str, WorkerType] = {
    "company-researcher": WorkerType.company_researcher,
    "ppa-analyser": WorkerType.ppa_analyser,
    "application-drafter": WorkerType.application_drafter,
}


def _agent_worker_type_from_path(segment: str) -> WorkerType:
    wt = _AGENT_WORKER_PATH.get(segment)
    if wt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown worker type")
    return wt


@app.get("/api/v1/agent/health", response_model=AgentHealthResponse)
def agent_health(
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> AgentHealthResponse:
    require_agent_scope(agent, "read")
    try:
        repo.list_companies(0, 1, None)
    except Exception:
        return AgentHealthResponse(database="error")
    return AgentHealthResponse(database="ok")


@app.get(
    "/api/v1/agent/applications/company-research-pending",
    response_model=list[Application],
)
def agent_list_company_research_pending(
    limit: int = Query(default=5, ge=1, le=50),
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Application]:
    require_agent_scope(agent, "read")
    return repo.list_applications_by_status(ApplicationStatus.company_research_pending, limit)


@app.get("/api/v1/agent/applications/ppa-pending", response_model=list[Application])
def agent_list_ppa_pending(
    limit: int = Query(default=5, ge=1, le=50),
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Application]:
    require_agent_scope(agent, "read")
    return repo.list_applications_by_status(ApplicationStatus.ppa_pending, limit)


@app.get(
    "/api/v1/agent/applications/application-pending",
    response_model=list[Application],
)
def agent_list_application_pending(
    limit: int = Query(default=5, ge=1, le=50),
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Application]:
    require_agent_scope(agent, "read")
    return repo.list_applications_by_status(ApplicationStatus.application_pending, limit)


@app.post(
    "/api/v1/agent/workers/assign/{worker_kind}",
    response_model=WorkerAssignResponse,
)
def agent_assign_worker_by_kind(
    worker_kind: str,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> WorkerAssignResponse:
    require_agent_scope(agent, "write")
    worker_type = _agent_worker_type_from_path(worker_kind)
    try:
        lease_id = repo.assign_worker(worker_type, agent.key_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return WorkerAssignResponse(lease_id=lease_id)


@app.post("/api/v1/agent/workers/release/{worker_kind}")
def agent_release_worker_by_kind(
    worker_kind: str,
    payload: WorkerReleaseRequest,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> dict[str, bool]:
    require_agent_scope(agent, "write")
    worker_type = _agent_worker_type_from_path(worker_kind)
    lease = repo.get_worker_lease(payload.lease_id)
    if lease is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    if lease.agent_key_id != agent.key_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    if lease.worker_type != worker_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lease does not match worker type in path",
        )
    if not repo.release_worker(payload.lease_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lease not found")
    return {"released": True}


@app.get(
    "/api/v1/agent/workers/count/{worker_kind}",
    response_model=WorkerCountResponse,
)
def agent_worker_count(
    worker_kind: str,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> WorkerCountResponse:
    require_agent_scope(agent, "read")
    worker_type = _agent_worker_type_from_path(worker_kind)
    state = repo.get_worker_state()
    key = worker_type.value
    return WorkerCountResponse(active=state.active.get(key, 0), max=state.max.get(key, 0))


@app.get("/api/v1/agent/companies", response_model=list[Company])
def agent_list_companies(
    skip: int = 0,
    limit: int = 100,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Company]:
    require_agent_scope(agent, "read")
    return repo.list_companies(skip=skip, limit=limit, search=None)


@app.get("/api/v1/agent/companies/unindexed", response_model=list[Company])
def agent_list_unindexed_companies(
    limit: int = Query(default=5, ge=1, le=5),
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Company]:
    require_agent_scope(agent, "read")
    return repo.list_companies_unindexed(limit)


@app.patch("/api/v1/agent/companies/bulk", response_model=list[Company])
def agent_bulk_update_companies(
    body: AgentCompaniesBulkUpdateRequest,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Company]:
    require_agent_scope(agent, "write")
    updated: list[Company] = []
    for item in body.updates:
        company = repo.update_company(item.company_id, item.payload)
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Company not found: {item.company_id}",
            )
        _audit(
            repo,
            actor_type=ActorType.agent,
            actor_id=agent.key_id,
            action="bulk_update",
            entity_type="company",
            entity_id=item.company_id,
            metadata={"fields": list(item.payload.model_dump(exclude_none=True).keys())},
        )
        updated.append(company)
    return updated


@app.put("/api/v1/agent/companies/{company_id}", response_model=Company)
def agent_update_company(
    company_id: str,
    payload: CompanyUpdate,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> Company:
    require_agent_scope(agent, "write")
    company = repo.update_company(company_id, payload)
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    _audit(
        repo,
        actor_type=ActorType.agent,
        actor_id=agent.key_id,
        action="update",
        entity_type="company",
        entity_id=company_id,
    )
    return company


@app.get("/api/v1/agent/profiles/ids", response_model=ProfileIdList)
def agent_list_profile_ids(
    skip: int = 0,
    limit: int = Query(default=200, ge=1, le=500),
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> ProfileIdList:
    require_agent_scope(agent, "read")
    return ProfileIdList(profile_ids=repo.list_profile_ids(skip, limit, include_frozen=False))


@app.get("/api/v1/agent/profiles/{profile_id}", response_model=Profile)
def agent_get_profile(
    profile_id: str,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> Profile:
    require_agent_scope(agent, "read")
    profile = repo.get_profile(profile_id)
    if not profile or profile.frozen:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


@app.get("/api/v1/agent/profiles", response_model=list[Profile])
def agent_list_profiles(
    skip: int = 0,
    limit: int = 200,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Profile]:
    require_agent_scope(agent, "read")
    return repo.list_profiles(skip=skip, limit=limit, search=None, include_frozen=False)


@app.get("/api/v1/agent/applications", response_model=list[ApplicationListItem])
def agent_list_applications(
    skip: int = 0,
    limit: int = 200,
    status_filter: ApplicationStatus | None = None,
    exclude_status: ApplicationStatus | None = None,
    company_id: str | None = None,
    applied: bool | None = None,
    email_sent: bool | None = None,
    sort: str = "created_at_desc",
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[ApplicationListItem]:
    require_agent_scope(agent, "read")
    return repo.list_applications(
        skip=skip,
        limit=limit,
        status=status_filter,
        company_id=company_id,
        applied=applied,
        email_sent=email_sent,
        sort=sort,
        exclude_status=exclude_status,
    )


@app.get("/api/v1/agent/applications/{application_id}", response_model=Application)
def agent_get_application(
    application_id: str,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    require_agent_scope(agent, "read")
    application = repo.get_application(application_id)
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return application


@app.get(
    "/api/v1/agent/applications/{application_id}/per-profile-applications",
    response_model=list[PerProfileApplication],
)
def agent_list_per_profile_applications(
    application_id: str,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[PerProfileApplication]:
    require_agent_scope(agent, "read")
    if not repo.get_application(application_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    return repo.list_per_profile_for_application(application_id)


@app.put("/api/v1/agent/applications/{application_id}", response_model=Application)
def agent_update_application(
    application_id: str,
    payload: ApplicationUpdate,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> Application:
    require_agent_scope(agent, "write")
    before = repo.get_application(application_id)
    try:
        application = repo.update_application(application_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")
    _audit(
        repo,
        actor_type=ActorType.agent,
        actor_id=agent.key_id,
        action="update",
        entity_type="application",
        entity_id=application_id,
        metadata={"fields": list(payload.model_dump(exclude_none=True).keys())},
    )
    notify_if_preparation_ready(repo, before, application)
    return application


@app.post(
    "/api/v1/agent/per-profile-applications",
    response_model=PerProfileApplication,
    status_code=status.HTTP_201_CREATED,
)
def agent_create_ppa(
    payload: PerProfileApplicationCreate,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> PerProfileApplication:
    require_agent_scope(agent, "write")
    try:
        ppa = repo.create_per_profile_application(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _audit(
        repo,
        actor_type=ActorType.agent,
        actor_id=agent.key_id,
        action="create",
        entity_type="per_profile_application",
        entity_id=ppa.id,
    )
    return ppa


@app.put("/api/v1/agent/per-profile-applications/{ppa_id}", response_model=PerProfileApplication)
def agent_update_ppa(
    ppa_id: str,
    payload: PerProfileApplicationUpdate,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> PerProfileApplication:
    require_agent_scope(agent, "write")
    try:
        ppa = repo.update_per_profile_application(ppa_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not ppa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    _audit(
        repo,
        actor_type=ActorType.agent,
        actor_id=agent.key_id,
        action="update",
        entity_type="per_profile_application",
        entity_id=ppa_id,
    )
    return ppa


@app.post(
    "/api/v1/agent/emails",
    response_model=Email,
    status_code=status.HTTP_201_CREATED,
)
def agent_create_email(
    payload: EmailCreate,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> Email:
    require_agent_scope(agent, "write")
    try:
        email = repo.create_email(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _audit(
        repo,
        actor_type=ActorType.agent,
        actor_id=agent.key_id,
        action="create",
        entity_type="email",
        entity_id=email.id,
    )
    return email


@app.post(
    "/api/v1/agent/notifications",
    response_model=UserNotification,
    response_model_by_alias=True,
    status_code=status.HTTP_201_CREATED,
)
def agent_create_notification(
    body: AgentNotificationCreate,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> UserNotification:
    require_agent_scope(agent, "write")
    if not repo.get_user(body.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    note = repo.create_notification(
        user_id=body.user_id,
        notification=body.notification,
        notification_type=body.notification_type,
        timestamp=body.timestamp,
        check=body.check,
        payload=body.payload,
    )
    _audit(
        repo,
        actor_type=ActorType.agent,
        actor_id=agent.key_id,
        action="create",
        entity_type="notification",
        entity_id=note.id,
    )
    return enrich_notification_link(repo, body.user_id, note)


@app.get("/api/v1/agent/industries", response_model=list[Industry])
def agent_list_industries(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    search: str | None = None,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Industry]:
    require_agent_scope(agent, "read")
    return repo.list_industries(skip=skip, limit=limit, search=search)


@app.post("/api/v1/agent/industries", response_model=Industry, status_code=status.HTTP_201_CREATED)
def agent_create_industry(
    payload: IndustryCreate,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> Industry:
    require_agent_scope(agent, "write")
    try:
        industry = repo.create_industry(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    _audit(
        repo,
        actor_type=ActorType.agent,
        actor_id=agent.key_id,
        action="create",
        entity_type="industry",
        entity_id=industry.id,
    )
    return industry


@app.post("/api/v1/agent/industries/bulk", response_model=list[Industry], status_code=status.HTTP_201_CREATED)
def agent_bulk_create_industries(
    body: AgentIndustriesBulkCreateRequest,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> list[Industry]:
    require_agent_scope(agent, "write")
    _validate_bulk_industry_names(repo, [item.name for item in body.industries])

    created: list[Industry] = []
    for item in body.industries:
        industry = repo.create_industry(item)
        _audit(
            repo,
            actor_type=ActorType.agent,
            actor_id=agent.key_id,
            action="bulk_create",
            entity_type="industry",
            entity_id=industry.id,
        )
        created.append(industry)
    return created


@app.put("/api/v1/agent/industries/{industry_id}", response_model=Industry)
def agent_update_industry(
    industry_id: str,
    payload: IndustryUpdate,
    agent: AgentContext = Depends(get_agent_context),
    repo: BaseRepository = Depends(get_repository),
) -> Industry:
    require_agent_scope(agent, "write")
    industry = repo.update_industry(industry_id, payload)
    if not industry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Industry not found")
    _audit(
        repo,
        actor_type=ActorType.agent,
        actor_id=agent.key_id,
        action="update",
        entity_type="industry",
        entity_id=industry_id,
    )
    return industry

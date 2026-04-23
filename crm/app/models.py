from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ApplicationStatus(str, Enum):
    company_research_pending = "company_research_pending"
    company_researching = "company_researching"
    ppa_pending = "ppa_pending"
    ppa_analyzing = "ppa_analyzing"
    application_pending = "application_pending"
    application_drafting = "application_drafting"
    application_ready = "application_ready"
    invalid = "invalid"
    archived = "archived"


ALLOWED_APPLICATION_TRANSITIONS: dict[ApplicationStatus, set[ApplicationStatus]] = {
    ApplicationStatus.company_research_pending: {
        ApplicationStatus.company_researching,
        ApplicationStatus.ppa_pending,
        ApplicationStatus.invalid,
        ApplicationStatus.archived,
    },
    ApplicationStatus.company_researching: {
        ApplicationStatus.ppa_pending,
        ApplicationStatus.company_research_pending,
        ApplicationStatus.invalid,
        ApplicationStatus.archived,
    },
    ApplicationStatus.ppa_pending: {
        ApplicationStatus.ppa_analyzing,
        ApplicationStatus.application_pending,
        ApplicationStatus.application_ready,
        ApplicationStatus.invalid,
        ApplicationStatus.archived,
    },
    ApplicationStatus.ppa_analyzing: {
        ApplicationStatus.ppa_pending,
        ApplicationStatus.application_pending,
        ApplicationStatus.application_ready,
        ApplicationStatus.invalid,
        ApplicationStatus.archived,
    },
    ApplicationStatus.application_pending: {
        ApplicationStatus.application_drafting,
        ApplicationStatus.application_ready,
        ApplicationStatus.invalid,
        ApplicationStatus.archived,
    },
    ApplicationStatus.application_drafting: {
        ApplicationStatus.application_pending,
        ApplicationStatus.application_ready,
        ApplicationStatus.invalid,
        ApplicationStatus.archived,
    },
    ApplicationStatus.application_ready: {
        ApplicationStatus.archived,
        ApplicationStatus.invalid,
    },
    ApplicationStatus.invalid: {ApplicationStatus.archived},
    ApplicationStatus.archived: set(),
}


def migrate_legacy_application_status(raw: str) -> tuple[ApplicationStatus, bool | None]:
    """Map stored status strings to the current enum. Returns (status, applied_override or None)."""
    legacy = {
        "draft": ApplicationStatus.company_research_pending,
        "pending_preparation": ApplicationStatus.company_research_pending,
        "researching": ApplicationStatus.company_researching,
        "analysis_ready": ApplicationStatus.ppa_pending,
        "preparation_ready": ApplicationStatus.application_ready,
        "applied": ApplicationStatus.application_ready,
        "company_research_pending": ApplicationStatus.company_research_pending,
        "company_researching": ApplicationStatus.company_researching,
        "ppa_pending": ApplicationStatus.ppa_pending,
        "ppa_analyzing": ApplicationStatus.ppa_analyzing,
        "application_pending": ApplicationStatus.application_pending,
        "application_drafting": ApplicationStatus.application_drafting,
        "application_ready": ApplicationStatus.application_ready,
        "invalid": ApplicationStatus.invalid,
        "archived": ApplicationStatus.archived,
    }
    if raw in legacy:
        applied_hint = True if raw == "applied" else None
        return legacy[raw], applied_hint
    try:
        return ApplicationStatus(raw), None
    except ValueError:
        return ApplicationStatus.company_research_pending, None


def validate_application_transition(
    current: ApplicationStatus, target: ApplicationStatus
) -> bool:
    if current == target:
        return True
    return target in ALLOWED_APPLICATION_TRANSITIONS[current]


class ActorType(str, Enum):
    user = "user"
    agent = "agent"


class WorkMode(str, Enum):
    onsite = "onsite"
    hybrid = "hybrid"
    remote_us = "remote_us"
    remote_eu = "remote_eu"
    remote_global = "remote_global"
    other = "other"


class ColdEmailPlanStatus(str, Enum):
    none = "none"
    received = "received"
    timed_out = "timed_out"
    down = "down"


class EmailKind(str, Enum):
    cold = "cold"
    follow_up = "follow_up"


class EmailLifecycleStatus(str, Enum):
    drafted = "drafted"
    sent = "sent"
    received = "received"
    timed_out = "timed_out"
    failed = "failed"


class UserRole(str, Enum):
    admin = "admin"
    user = "user"


def _normalize_user_role_payload(data: Any) -> Any:
    if not isinstance(data, dict):
        return data
    role = data.get("role")
    admin = data.get("admin")
    if role in (None, ""):
        if isinstance(admin, bool):
            data["role"] = UserRole.admin.value if admin else UserRole.user.value
    if admin is None and isinstance(role, (str, UserRole)):
        role_value = role.value if isinstance(role, UserRole) else role
        data["admin"] = role_value == UserRole.admin.value
    return data


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    role: UserRole = UserRole.user
    admin: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_role(cls, data: Any) -> Any:
        return _normalize_user_role_payload(data)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: UserRole = UserRole.user
    admin: bool
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _normalize_role(cls, data: Any) -> Any:
        return _normalize_user_role_payload(data)


class UserInDB(BaseModel):
    id: str
    name: str
    email: EmailStr
    password_hash: str
    role: UserRole = UserRole.user
    admin: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    @model_validator(mode="before")
    @classmethod
    def _normalize_role(cls, data: Any) -> Any:
        return _normalize_user_role_payload(data)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class RegistrationStatus(BaseModel):
    registration_open: bool


class EducationEntry(BaseModel):
    university_name: str = Field(min_length=1)
    from_year: int | None = None
    to_year: int | None = None


class AnalysisLink(BaseModel):
    topic: str
    link: str


class IndustryBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""


class IndustryCreate(IndustryBase):
    pass


class IndustryBulkCreateRequest(BaseModel):
    industries: list[IndustryCreate] = Field(min_length=1, max_length=50)


class IndustryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class Industry(IndustryBase):
    id: str
    created_at: datetime
    updated_at: datetime


class CompanyResearchStatus(str, Enum):
    pending = "pending"
    indexing = "indexing"
    indexed = "indexed"
    invalid = "invalid"


class CompanyBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    research_status: CompanyResearchStatus = CompanyResearchStatus.pending
    website: str | None = None
    linkedin: str | None = None
    industry_ids: list[str] = Field(default_factory=list)
    hq_locations: list[str] = Field(default_factory=list)
    employee_count_text: str | None = None
    actively_hiring: bool | None = None
    work_mode: WorkMode | None = None
    work_mode_description: str | None = None
    overview: str | None = None
    full_product_detail: str | None = None
    full_hiring_detail: str | None = None
    full_organization_detail: str | None = None
    analysis_links: list[AnalysisLink] = Field(default_factory=list)
    enrichment_source_links: list[str] = Field(default_factory=list)


class CompanyCreate(CompanyBase):
    """`acknowledge_reuse_of_archived_company` is API-only (not stored on Company)."""

    acknowledge_reuse_of_archived_company: bool = False

    @model_validator(mode="before")
    @classmethod
    def _legacy_indexed_create(cls, data: Any) -> Any:
        if isinstance(data, dict) and "indexed" in data and "research_status" not in data:
            data["research_status"] = (
                CompanyResearchStatus.indexed.value if data.get("indexed") else CompanyResearchStatus.pending.value
            )
            data.pop("indexed", None)
        if isinstance(data, dict):
            if not data.get("full_product_detail") and data.get("full_overview") is not None:
                data["full_product_detail"] = data.get("full_overview")
            data.pop("full_overview", None)
        return data


class CompanyUpdate(BaseModel):
    name: str | None = None
    research_status: CompanyResearchStatus | None = None
    website: str | None = None
    linkedin: str | None = None
    industry_ids: list[str] | None = None
    hq_locations: list[str] | None = None
    employee_count_text: str | None = None
    actively_hiring: bool | None = None
    work_mode: WorkMode | None = None
    work_mode_description: str | None = None
    overview: str | None = None
    full_product_detail: str | None = None
    full_hiring_detail: str | None = None
    full_organization_detail: str | None = None
    analysis_links: list[AnalysisLink] | None = None
    enrichment_source_links: list[str] | None = None

    @model_validator(mode="before")
    @classmethod
    def _legacy_indexed_update(cls, data: Any) -> Any:
        if isinstance(data, dict) and data.get("indexed") is not None and data.get("research_status") is None:
            data["research_status"] = (
                CompanyResearchStatus.indexed.value if data.get("indexed") else CompanyResearchStatus.pending.value
            )
        if isinstance(data, dict) and "indexed" in data:
            data.pop("indexed", None)
        if isinstance(data, dict):
            if not data.get("full_product_detail") and data.get("full_overview") is not None:
                data["full_product_detail"] = data.get("full_overview")
            data.pop("full_overview", None)
        return data


class CompanyApplicationCountResponse(BaseModel):
    count: int


class CompanyArchiveResponse(BaseModel):
    applications_archived: int


class CompanyArchiveRequest(BaseModel):
    archive_reason: str = Field(min_length=1, max_length=2000)


class ClearCompanyResearchDetailRequest(BaseModel):
    """How to handle applications tied to the company when clearing research status."""

    related_applications: Literal["none", "archive", "reset"] = "none"


class Company(CompanyBase):
    id: str
    created_at: datetime
    updated_at: datetime
    has_application: bool = Field(
        default=False,
        description="True when at least one application exists for this company (set by API when listing/reading).",
    )
    archived: bool = False
    archived_at: datetime | None = None
    archive_reason: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _legacy_indexed_field(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "research_status" not in data and "indexed" in data:
            data["research_status"] = (
                CompanyResearchStatus.indexed.value if data.get("indexed") else CompanyResearchStatus.pending.value
            )
        if not data.get("full_product_detail") and data.get("full_overview") is not None:
            data["full_product_detail"] = data.get("full_overview")
        data.pop("full_overview", None)
        return data


class ProfileBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    frozen: bool = False
    location: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    educations: list[EducationEntry] = Field(default_factory=list)
    bio_md: str | None = None
    niche_info_md: str | None = None
    resume_md: str | None = None


class ProfileCreate(BaseModel):
    """Create payload: all fields required except resume_md (optional)."""

    name: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1)
    email: EmailStr
    phone: str = Field(min_length=1)
    educations: list[EducationEntry] = Field(min_length=1)
    bio_md: str = Field(min_length=1)
    niche_info_md: str = Field(min_length=1)
    resume_md: str | None = None


class ProfileUpdate(BaseModel):
    name: str | None = None
    frozen: bool | None = None
    location: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    educations: list[EducationEntry] | None = None
    bio_md: str | None = None
    niche_info_md: str | None = None
    resume_md: str | None = None


class Profile(ProfileBase):
    id: str
    created_at: datetime
    updated_at: datetime


class ProfileListItem(BaseModel):
    id: str
    name: str
    frozen: bool = False
    location: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    created_at: datetime
    updated_at: datetime


class JobPost(BaseModel):
    job_link: str | None = None
    job_description: str | None = None


class ApplicationBase(BaseModel):
    company_id: str
    job_post: JobPost | None = None
    status: ApplicationStatus = ApplicationStatus.company_research_pending
    notes: str | None = None


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationBootstrapCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    company_website: str | None = None
    job_post: JobPost | None = None
    acknowledge_reuse_of_archived_company: bool = False


class ApplicationUpdate(BaseModel):
    company_id: str | None = None
    job_post: JobPost | None = None
    status: ApplicationStatus | None = None
    notes: str | None = None
    archive_reason: str | None = Field(
        default=None, description="Optional when setting status to archived (why removed)."
    )
    force_transition: bool | None = Field(
        default=None,
        description="When true, set status without validating the normal workflow transition graph.",
    )


class ApplicationMarkApplied(BaseModel):
    applied: bool
    force: bool = False


class ApplicationMarkEmailSent(BaseModel):
    sent: bool


class EmailMarkSent(BaseModel):
    sent: bool


class DashboardMetrics(BaseModel):
    company_research_pipeline: int
    application_ready: int
    actions_need_review: int
    unread_notifications: int


class WorkerType(str, Enum):
    company_researcher = "company_researcher"
    ppa_analyser = "ppa_analyser"
    application_drafter = "application_drafter"


class WorkerSettings(BaseModel):
    max_company_researcher: int = Field(default=1, ge=0, le=100)
    max_ppa_analyser: int = Field(default=1, ge=0, le=100)
    max_application_drafter: int = Field(default=1, ge=0, le=100)


class WorkerSettingsUpdate(BaseModel):
    max_company_researcher: int | None = Field(default=None, ge=0, le=100)
    max_ppa_analyser: int | None = Field(default=None, ge=0, le=100)
    max_application_drafter: int | None = Field(default=None, ge=0, le=100)


class WorkerLease(BaseModel):
    id: str
    worker_type: WorkerType
    agent_key_id: str
    created_at: datetime


class WorkerAssignResponse(BaseModel):
    lease_id: str


class WorkerCountResponse(BaseModel):
    """Active leases and configured max for one worker type (agent read)."""

    active: int
    max: int


class WorkerReleaseRequest(BaseModel):
    lease_id: str


class WorkerReleaseAllRequest(BaseModel):
    worker_type: WorkerType


class WorkerStateResponse(BaseModel):
    settings: WorkerSettings
    active: dict[str, int]
    max: dict[str, int]


class Application(BaseModel):
    id: str
    company_id: str
    job_post: JobPost | None = None
    status: ApplicationStatus
    applied: bool = False
    applied_at: datetime | None = None
    email_sent: bool = False
    email_sent_at: datetime | None = None
    notes: str | None = None
    archive_reason: str | None = None
    created_by_user_id: str | None = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def _migrate_legacy_status(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        raw = data.get("status")
        if isinstance(raw, str):
            new_status, applied_hint = migrate_legacy_application_status(raw)
            data["status"] = new_status.value
            if applied_hint is True:
                data["applied"] = True
        return data


class ColdEmailRecipient(BaseModel):
    title: str
    name: str
    email: str | None = None
    timezone: str | None = None


class ColdEmailPlan(BaseModel):
    subjects: list[str] = Field(default_factory=list)
    selected_subject_index: int = 0
    to: ColdEmailRecipient | None = None
    status: ColdEmailPlanStatus = ColdEmailPlanStatus.none


class PerProfileApplicationBase(BaseModel):
    application_id: str
    profile_id: str
    order_index: int = 0
    fit_score: float | None = Field(default=None, ge=0, le=100)
    analysis: str = ""
    tailored_resume_link: str | None = None
    cold_email_plan: ColdEmailPlan | None = None
    applied: bool = False
    applied_at: datetime | None = None


class PerProfileApplicationCreate(PerProfileApplicationBase):
    pass


class PerProfileApplicationUpdate(BaseModel):
    profile_id: str | None = None
    order_index: int | None = None
    fit_score: float | None = Field(default=None, ge=0, le=100)
    analysis: str | None = None
    tailored_resume_link: str | None = None
    cold_email_plan: ColdEmailPlan | None = None
    applied: bool | None = None
    applied_at: datetime | None = None


class PerProfileApplication(PerProfileApplicationBase):
    id: str
    created_at: datetime
    updated_at: datetime


class AppliedProfileName(BaseModel):
    """Profile display for application list: PPA has a real resume link, cold email plan, and/or substantive email draft."""

    profile_name: str


class ApplicationListItem(Application):
    """Application with resolved profile display names for each per-profile row."""

    company_name: str
    applied_profiles: list[AppliedProfileName] = Field(default_factory=list)


class PerProfileApplicationDetail(PerProfileApplication):
    """Per-profile row with resolved display name and nested emails for detail view."""

    profile_name: str
    emails: list["Email"] = Field(default_factory=list)


class ApplicationDetailResponse(BaseModel):
    application: Application
    company: Company
    per_profile_applications: list[PerProfileApplicationDetail] = Field(default_factory=list)


class EmailBase(BaseModel):
    per_profile_application_id: str
    kind: EmailKind
    content: str
    lifecycle_status: EmailLifecycleStatus = EmailLifecycleStatus.drafted
    sent: bool = False
    sent_at: datetime | None = None


class EmailCreate(EmailBase):
    pass


class EmailUpdate(BaseModel):
    content: str | None = None
    lifecycle_status: EmailLifecycleStatus | None = None
    sent: bool | None = None
    sent_at: datetime | None = None


class Email(EmailBase):
    id: str
    created_at: datetime
    updated_at: datetime


class AuditEvent(BaseModel):
    id: str
    actor_type: ActorType
    actor_id: str
    action: str
    entity_type: str
    entity_id: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class NotificationKind(str, Enum):
    APPLICATION_UPDATE = "APPLICATION_UPDATE"
    COMPANY_UPDATE = "COMPANY_UPDATE"
    SYSTEM_ERROR = "SYSTEM_ERROR"
    FOLLOW_UP_DRAFT = "FOLLOW_UP_DRAFT"


class NotificationSeverity(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    WARN = "WARN"


class NotificationPayload(BaseModel):
    """Entity id when applicable; optional for some SYSTEM_ERROR cases."""

    id: str | None = None
    message: str = Field(min_length=1)


class NotificationBulkDelete(BaseModel):
    ids: list[str] = Field(min_length=1)


class UserNotification(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    user_id: str
    notification: NotificationKind
    notification_type: NotificationSeverity = Field(alias="type")
    timestamp: datetime
    check: bool = False
    payload: NotificationPayload
    read_at: datetime | None = None
    created_at: datetime
    link: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _coerce_legacy_notification(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "notification" in data and "payload" in data:
            return data
        if "kind" not in data:
            return data
        link = data.get("link") or ""
        import re

        m = re.search(r"/applications/([^/?#]+)", link)
        app_id = m.group(1) if m else None
        kind = str(data.get("kind", ""))
        notif = (
            NotificationKind.APPLICATION_UPDATE.value
            if kind in ("preparation_ready", "application_ready")
            else NotificationKind.SYSTEM_ERROR.value
        )
        title = data.get("title") or ""
        body = data.get("body") or ""
        message = f"{title}\n{body}".strip() if title and body else (title or body or "Notification")
        ts = data.get("timestamp") or data.get("created_at")
        if ts is None:
            ts = utcnow()
        pid: str | None = app_id if notif == NotificationKind.APPLICATION_UPDATE.value else None
        return {
            "id": data["id"],
            "user_id": data["user_id"],
            "notification": notif,
            "type": NotificationSeverity.SUCCESS.value,
            "timestamp": ts,
            "check": False,
            "payload": {"id": pid, "message": message},
            "read_at": data.get("read_at"),
            "created_at": data.get("created_at", ts),
            "link": data.get("link"),
        }


class AgentApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    scopes: list[str] = Field(default_factory=lambda: ["read", "write"])


class AgentApiKeyPublic(BaseModel):
    id: str
    name: str
    scopes: list[str]
    created_at: datetime
    last_used_at: datetime | None = None


class AgentApiKeyCreated(AgentApiKeyPublic):
    raw_key: str


class AgentApiKeyInDB(BaseModel):
    id: str
    name: str
    key_hash: str
    scopes: list[str]
    created_at: datetime = Field(default_factory=utcnow)
    last_used_at: datetime | None = None


class AgentContext(BaseModel):
    key_id: str
    scopes: list[str]


class AgentHealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    api: Literal["ok"] = "ok"
    database: Literal["ok", "error"]


class ProfileIdList(BaseModel):
    profile_ids: list[str]


class AgentCompanyUpdateItem(BaseModel):
    company_id: str = Field(min_length=1)
    payload: CompanyUpdate


class AgentCompaniesBulkUpdateRequest(BaseModel):
    updates: list[AgentCompanyUpdateItem] = Field(min_length=1, max_length=50)


class AgentIndustriesBulkCreateRequest(BaseModel):
    industries: list[IndustryCreate] = Field(min_length=1, max_length=50)


class AgentNotificationCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(min_length=1)
    notification: NotificationKind
    notification_type: NotificationSeverity = Field(alias="type")
    timestamp: datetime | None = None
    check: bool = False
    payload: NotificationPayload

    @model_validator(mode="after")
    def _require_payload_id_when_needed(self) -> AgentNotificationCreate:
        nid = self.notification
        pid = self.payload.id
        if nid in (
            NotificationKind.APPLICATION_UPDATE,
            NotificationKind.COMPANY_UPDATE,
            NotificationKind.FOLLOW_UP_DRAFT,
        ):
            if not pid or not str(pid).strip():
                raise ValueError(f"payload.id is required for {nid.value}")
        return self


class GlobalSearchResult(BaseModel):
    companies: list[Company]
    profiles: list[Profile]
    applications: list[Application]


class ApplicationListQuery(BaseModel):
    skip: int = 0
    limit: int = 50
    status: ApplicationStatus | None = None
    exclude_status: ApplicationStatus | None = None
    company_id: str | None = None
    applied: bool | None = None
    email_sent: bool | None = None
    sort: Literal["created_at_desc", "created_at_asc", "updated_at_desc"] = "created_at_desc"


class AuditListQuery(BaseModel):
    skip: int = 0
    limit: int = 100
    actor_type: ActorType | None = None
    entity_type: str | None = None
    from_ts: datetime | None = None
    to_ts: datetime | None = None


class NotificationListQuery(BaseModel):
    skip: int = 0
    limit: int = 50
    unread_only: bool = False

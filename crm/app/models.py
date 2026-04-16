from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ApplicationStatus(str, Enum):
    draft = "draft"
    pending_preparation = "pending_preparation"
    researching = "researching"
    analysis_ready = "analysis_ready"
    preparation_ready = "preparation_ready"
    applied = "applied"
    archived = "archived"


ALLOWED_APPLICATION_TRANSITIONS: dict[ApplicationStatus, set[ApplicationStatus]] = {
    ApplicationStatus.draft: {ApplicationStatus.pending_preparation, ApplicationStatus.archived},
    ApplicationStatus.pending_preparation: {
        ApplicationStatus.researching,
        ApplicationStatus.analysis_ready,
        ApplicationStatus.preparation_ready,
        ApplicationStatus.archived,
    },
    ApplicationStatus.researching: {
        ApplicationStatus.analysis_ready,
        ApplicationStatus.preparation_ready,
        ApplicationStatus.archived,
    },
    ApplicationStatus.analysis_ready: {
        ApplicationStatus.preparation_ready,
        ApplicationStatus.applied,
        ApplicationStatus.archived,
    },
    ApplicationStatus.preparation_ready: {ApplicationStatus.applied, ApplicationStatus.archived},
    ApplicationStatus.applied: {ApplicationStatus.archived},
    ApplicationStatus.archived: set(),
}


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


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=8)
    admin: bool = False


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    name: str
    email: EmailStr
    admin: bool
    created_at: datetime
    updated_at: datetime


class UserInDB(BaseModel):
    id: str
    name: str
    email: EmailStr
    password_hash: str
    admin: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


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


class IndustryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class Industry(IndustryBase):
    id: str
    created_at: datetime
    updated_at: datetime


class CompanyBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    indexed: bool = False
    website: str | None = None
    linkedin: str | None = None
    industry_ids: list[str] = Field(default_factory=list)
    hq_locations: list[str] = Field(default_factory=list)
    employee_count_text: str | None = None
    actively_hiring: bool | None = None
    work_mode: WorkMode | None = None
    work_mode_description: str | None = None
    overview: str | None = None
    analysis_links: list[AnalysisLink] = Field(default_factory=list)
    enrichment_source_links: list[str] = Field(default_factory=list)


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: str | None = None
    indexed: bool | None = None
    website: str | None = None
    linkedin: str | None = None
    industry_ids: list[str] | None = None
    hq_locations: list[str] | None = None
    employee_count_text: str | None = None
    actively_hiring: bool | None = None
    work_mode: WorkMode | None = None
    work_mode_description: str | None = None
    overview: str | None = None
    analysis_links: list[AnalysisLink] | None = None
    enrichment_source_links: list[str] | None = None


class Company(CompanyBase):
    id: str
    created_at: datetime
    updated_at: datetime


class ProfileBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
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


class JobPost(BaseModel):
    job_link: str | None = None
    job_description: str | None = None


class ApplicationBase(BaseModel):
    company_id: str
    job_post: JobPost | None = None
    status: ApplicationStatus = ApplicationStatus.pending_preparation
    notes: str | None = None


class ApplicationCreate(ApplicationBase):
    pass


class ApplicationBootstrapCreate(BaseModel):
    company_name: str = Field(min_length=1, max_length=200)
    company_website: str | None = None
    job_post: JobPost | None = None


class ApplicationUpdate(BaseModel):
    company_id: str | None = None
    job_post: JobPost | None = None
    status: ApplicationStatus | None = None
    notes: str | None = None
    archive_reason: str | None = Field(
        default=None, description="Optional when setting status to archived (why removed)."
    )


class ApplicationMarkApplied(BaseModel):
    applied: bool


class ApplicationMarkEmailSent(BaseModel):
    sent: bool


class DashboardMetrics(BaseModel):
    pending_preparation: int
    preparation_ready: int
    actions_need_review: int
    unread_notifications: int


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


class ColdEmailRecipient(BaseModel):
    title: str
    name: str
    email: str | None = None


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
    """Profile display for application list (per-profile applied)."""

    profile_id: str
    profile_name: str


class ApplicationListItem(Application):
    """Application with resolved names for profiles marked applied on per-profile rows."""

    applied_profiles: list[AppliedProfileName] = Field(default_factory=list)


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
            if kind == "preparation_ready"
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

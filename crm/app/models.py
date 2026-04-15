from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


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


class EducationEntry(BaseModel):
    university_name: str
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


class ProfileCreate(ProfileBase):
    pass


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
    status: ApplicationStatus = ApplicationStatus.draft
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


class PerProfileApplicationCreate(PerProfileApplicationBase):
    pass


class PerProfileApplicationUpdate(BaseModel):
    profile_id: str | None = None
    order_index: int | None = None
    fit_score: float | None = Field(default=None, ge=0, le=100)
    analysis: str | None = None
    tailored_resume_link: str | None = None
    cold_email_plan: ColdEmailPlan | None = None


class PerProfileApplication(PerProfileApplicationBase):
    id: str
    created_at: datetime
    updated_at: datetime


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


class UserNotification(BaseModel):
    id: str
    user_id: str
    kind: str
    title: str
    body: str
    link: str | None = None
    read_at: datetime | None = None
    created_at: datetime


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


class GlobalSearchResult(BaseModel):
    companies: list[Company]
    profiles: list[Profile]
    applications: list[Application]


class ApplicationListQuery(BaseModel):
    skip: int = 0
    limit: int = 50
    status: ApplicationStatus | None = None
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

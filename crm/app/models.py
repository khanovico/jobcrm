from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal

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


class CompanyBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    website: str | None = None
    linkedin: str | None = None
    overview: str | None = None


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: str | None = None
    website: str | None = None
    linkedin: str | None = None
    overview: str | None = None


class Company(CompanyBase):
    id: str
    created_at: datetime
    updated_at: datetime


class ProfileBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
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


class ApplicationUpdate(BaseModel):
    company_id: str | None = None
    job_post: JobPost | None = None
    status: ApplicationStatus | None = None
    notes: str | None = None


class ApplicationMarkApplied(BaseModel):
    applied: bool


class Application(BaseModel):
    id: str
    company_id: str
    job_post: JobPost | None = None
    status: ApplicationStatus
    applied: bool = False
    applied_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime

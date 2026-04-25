from __future__ import annotations

import re
from collections.abc import Iterable
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from typing import Literal
from uuid import uuid4

from pymongo import DeleteOne, MongoClient, ReplaceOne

from app.company_name import normalize_company_name
from app.config import settings
from app.models import (
    AgentApiKeyCreate,
    AgentApiKeyInDB,
    AgentApplicationTaskSummary,
    AgentCompanyResearchTaskSummary,
    AppliedProfileName,
    Application,
    ApplicationBootstrapCreate,
    ApplicationCreate,
    ApplicationListItem,
    ApplicationStatus,
    ApplicationUpdate,
    AuditEvent,
    AuditListQuery,
    Company,
    CompanyCreate,
    CompanyListItem,
    CompanyResearchStatus,
    CompanyUpdate,
    ColdEmailPlan,
    Email,
    EmailCreate,
    EmailUpdate,
    GlobalSearchResult,
    Industry,
    IndustryCreate,
    IndustryUpdate,
    NotificationListQuery,
    PerProfileApplication,
    PerProfileApplicationCreate,
    PerProfileApplicationUpdate,
    Profile,
    ProfileCreate,
    ProfileListItem,
    ProfileUpdate,
    NotificationKind,
    NotificationPayload,
    NotificationSeverity,
    UserCreate,
    UserInDB,
    UserNotification,
    WorkerLease,
    WorkerSettings,
    WorkerSettingsUpdate,
    WorkerStateResponse,
    WorkerType,
    migrate_legacy_application_status,
    utcnow,
    validate_application_transition,
)

# When company research is cleared and the user chooses to archive related applications.
RELATED_COMPANY_RESEARCH_CLEARED_ARCHIVE_REASON = "Related company research cleared"


class _MongoPersistenceBatch:
    def __init__(self) -> None:
        self.depth = 0
        self.replacements: dict[str, dict[str, object]] = {}
        self.deletes: dict[str, set[str]] = {}


_MONGO_PERSISTENCE_BATCH: ContextVar[_MongoPersistenceBatch | None] = ContextVar(
    "mongo_persistence_batch", default=None
)


def _recipient_email_from_cold_email_plan(plan: ColdEmailPlan | dict | None) -> str | None:
    """Resolve recipient email from a model or raw dict (Mongo / legacy / model_construct)."""
    if plan is None:
        return None
    if isinstance(plan, dict):
        try:
            plan = ColdEmailPlan.model_validate(plan)
        except Exception:
            to = plan.get("to")
            if isinstance(to, dict):
                em = to.get("email")
                return str(em).strip() if em else None
            return None
    if plan.to and plan.to.email:
        return str(plan.to.email).strip() or None
    return None


def _tailored_resume_link_ready(value: object) -> bool:
    """True when PPA has a real tailored resume URL, not a placeholder or non-string value."""
    if value is None or not isinstance(value, str):
        return False
    s = value.strip()
    if not s:
        return False
    low = s.lower()
    if low in ("n/a", "na", "none", "tbd", "pending", "—", "-", "..."):
        return False
    return True


def _cold_email_plan_ready_for_applied_list(plan: ColdEmailPlan | dict | None) -> bool:
    """True when a cold email plan has enough content to count as 'email' prep (draft plan or recipient)."""
    if plan is None:
        return False
    if _recipient_email_from_cold_email_plan(plan):
        return True
    if isinstance(plan, dict):
        subs = plan.get("subjects") or []
    else:
        subs = plan.subjects or []
    return any(str(s or "").strip() for s in subs)


def _normalized_optional_text_filter(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _normalized_nonempty_text_list(values: list[str] | None) -> list[str]:
    if not values:
        return []
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = value.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        normalized.append(cleaned)
    return normalized


APPLICATION_PROFILE_FACET_LIMIT = 500


class BaseRepository:
    @contextmanager
    def bulk_persistence(self):
        yield

    def create_user(self, payload: UserCreate, password_hash: str) -> UserInDB:
        raise NotImplementedError

    def get_user_by_email(self, email: str) -> UserInDB | None:
        raise NotImplementedError

    def get_user(self, user_id: str) -> UserInDB | None:
        raise NotImplementedError

    def has_registered_user(self) -> bool:
        raise NotImplementedError

    def list_industries(
        self, skip: int, limit: int, search: str | None
    ) -> list[Industry]:
        raise NotImplementedError

    def count_industries(self, search: str | None) -> int:
        raise NotImplementedError

    def get_industries_by_ids(self, industry_ids: list[str]) -> list[Industry]:
        raise NotImplementedError

    def list_industry_options(
        self,
        *,
        limit: int,
        search: str | None,
        exclude_ids: list[str] | None = None,
    ) -> list[Industry]:
        raise NotImplementedError

    def create_industry(self, payload: IndustryCreate) -> Industry:
        raise NotImplementedError

    def get_industry(self, industry_id: str) -> Industry | None:
        raise NotImplementedError

    def update_industry(self, industry_id: str, payload: IndustryUpdate) -> Industry | None:
        raise NotImplementedError

    def delete_industry(self, industry_id: str) -> bool:
        raise NotImplementedError

    def list_companies(
        self,
        skip: int,
        limit: int,
        search: str | None,
        sort: str = "updated_at_desc",
        research_status: CompanyResearchStatus | None = None,
        has_application: bool | None = None,
    ) -> list[Company]:
        raise NotImplementedError

    def list_company_summaries(
        self,
        skip: int,
        limit: int,
        search: str | None,
        sort: str = "updated_at_desc",
        research_status: CompanyResearchStatus | None = None,
        has_application: bool | None = None,
    ) -> list[CompanyListItem]:
        raise NotImplementedError

    def list_companies_unindexed(self, limit: int) -> list[Company]:
        """Companies with research_status=pending, oldest created first (FIFO)."""
        raise NotImplementedError

    def list_company_research_tasks(
        self, limit: int
    ) -> list[AgentCompanyResearchTaskSummary]:
        """Compact company research queue items with pending research_status, oldest first."""
        raise NotImplementedError

    def create_company(self, payload: CompanyCreate) -> Company:
        raise NotImplementedError

    def find_company_by_normalized_name(self, name: str) -> Company | None:
        raise NotImplementedError

    def unarchive_company(self, company_id: str, payload: CompanyCreate) -> Company | None:
        raise NotImplementedError

    def get_company(self, company_id: str) -> Company | None:
        raise NotImplementedError

    def update_company(self, company_id: str, payload: CompanyUpdate) -> Company | None:
        raise NotImplementedError

    def count_applications_for_company(self, company_id: str) -> int:
        raise NotImplementedError

    def archive_company(self, company_id: str, archive_reason: str) -> tuple[bool, int]:
        """Mark company archived and archive tied applications. Returns (ok, applications_archived_count)."""
        raise NotImplementedError

    def list_profiles(
        self,
        skip: int,
        limit: int,
        search: str | None,
        include_frozen: bool = True,
        frozen: bool | None = None,
    ) -> list[Profile]:
        raise NotImplementedError

    def list_profile_summaries(
        self,
        skip: int,
        limit: int,
        search: str | None,
        frozen: bool | None = None,
    ) -> list[ProfileListItem]:
        return [
            ProfileListItem(
                id=profile.id,
                name=profile.name,
                frozen=profile.frozen,
                location=profile.location,
                email=profile.email,
                phone=profile.phone,
                created_at=profile.created_at,
                updated_at=profile.updated_at,
            )
            for profile in self.list_profiles(skip=skip, limit=limit, search=search, frozen=frozen)
        ]

    def list_profile_ids(self, skip: int, limit: int, include_frozen: bool = True) -> list[str]:
        raise NotImplementedError

    def list_unfrozen_profile_ids(self, skip: int, limit: int) -> list[str]:
        raise NotImplementedError

    def list_unfrozen_profiles(self, skip: int, limit: int) -> list[Profile]:
        raise NotImplementedError

    def create_profile(self, payload: ProfileCreate) -> Profile:
        raise NotImplementedError

    def get_profile(self, profile_id: str) -> Profile | None:
        raise NotImplementedError

    def list_profile_names_by_ids(self, profile_ids: list[str]) -> dict[str, str]:
        raise NotImplementedError

    def update_profile(self, profile_id: str, payload: ProfileUpdate) -> Profile | None:
        raise NotImplementedError

    def delete_profile(self, profile_id: str) -> bool:
        raise NotImplementedError

    def list_applications(
        self,
        skip: int,
        limit: int,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        sort: str = "updated_at_desc",
        exclude_status: ApplicationStatus | None = None,
        created_by_user_id: str | None = None,
        company_search: str | None = None,
        applied_profile_names: list[str] | None = None,
    ) -> list[ApplicationListItem]:
        raise NotImplementedError

    def list_application_applied_profile_facets(
        self,
        *,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        exclude_status: ApplicationStatus | None = None,
        created_by_user_id: str | None = None,
        company_search: str | None = None,
        limit: int = APPLICATION_PROFILE_FACET_LIMIT,
    ) -> list[str]:
        raise NotImplementedError

    def list_applications_by_status(self, status: ApplicationStatus, limit: int) -> list[Application]:
        raise NotImplementedError

    def list_agent_application_tasks(
        self, status: ApplicationStatus, limit: int
    ) -> list[AgentApplicationTaskSummary]:
        raise NotImplementedError

    def dashboard_application_counts(self, created_by_user_id: str | None = None) -> dict[str, int]:
        raise NotImplementedError

    def get_worker_state(self) -> WorkerStateResponse:
        raise NotImplementedError

    def update_worker_settings(self, payload: WorkerSettingsUpdate) -> WorkerSettings:
        raise NotImplementedError

    def assign_worker(self, worker_type: WorkerType, agent_key_id: str) -> str:
        raise NotImplementedError

    def get_worker_lease(self, lease_id: str) -> WorkerLease | None:
        raise NotImplementedError

    def release_worker(self, lease_id: str) -> bool:
        raise NotImplementedError

    def release_worker_for_agent(self, lease_id: str, agent_key_id: str) -> bool:
        """Release a lease only if it was created by the given agent API key."""
        raise NotImplementedError

    def release_all_workers(self, worker_type: WorkerType) -> int:
        raise NotImplementedError

    def create_application(self, payload: ApplicationCreate, created_by_user_id: str | None) -> Application:
        raise NotImplementedError

    def bootstrap_application(
        self,
        company: Company,
        payload: ApplicationBootstrapCreate,
        created_by_user_id: str | None,
    ) -> tuple[Company, Application]:
        raise NotImplementedError

    def get_application(self, application_id: str) -> Application | None:
        raise NotImplementedError

    def update_application(
        self, application_id: str, payload: ApplicationUpdate
    ) -> Application | None:
        raise NotImplementedError

    def mark_application_applied(
        self, application_id: str, applied: bool, *, force: bool = False
    ) -> Application | None:
        raise NotImplementedError

    def mark_application_email_sent(
        self, application_id: str, sent: bool
    ) -> Application | None:
        raise NotImplementedError

    def delete_application(self, application_id: str) -> bool:
        raise NotImplementedError

    def clear_application_to_company_research_pending(self, application_id: str) -> Application | None:
        """Remove all PPAs and their emails; reset application to initial workflow status for the company (bypasses transition rules)."""
        raise NotImplementedError

    def clear_company_research_detail(
        self,
        company_id: str,
        *,
        related_applications: Literal["none", "archive", "reset"] = "none",
    ) -> Company | None:
        """Set research_status to pending and wipe enrichment except name and website.

        related_applications: `none` (unchanged), `archive` (archive all tied apps), `reset` (clear non-archived apps).
        """
        raise NotImplementedError

    def global_search(self, query: str, limit: int) -> GlobalSearchResult:
        raise NotImplementedError

    def create_audit_event(
        self,
        *,
        actor_type: str,
        actor_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        metadata: dict | None = None,
    ) -> AuditEvent:
        raise NotImplementedError

    def list_audit_events(self, query: AuditListQuery) -> list[AuditEvent]:
        raise NotImplementedError

    def create_notification(
        self,
        *,
        user_id: str,
        notification: NotificationKind,
        notification_type: NotificationSeverity,
        payload: NotificationPayload,
        timestamp: datetime | None = None,
        check: bool = False,
    ) -> UserNotification:
        raise NotImplementedError

    def list_notifications(self, user_id: str, q: NotificationListQuery) -> list[UserNotification]:
        raise NotImplementedError

    def count_unread_notifications(self, user_id: str) -> int:
        raise NotImplementedError

    def mark_notification_read(self, user_id: str, notification_id: str) -> UserNotification | None:
        raise NotImplementedError

    def mark_notifications_read_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        raise NotImplementedError

    def delete_notification(self, user_id: str, notification_id: str) -> bool:
        raise NotImplementedError

    def delete_notifications_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        raise NotImplementedError

    def create_agent_api_key(self, payload: AgentApiKeyCreate, key_hash: str) -> AgentApiKeyInDB:
        raise NotImplementedError

    def list_agent_api_keys(self) -> list[AgentApiKeyInDB]:
        raise NotImplementedError

    def revoke_agent_api_key(self, key_id: str) -> bool:
        raise NotImplementedError

    def release_worker_leases_for_agent_key(self, key_id: str) -> int:
        raise NotImplementedError

    def get_agent_api_key_by_hash(self, key_hash: str) -> AgentApiKeyInDB | None:
        raise NotImplementedError

    def touch_agent_api_key_used(self, key_id: str) -> None:
        raise NotImplementedError

    def list_per_profile_for_application(
        self, application_id: str
    ) -> list[PerProfileApplication]:
        raise NotImplementedError

    def create_per_profile_application(
        self, payload: PerProfileApplicationCreate
    ) -> PerProfileApplication:
        raise NotImplementedError

    def get_per_profile_application(self, ppa_id: str) -> PerProfileApplication | None:
        raise NotImplementedError

    def update_per_profile_application(
        self, ppa_id: str, payload: PerProfileApplicationUpdate
    ) -> PerProfileApplication | None:
        raise NotImplementedError

    def delete_per_profile_application(self, ppa_id: str) -> bool:
        raise NotImplementedError

    def list_emails_for_ppa(self, per_profile_application_id: str) -> list[Email]:
        raise NotImplementedError

    def list_emails_for_ppas(self, per_profile_application_ids: list[str]) -> dict[str, list[Email]]:
        raise NotImplementedError

    def create_email(self, payload: EmailCreate) -> Email:
        raise NotImplementedError

    def get_email(self, email_id: str) -> Email | None:
        raise NotImplementedError

    def update_email(self, email_id: str, payload: EmailUpdate) -> Email | None:
        raise NotImplementedError

    def mark_email_sent(self, email_id: str, sent: bool) -> Email | None:
        raise NotImplementedError

    def delete_email(self, email_id: str) -> bool:
        raise NotImplementedError


def _as_dict(model) -> dict:
    return model.model_dump(exclude_none=True)


def _sort_applications(items: list[Application], sort: str) -> list[Application]:
    if sort == "created_at_asc":
        return sorted(items, key=lambda a: a.created_at)
    if sort == "created_at_desc":
        return sorted(items, key=lambda a: a.created_at, reverse=True)
    if sort == "updated_at_desc":
        return sorted(items, key=lambda a: a.updated_at, reverse=True)
    if sort == "updated_at_asc":
        return sorted(items, key=lambda a: a.updated_at)
    return sorted(items, key=lambda a: a.updated_at, reverse=True)


def _sort_companies(items: list[Company], sort: str) -> list[Company]:
    if sort == "created_at_desc":
        return sorted(items, key=lambda c: c.created_at, reverse=True)
    if sort == "created_at_asc":
        return sorted(items, key=lambda c: c.created_at)
    if sort == "updated_at_asc":
        return sorted(items, key=lambda c: c.updated_at)
    if sort == "name_asc":
        return sorted(items, key=lambda c: c.name.lower())
    return sorted(items, key=lambda c: c.updated_at, reverse=True)


def _company_ids_with_applications(applications: dict[str, Application]) -> set[str]:
    return {a.company_id for a in applications.values()}


def _company_list_item_from_company(company: Company) -> CompanyListItem:
    return CompanyListItem(
        id=company.id,
        name=company.name,
        research_status=company.research_status,
        website=company.website,
        has_application=company.has_application,
        created_at=company.created_at,
        updated_at=company.updated_at,
    )


class InMemoryRepository(BaseRepository):
    def __init__(self) -> None:
        self.users: dict[str, UserInDB] = {}
        self.industries: dict[str, Industry] = {}
        self.companies: dict[str, Company] = {}
        self.profiles: dict[str, Profile] = {}
        self.applications: dict[str, Application] = {}
        self.audit_events: dict[str, AuditEvent] = {}
        self.notifications: dict[str, UserNotification] = {}
        self.agent_api_keys: dict[str, AgentApiKeyInDB] = {}
        self.per_profile_applications: dict[str, PerProfileApplication] = {}
        self.emails: dict[str, Email] = {}
        self._worker_settings = WorkerSettings()
        self._worker_leases: dict[str, WorkerLease] = {}

    def _annotate_companies_has_application(self, rows: list[Company]) -> list[Company]:
        app_company_ids = _company_ids_with_applications(self.applications)
        return [
            c.model_copy(update={"has_application": c.id in app_company_ids}) for c in rows
        ]

    def _new_id(self) -> str:
        return str(uuid4())

    def create_user(self, payload: UserCreate, password_hash: str) -> UserInDB:
        if self.get_user_by_email(payload.email):
            raise ValueError("Email already exists")
        now = utcnow()
        user = UserInDB(
            id=self._new_id(),
            name=payload.name,
            email=payload.email,
            password_hash=password_hash,
            role=payload.role,
            admin=payload.admin,
            created_at=now,
            updated_at=now,
        )
        self.users[user.id] = user
        return user

    def get_user_by_email(self, email: str) -> UserInDB | None:
        return next((user for user in self.users.values() if user.email == email), None)

    def get_user(self, user_id: str) -> UserInDB | None:
        return self.users.get(user_id)

    def has_registered_user(self) -> bool:
        return bool(self.users)

    def _filtered_industries(
        self, *, search: str | None, exclude_ids: list[str] | None = None
    ) -> list[Industry]:
        values = list(self.industries.values())
        if search:
            needle = search.lower()
            values = [industry for industry in values if needle in industry.name.lower()]
        if exclude_ids:
            excluded = set(exclude_ids)
            values = [industry for industry in values if industry.id not in excluded]
        values.sort(key=lambda industry: industry.name.lower())
        return values

    def list_industries(self, skip: int, limit: int, search: str | None) -> list[Industry]:
        values = self._filtered_industries(search=search)
        return values[skip : skip + limit]

    def count_industries(self, search: str | None) -> int:
        return len(self._filtered_industries(search=search))

    def get_industries_by_ids(self, industry_ids: list[str]) -> list[Industry]:
        ids = list(dict.fromkeys(industry_ids))
        return [self.industries[industry_id] for industry_id in ids if industry_id in self.industries]

    def list_industry_options(
        self,
        *,
        limit: int,
        search: str | None,
        exclude_ids: list[str] | None = None,
    ) -> list[Industry]:
        return self._filtered_industries(search=search, exclude_ids=exclude_ids)[:limit]

    def create_industry(self, payload: IndustryCreate) -> Industry:
        if any(i.name.lower() == payload.name.lower() for i in self.industries.values()):
            raise ValueError("Industry name already exists")
        now = utcnow()
        industry = Industry(
            id=self._new_id(), created_at=now, updated_at=now, **_as_dict(payload)
        )
        self.industries[industry.id] = industry
        return industry

    def get_industry(self, industry_id: str) -> Industry | None:
        return self.industries.get(industry_id)

    def update_industry(self, industry_id: str, payload: IndustryUpdate) -> Industry | None:
        industry = self.get_industry(industry_id)
        if not industry:
            return None
        merged = industry.model_copy(
            update={**payload.model_dump(exclude_none=True), "updated_at": utcnow()}
        )
        self.industries[industry_id] = merged
        return merged

    def delete_industry(self, industry_id: str) -> bool:
        return self.industries.pop(industry_id, None) is not None

    def list_companies(
        self,
        skip: int,
        limit: int,
        search: str | None,
        sort: str = "updated_at_desc",
        research_status: CompanyResearchStatus | None = None,
        has_application: bool | None = None,
    ) -> list[Company]:
        values = [c for c in self.companies.values() if not c.archived]
        if search:
            needle = search.lower()
            values = [c for c in values if needle in c.name.lower()]
        if research_status is not None:
            values = [c for c in values if c.research_status == research_status]
        if has_application is not None:
            app_ids = _company_ids_with_applications(self.applications)
            values = [c for c in values if (c.id in app_ids) == has_application]
        values = _sort_companies(values, sort)
        sliced = values[skip : skip + limit]
        return self._annotate_companies_has_application(sliced)

    def list_company_summaries(
        self,
        skip: int,
        limit: int,
        search: str | None,
        sort: str = "updated_at_desc",
        research_status: CompanyResearchStatus | None = None,
        has_application: bool | None = None,
    ) -> list[CompanyListItem]:
        return [
            _company_list_item_from_company(company)
            for company in self.list_companies(
                skip=skip,
                limit=limit,
                search=search,
                sort=sort,
                research_status=research_status,
                has_application=has_application,
            )
        ]

    def list_companies_unindexed(self, limit: int) -> list[Company]:
        values = [
            c
            for c in self.companies.values()
            if c.research_status == CompanyResearchStatus.pending and not c.archived
        ]
        values.sort(key=lambda c: c.created_at)
        return values[:limit]

    def list_company_research_tasks(
        self, limit: int
    ) -> list[AgentCompanyResearchTaskSummary]:
        companies = self.list_companies_unindexed(limit)
        company_ids_with_apps = _company_ids_with_applications(self.applications)
        return [
            AgentCompanyResearchTaskSummary(
                id=company.id,
                name=company.name,
                website=company.website,
                research_status=company.research_status,
                has_application=company.id in company_ids_with_apps,
                created_at=company.created_at,
                updated_at=company.updated_at,
            )
            for company in companies
        ]

    def _initial_application_status_for_company(self, company_id: str) -> ApplicationStatus:
        company = self.get_company(company_id)
        if company and company.research_status == CompanyResearchStatus.invalid:
            return ApplicationStatus.invalid
        if company and company.research_status == CompanyResearchStatus.indexed:
            return ApplicationStatus.ppa_pending
        return ApplicationStatus.company_research_pending

    def get_worker_state(self) -> WorkerStateResponse:
        active: dict[str, int] = {t.value: 0 for t in WorkerType}
        for lease in self._worker_leases.values():
            active[lease.worker_type.value] = active.get(lease.worker_type.value, 0) + 1
        return WorkerStateResponse(
            settings=self._worker_settings,
            active=active,
            max={
                "company_researcher": self._worker_settings.max_company_researcher,
                "ppa_analyser": self._worker_settings.max_ppa_analyser,
                "application_drafter": self._worker_settings.max_application_drafter,
            },
        )

    def update_worker_settings(self, payload: WorkerSettingsUpdate) -> WorkerSettings:
        data = payload.model_dump(exclude_none=True)
        merged = self._worker_settings.model_copy(update=data)
        self._worker_settings = merged
        return merged

    def assign_worker(self, worker_type: WorkerType, agent_key_id: str) -> str:
        max_map = {
            WorkerType.company_researcher: self._worker_settings.max_company_researcher,
            WorkerType.ppa_analyser: self._worker_settings.max_ppa_analyser,
            WorkerType.application_drafter: self._worker_settings.max_application_drafter,
        }
        max_n = max_map[worker_type]
        active = sum(1 for l in self._worker_leases.values() if l.worker_type == worker_type)
        if active >= max_n:
            raise ValueError("No worker slots available for this worker type")
        lease_id = str(uuid4())
        lease = WorkerLease(
            id=lease_id,
            worker_type=worker_type,
            agent_key_id=agent_key_id,
            created_at=utcnow(),
        )
        self._worker_leases[lease_id] = lease
        return lease_id

    def get_worker_lease(self, lease_id: str) -> WorkerLease | None:
        return self._worker_leases.get(lease_id)

    def release_worker(self, lease_id: str) -> bool:
        return self._worker_leases.pop(lease_id, None) is not None

    def release_worker_for_agent(self, lease_id: str, agent_key_id: str) -> bool:
        lease = self._worker_leases.get(lease_id)
        if not lease or lease.agent_key_id != agent_key_id:
            return False
        return self.release_worker(lease_id)

    def release_all_workers(self, worker_type: WorkerType) -> int:
        to_drop = [lid for lid, l in self._worker_leases.items() if l.worker_type == worker_type]
        for lid in to_drop:
            self._worker_leases.pop(lid, None)
        return len(to_drop)

    def create_company(self, payload: CompanyCreate) -> Company:
        now = utcnow()
        data = _as_dict(payload)
        data.pop("acknowledge_reuse_of_archived_company", None)
        company = Company(id=self._new_id(), created_at=now, updated_at=now, **data)
        self.companies[company.id] = company
        return company

    def find_company_by_normalized_name(self, name: str) -> Company | None:
        target = normalize_company_name(name)
        for c in self.companies.values():
            if normalize_company_name(c.name) == target:
                return c
        return None

    def unarchive_company(self, company_id: str, payload: CompanyCreate) -> Company | None:
        company = self.get_company(company_id)
        if not company or not company.archived:
            return None
        dump = payload.model_dump(
            exclude_none=True, exclude={"acknowledge_reuse_of_archived_company"}
        )
        merged = company.model_copy(
            update={
                **dump,
                "archived": False,
                "archived_at": None,
                "archive_reason": None,
                "updated_at": utcnow(),
            }
        )
        self.companies[company_id] = merged
        return merged

    def get_company(self, company_id: str) -> Company | None:
        co = self.companies.get(company_id)
        if not co:
            return None
        return self._annotate_companies_has_application([co])[0]

    def _promote_company_research_pending_to_ppa_for_company(self, company_id: str) -> None:
        """When company becomes indexed, move tied applications from company_research_pending → ppa_pending."""
        for app_id, application in list(self.applications.items()):
            if application.company_id != company_id:
                continue
            if application.status != ApplicationStatus.company_research_pending:
                continue
            if not validate_application_transition(
                application.status, ApplicationStatus.ppa_pending
            ):
                continue
            self.applications[app_id] = application.model_copy(
                update={"status": ApplicationStatus.ppa_pending, "updated_at": utcnow()}
            )

    def _mark_applications_invalid_for_company(self, company_id: str) -> None:
        """When company research becomes invalid, move non-archived tied applications → invalid."""
        for app_id, application in list(self.applications.items()):
            if application.company_id != company_id:
                continue
            if application.status == ApplicationStatus.archived:
                continue
            if application.status == ApplicationStatus.invalid:
                continue
            if not validate_application_transition(application.status, ApplicationStatus.invalid):
                continue
            self.applications[app_id] = application.model_copy(
                update={"status": ApplicationStatus.invalid, "updated_at": utcnow()}
            )

    def _clear_company_research_detail_model(self, company: Company) -> Company:
        return company.model_copy(
            update={
                "research_status": CompanyResearchStatus.pending,
                "linkedin": None,
                "industry_ids": [],
                "hq_locations": [],
                "employee_count_text": None,
                "actively_hiring": None,
                "work_mode": None,
                "work_mode_description": None,
                "overview": None,
                "full_product_detail": None,
                "full_hiring_detail": None,
                "full_organization_detail": None,
                "analysis_links": [],
                "enrichment_source_links": [],
                "updated_at": utcnow(),
            }
        )

    def _archive_application_for_company(self, application: Application, archive_reason: str) -> Application:
        if application.status != ApplicationStatus.archived and not validate_application_transition(
            application.status, ApplicationStatus.archived
        ):
            raise ValueError(
                f"Cannot archive application {application.id} from status {application.status}"
            )
        return application.model_copy(
            update={
                "status": ApplicationStatus.archived,
                "archive_reason": archive_reason,
                "updated_at": utcnow(),
            }
        )

    def _clear_application_model_to_company_research_pending(
        self, application: Application, *, next_status: ApplicationStatus
    ) -> Application:
        return application.model_copy(
            update={
                "status": next_status,
                "applied": False,
                "applied_at": None,
                "email_sent": False,
                "email_sent_at": None,
                "archive_reason": None,
                "updated_at": utcnow(),
            }
        )

    def update_company(self, company_id: str, payload: CompanyUpdate) -> Company | None:
        company = self.get_company(company_id)
        if not company:
            return None
        merged = company.model_copy(
            update={**payload.model_dump(exclude_none=True), "updated_at": utcnow()}
        )
        self.companies[company_id] = merged
        if (
            merged.research_status == CompanyResearchStatus.indexed
            and company.research_status != CompanyResearchStatus.indexed
        ):
            self._promote_company_research_pending_to_ppa_for_company(company_id)
        if (
            merged.research_status == CompanyResearchStatus.invalid
            and company.research_status != CompanyResearchStatus.invalid
        ):
            self._mark_applications_invalid_for_company(company_id)
        return merged

    def count_applications_for_company(self, company_id: str) -> int:
        return sum(1 for a in self.applications.values() if a.company_id == company_id)

    def _archive_all_company_applications(self, company_id: str, archive_reason: str) -> int:
        n = 0
        for app_id, application in list(self.applications.items()):
            if application.company_id != company_id:
                continue
            merged = self._archive_application_for_company(application, archive_reason)
            self.applications[app_id] = merged
            n += 1
        return n

    def archive_company(self, company_id: str, archive_reason: str) -> tuple[bool, int]:
        company = self.get_company(company_id)
        if not company:
            return (False, 0)
        if not company.archived:
            merged = company.model_copy(
                update={
                    "archived": True,
                    "archived_at": utcnow(),
                    "archive_reason": archive_reason,
                    "updated_at": utcnow(),
                }
            )
            self.companies[company_id] = merged
        else:
            merged = company.model_copy(
                update={
                    "archive_reason": archive_reason,
                    "updated_at": utcnow(),
                }
            )
            self.companies[company_id] = merged
        n = self._archive_all_company_applications(company_id, archive_reason)
        return (True, n)

    def list_profiles(
        self,
        skip: int,
        limit: int,
        search: str | None,
        include_frozen: bool = True,
        frozen: bool | None = None,
    ) -> list[Profile]:
        values = list(self.profiles.values())
        if frozen is True:
            values = [p for p in values if p.frozen]
        elif frozen is False:
            values = [p for p in values if not p.frozen]
        elif not include_frozen:
            values = [p for p in values if not p.frozen]
        if search:
            needle = search.lower()
            values = [
                p
                for p in values
                if any(
                    needle in value.lower()
                    for value in [
                        p.name,
                        p.email or "",
                        p.location or "",
                        p.niche_info_md or "",
                    ]
                )
            ]
        values.sort(key=lambda p: p.name.lower())
        return values[skip : skip + limit]

    def list_profile_ids(self, skip: int, limit: int, include_frozen: bool = True) -> list[str]:
        values = sorted(self.profiles.values(), key=lambda p: p.created_at)
        if not include_frozen:
            values = [p for p in values if not p.frozen]
        return [p.id for p in values[skip : skip + limit]]

    def create_profile(self, payload: ProfileCreate) -> Profile:
        now = utcnow()
        profile = Profile(id=self._new_id(), created_at=now, updated_at=now, **_as_dict(payload))
        self.profiles[profile.id] = profile
        return profile

    def get_profile(self, profile_id: str) -> Profile | None:
        return self.profiles.get(profile_id)

    def list_profile_names_by_ids(self, profile_ids: list[str]) -> dict[str, str]:
        ids = list(dict.fromkeys(profile_ids))
        return {
            profile_id: self.profiles[profile_id].name
            for profile_id in ids
            if profile_id in self.profiles
        }

    def update_profile(self, profile_id: str, payload: ProfileUpdate) -> Profile | None:
        profile = self.get_profile(profile_id)
        if not profile:
            return None
        merged = profile.model_copy(
            update={**payload.model_dump(exclude_none=True), "updated_at": utcnow()}
        )
        self.profiles[profile_id] = merged
        return merged

    def delete_profile(self, profile_id: str) -> bool:
        return self.profiles.pop(profile_id, None) is not None

    def _per_profile_shown_in_applied_profiles_column(
        self, ppa: PerProfileApplication, ppa_ids_with_substantive_email: set[str]
    ) -> bool:
        """Show when PPA has a real resume link, substantive email draft(s), or cold email plan content."""
        if _tailored_resume_link_ready(ppa.tailored_resume_link):
            return True
        if ppa.id in ppa_ids_with_substantive_email:
            return True
        if _cold_email_plan_ready_for_applied_list(ppa.cold_email_plan):
            return True
        return False

    def _batch_applied_profile_names_for_applications(
        self, application_ids: list[str]
    ) -> dict[str, list[AppliedProfileName]]:
        """Show only the first PPA profile name for each application."""
        first_profile_name_by_app = self._first_applied_profile_name_by_application_ids(application_ids)
        return {
            application_id: [AppliedProfileName(profile_name=profile_name)]
            if profile_name
            else []
            for application_id in application_ids
            for profile_name in [first_profile_name_by_app.get(application_id)]
        }

    def _first_applied_profile_name_by_application_ids(
        self, application_ids: list[str]
    ) -> dict[str, str]:
        if not application_ids:
            return {}

        app_set = set(application_ids)
        ppas_by_app: dict[str, list[PerProfileApplication]] = {aid: [] for aid in application_ids}
        for ppa in self.per_profile_applications.values():
            if ppa.application_id in app_set:
                ppas_by_app[ppa.application_id].append(ppa)

        # Previous logic intentionally kept for reference:
        # - Gather all PPAs across the page.
        # - Mark qualifying profile IDs based on resume link / substantive email / cold email plan.
        # - Render a de-duplicated list of qualifying profiles per application.
        #
        # all_ppas = [p for p in self.per_profile_applications.values() if p.application_id in app_set]
        # ppa_id_set = {p.id for p in all_ppas}
        # ppa_ids_with_substantive_email: set[str] = set()
        # for e in self.emails.values():
        #     if e.per_profile_application_id not in ppa_id_set:
        #         continue
        #     if (e.content or "").strip():
        #         ppa_ids_with_substantive_email.add(e.per_profile_application_id)
        # qualifying_profile_ids: set[str] = set()
        # for ppa in all_ppas:
        #     if self._per_profile_shown_in_applied_profiles_column(ppa, ppa_ids_with_substantive_email):
        #         qualifying_profile_ids.add(ppa.profile_id)

        out: dict[str, str] = {}
        for aid in application_ids:
            rows = sorted(ppas_by_app[aid], key=lambda p: (p.order_index, p.created_at))
            first_ppa = rows[0] if rows else None
            if not first_ppa:
                continue
            prof = self.get_profile(first_ppa.profile_id)
            out[aid] = prof.name if prof else "Unknown profile"
        return out

    def _filter_applications_for_list(
        self,
        *,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        exclude_status: ApplicationStatus | None = None,
        created_by_user_id: str | None = None,
        company_search: str | None = None,
    ) -> list[Application]:
        values = list(self.applications.values())
        if status:
            values = [a for a in values if a.status == status]
        if exclude_status:
            values = [a for a in values if a.status != exclude_status]
        if company_id:
            values = [a for a in values if a.company_id == company_id]
        if created_by_user_id is not None:
            values = [a for a in values if a.created_by_user_id == created_by_user_id]
        if applied is not None:
            values = [a for a in values if a.applied is applied]
        if email_sent is not None:
            values = [a for a in values if a.email_sent is email_sent]
        normalized_company_search = _normalized_optional_text_filter(company_search)
        if normalized_company_search:
            needle = normalized_company_search.lower()
            filtered_values: list[Application] = []
            for application in values:
                company = self.companies.get(application.company_id)
                if company and needle in company.name.lower():
                    filtered_values.append(application)
            values = filtered_values
        return values

    def list_applications(
        self,
        skip: int,
        limit: int,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        sort: str = "updated_at_desc",
        exclude_status: ApplicationStatus | None = None,
        created_by_user_id: str | None = None,
        company_search: str | None = None,
        applied_profile_names: list[str] | None = None,
    ) -> list[ApplicationListItem]:
        values = self._filter_applications_for_list(
            status=status,
            company_id=company_id,
            applied=applied,
            email_sent=email_sent,
            exclude_status=exclude_status,
            created_by_user_id=created_by_user_id,
            company_search=company_search,
        )
        selected_profile_names = set(_normalized_nonempty_text_list(applied_profile_names))
        if selected_profile_names:
            first_profile_name_by_app = self._first_applied_profile_name_by_application_ids(
                [application.id for application in values]
            )
            values = [
                application
                for application in values
                if first_profile_name_by_app.get(application.id) in selected_profile_names
            ]
        values = _sort_applications(values, sort)
        sliced = values[skip : skip + limit]
        batch = self._batch_applied_profile_names_for_applications([a.id for a in sliced])
        company_name_by_id = {
            company_id: company.name for company_id, company in self.companies.items()
        }
        return [
            ApplicationListItem(
                **a.model_dump(),
                company_name=company_name_by_id.get(a.company_id, "Unknown company"),
                applied_profiles=batch.get(a.id, []),
            )
            for a in sliced
        ]

    def list_application_applied_profile_facets(
        self,
        *,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        exclude_status: ApplicationStatus | None = None,
        created_by_user_id: str | None = None,
        company_search: str | None = None,
        limit: int = APPLICATION_PROFILE_FACET_LIMIT,
    ) -> list[str]:
        values = self._filter_applications_for_list(
            status=status,
            company_id=company_id,
            applied=applied,
            email_sent=email_sent,
            exclude_status=exclude_status,
            created_by_user_id=created_by_user_id,
            company_search=company_search,
        )
        first_profile_name_by_app = self._first_applied_profile_name_by_application_ids(
            [application.id for application in values]
        )
        return sorted(set(first_profile_name_by_app.values()), key=lambda name: name.lower())[:limit]

    def list_applications_by_status(self, status: ApplicationStatus, limit: int) -> list[Application]:
        rows = [a for a in self.applications.values() if a.status == status]
        rows = _sort_applications(rows, "created_at_asc")
        return rows[:limit]

    def list_agent_application_tasks(
        self, status: ApplicationStatus, limit: int
    ) -> list[AgentApplicationTaskSummary]:
        applications = self.list_applications_by_status(status, limit)
        return [
            AgentApplicationTaskSummary(
                id=application.id,
                status=application.status,
                company_id=application.company_id,
                company_name=self.companies.get(application.company_id).name
                if application.company_id in self.companies
                else "Unknown company",
                company_website=self.companies.get(application.company_id).website
                if application.company_id in self.companies
                else None,
                job_link=application.job_post.job_link if application.job_post else None,
                created_at=application.created_at,
                updated_at=application.updated_at,
            )
            for application in applications
        ]

    def dashboard_application_counts(self, created_by_user_id: str | None = None) -> dict[str, int]:
        rows = self.applications.values()
        if created_by_user_id is not None:
            rows = [a for a in rows if a.created_by_user_id == created_by_user_id]
        counts = {
            "company_research_pipeline": 0,
            "application_ready": 0,
            "actions_need_review": 0,
        }
        for application in rows:
            if application.status == ApplicationStatus.archived:
                continue
            if application.status in (
                ApplicationStatus.company_research_pending,
                ApplicationStatus.company_researching,
            ):
                counts["company_research_pipeline"] += 1
            if application.status == ApplicationStatus.application_ready:
                counts["application_ready"] += 1
                if not application.applied:
                    counts["actions_need_review"] += 1
        return counts

    def create_application(self, payload: ApplicationCreate, created_by_user_id: str | None) -> Application:
        now = utcnow()
        payload_dict = _as_dict(payload)
        initial_status = payload.status
        if initial_status == ApplicationStatus.company_research_pending:
            initial_status = self._initial_application_status_for_company(payload.company_id)
        payload_dict["status"] = initial_status
        application = Application(
            id=self._new_id(),
            created_at=now,
            updated_at=now,
            applied=False,
            applied_at=None,
            email_sent=False,
            email_sent_at=None,
            archive_reason=None,
            created_by_user_id=created_by_user_id,
            **payload_dict,
        )
        self.applications[application.id] = application
        return application

    def bootstrap_application(
        self,
        company: Company,
        payload: ApplicationBootstrapCreate,
        created_by_user_id: str | None,
    ) -> tuple[Company, Application]:
        app_payload = ApplicationCreate(
            company_id=company.id,
            job_post=payload.job_post,
            status=ApplicationStatus.company_research_pending,
        )
        application = self.create_application(app_payload, created_by_user_id=created_by_user_id)
        return company, application

    def get_application(self, application_id: str) -> Application | None:
        return self.applications.get(application_id)

    def update_application(
        self, application_id: str, payload: ApplicationUpdate
    ) -> Application | None:
        application = self.get_application(application_id)
        if not application:
            return None
        updates = payload.model_dump(exclude_none=True)
        force_transition = bool(updates.pop("force_transition", False))
        next_status = updates.get("status")
        if (
            next_status
            and not force_transition
            and not validate_application_transition(application.status, next_status)
        ):
            raise ValueError("Invalid status transition")
        merged = application.model_copy(update={**updates, "updated_at": utcnow()})
        self.applications[application_id] = merged
        return merged

    def mark_application_applied(
        self, application_id: str, applied: bool, *, force: bool = False
    ) -> Application | None:
        application = self.get_application(application_id)
        if not application:
            return None
        if applied:
            if application.status == ApplicationStatus.archived:
                raise ValueError("Archived application cannot be applied")
            if application.status == ApplicationStatus.invalid:
                raise ValueError("Invalid application cannot be marked applied")
            if not force and application.status != ApplicationStatus.application_ready:
                raise ValueError("Mark applied is only valid when status is application_ready")
            stamp = application.applied_at or utcnow()
            updated = application.model_copy(
                update={
                    "applied": True,
                    "applied_at": stamp,
                    "updated_at": utcnow(),
                }
            )
        else:
            updated = application.model_copy(
                update={
                    "applied": False,
                    "applied_at": None,
                    "updated_at": utcnow(),
                }
            )
        self.applications[application_id] = updated
        return updated

    def mark_application_email_sent(
        self, application_id: str, sent: bool
    ) -> Application | None:
        application = self.get_application(application_id)
        if not application:
            return None
        if sent:
            stamp = application.email_sent_at or utcnow()
            updated = application.model_copy(
                update={
                    "email_sent": True,
                    "email_sent_at": stamp,
                    "updated_at": utcnow(),
                }
            )
        else:
            updated = application.model_copy(
                update={
                    "email_sent": False,
                    "email_sent_at": None,
                    "updated_at": utcnow(),
                }
            )
        self.applications[application_id] = updated
        return updated

    def delete_application(self, application_id: str) -> bool:
        return self.applications.pop(application_id, None) is not None

    def clear_application_to_company_research_pending(self, application_id: str) -> Application | None:
        application = self.get_application(application_id)
        if not application:
            return None
        next_status = self._initial_application_status_for_company(application.company_id)
        ppa_ids = {
            p.id
            for p in self.per_profile_applications.values()
            if p.application_id == application_id
        }
        for eid in list(self.emails.keys()):
            em = self.emails.get(eid)
            if em and em.per_profile_application_id in ppa_ids:
                self.emails.pop(eid, None)
        for pid in ppa_ids:
            self.per_profile_applications.pop(pid, None)
        merged = self._clear_application_model_to_company_research_pending(
            application, next_status=next_status
        )
        self.applications[application_id] = merged
        return merged

    def clear_company_research_detail(
        self,
        company_id: str,
        *,
        related_applications: Literal["none", "archive", "reset"] = "none",
    ) -> Company | None:
        company = self.get_company(company_id)
        if not company:
            return None
        # Apply company wipe first so related-application reset sees research_status pending
        # (otherwise clear_application_to_company_research_pending would still see indexed → ppa_pending).
        merged = self._clear_company_research_detail_model(company)
        self.companies[company_id] = merged
        if related_applications == "archive":
            self._archive_all_company_applications(
                company_id, RELATED_COMPANY_RESEARCH_CLEARED_ARCHIVE_REASON
            )
        elif related_applications == "reset":
            for app_id, app in list(self.applications.items()):
                if app.company_id != company_id:
                    continue
                if app.status == ApplicationStatus.archived:
                    continue
                self.clear_application_to_company_research_pending(app_id)
        return merged

    def global_search(self, query: str, limit: int) -> GlobalSearchResult:
        q = query.strip().lower()
        if not q:
            return GlobalSearchResult(companies=[], profiles=[], applications=[])
        companies = [
            c
            for c in self.companies.values()
            if not c.archived
            and (q in c.name.lower() or (c.overview and q in c.overview.lower()))
        ][:limit]
        profiles = [
            p
            for p in self.profiles.values()
            if q in p.name.lower() or (p.bio_md and q in p.bio_md.lower())
        ][:limit]
        applications = []
        for a in self.applications.values():
            if a.notes and q in a.notes.lower():
                applications.append(a)
                if len(applications) >= limit:
                    break
        return GlobalSearchResult(
            companies=companies[:limit], profiles=profiles[:limit], applications=applications[:limit]
        )

    def create_audit_event(
        self,
        *,
        actor_type: str,
        actor_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        metadata: dict | None = None,
    ) -> AuditEvent:
        from app.models import ActorType

        event = AuditEvent(
            id=self._new_id(),
            actor_type=ActorType(actor_type),
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata=metadata or {},
            created_at=utcnow(),
        )
        self.audit_events[event.id] = event
        return event

    def list_audit_events(self, query: AuditListQuery) -> list[AuditEvent]:
        rows = list(self.audit_events.values())
        if query.actor_type:
            rows = [r for r in rows if r.actor_type == query.actor_type]
        if query.entity_type:
            rows = [r for r in rows if r.entity_type == query.entity_type]
        if query.from_ts:
            rows = [r for r in rows if r.created_at >= query.from_ts]
        if query.to_ts:
            rows = [r for r in rows if r.created_at <= query.to_ts]
        rows.sort(key=lambda r: r.created_at, reverse=True)
        return rows[query.skip : query.skip + query.limit]

    def create_notification(
        self,
        *,
        user_id: str,
        notification: NotificationKind,
        notification_type: NotificationSeverity,
        payload: NotificationPayload,
        timestamp: datetime | None = None,
        check: bool = False,
    ) -> UserNotification:
        ts = timestamp or utcnow()
        note = UserNotification(
            id=self._new_id(),
            user_id=user_id,
            notification=notification,
            notification_type=notification_type,
            timestamp=ts,
            check=check,
            payload=payload,
            read_at=None,
            created_at=ts,
            link=None,
        )
        self.notifications[note.id] = note
        return note

    def list_notifications(self, user_id: str, q: NotificationListQuery) -> list[UserNotification]:
        rows = [n for n in self.notifications.values() if n.user_id == user_id]
        if q.unread_only:
            rows = [n for n in rows if n.read_at is None]
        rows.sort(key=lambda n: n.timestamp, reverse=True)
        return rows[q.skip : q.skip + q.limit]

    def count_unread_notifications(self, user_id: str) -> int:
        return sum(1 for note in self.notifications.values() if note.user_id == user_id and note.read_at is None)

    def mark_notification_read(self, user_id: str, notification_id: str) -> UserNotification | None:
        note = self.notifications.get(notification_id)
        if not note or note.user_id != user_id:
            return None
        updated = note.model_copy(update={"read_at": utcnow()})
        self.notifications[notification_id] = updated
        return updated

    def mark_notifications_read_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        updated_count = 0
        ts = utcnow()
        for notification_id in dict.fromkeys(notification_ids):
            note = self.notifications.get(notification_id)
            if not note or note.user_id != user_id or note.read_at is not None:
                continue
            self.notifications[notification_id] = note.model_copy(update={"read_at": ts})
            updated_count += 1
        return updated_count

    def delete_notification(self, user_id: str, notification_id: str) -> bool:
        note = self.notifications.get(notification_id)
        if not note or note.user_id != user_id:
            return False
        del self.notifications[notification_id]
        return True

    def delete_notifications_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        removed = 0
        for nid in dict.fromkeys(notification_ids):
            note = self.notifications.get(nid)
            if note and note.user_id == user_id:
                del self.notifications[nid]
                removed += 1
        return removed

    def create_agent_api_key(self, payload: AgentApiKeyCreate, key_hash: str) -> AgentApiKeyInDB:
        now = utcnow()
        rec = AgentApiKeyInDB(
            id=self._new_id(),
            name=payload.name,
            key_hash=key_hash,
            scopes=list(payload.scopes),
            created_at=now,
            last_used_at=None,
        )
        self.agent_api_keys[rec.id] = rec
        return rec

    def list_agent_api_keys(self) -> list[AgentApiKeyInDB]:
        return sorted(self.agent_api_keys.values(), key=lambda k: k.created_at, reverse=True)

    def revoke_agent_api_key(self, key_id: str) -> bool:
        self.release_worker_leases_for_agent_key(key_id)
        return self.agent_api_keys.pop(key_id, None) is not None

    def release_worker_leases_for_agent_key(self, key_id: str) -> int:
        to_drop = [lid for lid, lease in self._worker_leases.items() if lease.agent_key_id == key_id]
        for lease_id in to_drop:
            self._worker_leases.pop(lease_id, None)
        return len(to_drop)

    def get_agent_api_key_by_hash(self, key_hash: str) -> AgentApiKeyInDB | None:
        return next((k for k in self.agent_api_keys.values() if k.key_hash == key_hash), None)

    def touch_agent_api_key_used(self, key_id: str) -> None:
        key = self.agent_api_keys.get(key_id)
        if not key:
            return
        self.agent_api_keys[key_id] = key.model_copy(update={"last_used_at": utcnow()})

    def list_per_profile_for_application(
        self, application_id: str
    ) -> list[PerProfileApplication]:
        rows = [p for p in self.per_profile_applications.values() if p.application_id == application_id]
        return sorted(rows, key=lambda p: (p.order_index, p.created_at))

    def create_per_profile_application(
        self, payload: PerProfileApplicationCreate
    ) -> PerProfileApplication:
        if not self.get_application(payload.application_id):
            raise ValueError("Invalid application_id")
        if not self.get_profile(payload.profile_id):
            raise ValueError("Invalid profile_id")
        now = utcnow()
        payload_dict = _as_dict(payload)
        if payload_dict.get("applied") and payload_dict.get("applied_at") is None:
            payload_dict["applied_at"] = utcnow()
        ppa = PerProfileApplication(
            id=self._new_id(),
            created_at=now,
            updated_at=now,
            **payload_dict,
        )
        self.per_profile_applications[ppa.id] = ppa
        return ppa

    def get_per_profile_application(self, ppa_id: str) -> PerProfileApplication | None:
        return self.per_profile_applications.get(ppa_id)

    def update_per_profile_application(
        self, ppa_id: str, payload: PerProfileApplicationUpdate
    ) -> PerProfileApplication | None:
        ppa = self.get_per_profile_application(ppa_id)
        if not ppa:
            return None
        if payload.profile_id and not self.get_profile(payload.profile_id):
            raise ValueError("Invalid profile_id")
        updates = payload.model_dump(exclude_none=True)
        if updates.get("applied") is True:
            if "applied_at" not in updates or updates["applied_at"] is None:
                updates["applied_at"] = ppa.applied_at or utcnow()
        elif updates.get("applied") is False:
            updates["applied_at"] = None
        merged = ppa.model_copy(update={**updates, "updated_at": utcnow()})
        self.per_profile_applications[ppa_id] = merged
        return merged

    def delete_per_profile_application(self, ppa_id: str) -> bool:
        return self.per_profile_applications.pop(ppa_id, None) is not None

    def list_emails_for_ppa(self, per_profile_application_id: str) -> list[Email]:
        rows = [e for e in self.emails.values() if e.per_profile_application_id == per_profile_application_id]
        return sorted(rows, key=lambda e: e.created_at)

    def list_emails_for_ppas(self, per_profile_application_ids: list[str]) -> dict[str, list[Email]]:
        lookup = {ppa_id: [] for ppa_id in dict.fromkeys(per_profile_application_ids)}
        if not lookup:
            return {}
        for email in self.emails.values():
            rows = lookup.get(email.per_profile_application_id)
            if rows is not None:
                rows.append(email)
        for rows in lookup.values():
            rows.sort(key=lambda e: e.created_at)
        return lookup

    def create_email(self, payload: EmailCreate) -> Email:
        if not self.get_per_profile_application(payload.per_profile_application_id):
            raise ValueError("Invalid per_profile_application_id")
        now = utcnow()
        email = Email(id=self._new_id(), created_at=now, updated_at=now, **_as_dict(payload))
        self.emails[email.id] = email
        return email

    def get_email(self, email_id: str) -> Email | None:
        return self.emails.get(email_id)

    def update_email(self, email_id: str, payload: EmailUpdate) -> Email | None:
        email = self.get_email(email_id)
        if not email:
            return None
        merged = email.model_copy(
            update={**payload.model_dump(exclude_none=True), "updated_at": utcnow()}
        )
        self.emails[email_id] = merged
        return merged

    def mark_email_sent(self, email_id: str, sent: bool) -> Email | None:
        email = self.get_email(email_id)
        if not email:
            return None
        if sent:
            from app.models import EmailLifecycleStatus

            stamp = email.sent_at or utcnow()
            merged = email.model_copy(
                update={
                    "sent": True,
                    "sent_at": stamp,
                    "lifecycle_status": EmailLifecycleStatus.sent,
                    "updated_at": utcnow(),
                }
            )
        else:
            from app.models import EmailLifecycleStatus

            merged = email.model_copy(
                update={
                    "sent": False,
                    "sent_at": None,
                    "lifecycle_status": EmailLifecycleStatus.drafted,
                    "updated_at": utcnow(),
                }
            )
        self.emails[email_id] = merged
        return merged

    def delete_email(self, email_id: str) -> bool:
        return self.emails.pop(email_id, None) is not None


class MongoRepository(InMemoryRepository):
    def __init__(self) -> None:
        super().__init__()
        self.client = MongoClient(settings.mongo_uri)
        self.db = self.client[settings.mongo_db_name]
        self._ensure_indexes()
        self._load()
        self._load_workers_mongo()

    def _ensure_indexes(self) -> None:
        self.db.companies.create_index([("archived", 1), ("updated_at", -1)])
        self.db.companies.create_index([("archived", 1), ("research_status", 1), ("updated_at", -1)])
        self.db.companies.create_index([("archived", 1), ("research_status", 1), ("created_at", 1)])
        self.db.companies.create_index([("name", 1)], collation={"locale": "en", "strength": 2})
        self.db.industries.create_index([("name", 1)], collation={"locale": "en", "strength": 2})
        self.db.profiles.create_index([("name", 1)], collation={"locale": "en", "strength": 2})
        self.db.profiles.create_index([("frozen", 1), ("created_at", 1)])
        self.db.profiles.create_index([("frozen", 1), ("name", 1)], collation={"locale": "en", "strength": 2})
        self.db.applications.create_index([("status", 1), ("updated_at", -1)])
        self.db.applications.create_index([("status", 1), ("created_at", 1)])
        self.db.applications.create_index([("company_id", 1), ("updated_at", -1)])
        self.db.applications.create_index([("created_by_user_id", 1), ("updated_at", -1)])
        self.db.audit_events.create_index([("actor_type", 1), ("entity_type", 1), ("created_at", -1)])
        self.db.notifications.create_index([("user_id", 1), ("read_at", 1), ("timestamp", -1)])
        self.db.per_profile_applications.create_index(
            [("application_id", 1), ("order_index", 1), ("created_at", 1)]
        )
        self.db.emails.create_index([("per_profile_application_id", 1), ("created_at", 1)])

    def _load_workers_mongo(self) -> None:
        doc = self.db.app_settings.find_one({"_id": "worker_settings"})
        if not doc:
            self._worker_settings = WorkerSettings()
            self._worker_leases = {}
            return
        self._worker_settings = WorkerSettings(
            max_company_researcher=int(doc.get("max_company_researcher", 1)),
            max_ppa_analyser=int(doc.get("max_ppa_analyser", 1)),
            max_application_drafter=int(doc.get("max_application_drafter", 1)),
        )
        self._worker_leases = {}
        for row in doc.get("leases") or []:
            lease = WorkerLease.model_validate(row)
            self._worker_leases[lease.id] = lease

    def _persist_workers_mongo(self) -> None:
        doc = {
            "_id": "worker_settings",
            **self._worker_settings.model_dump(),
            "leases": [l.model_dump(mode="json") for l in self._worker_leases.values()],
        }
        self.db.app_settings.replace_one({"_id": "worker_settings"}, doc, upsert=True)

    def update_worker_settings(self, payload: WorkerSettingsUpdate) -> WorkerSettings:
        result = super().update_worker_settings(payload)
        self._persist_workers_mongo()
        return result

    def assign_worker(self, worker_type: WorkerType, agent_key_id: str) -> str:
        lease_id = super().assign_worker(worker_type, agent_key_id)
        self._persist_workers_mongo()
        return lease_id

    def release_worker(self, lease_id: str) -> bool:
        ok = super().release_worker(lease_id)
        if ok:
            self._persist_workers_mongo()
        return ok

    def release_worker_for_agent(self, lease_id: str, agent_key_id: str) -> bool:
        ok = super().release_worker_for_agent(lease_id, agent_key_id)
        return ok

    def release_all_workers(self, worker_type: WorkerType) -> int:
        n = super().release_all_workers(worker_type)
        if n:
            self._persist_workers_mongo()
        return n

    def _load(self) -> None:
        self.users = self._load_collection(self.db.users.find(), UserInDB)
        self.industries = self._load_collection(self.db.industries.find(), Industry)
        self.companies = self._load_collection(self.db.companies.find(), Company)
        self.profiles = self._load_collection(self.db.profiles.find(), Profile)
        self.applications = self._load_collection(self.db.applications.find(), Application)
        self.audit_events = self._load_collection(self.db.audit_events.find(), AuditEvent)
        self.notifications = self._load_collection(self.db.notifications.find(), UserNotification)
        self.agent_api_keys = self._load_collection(self.db.agent_api_keys.find(), AgentApiKeyInDB)
        self.per_profile_applications = self._load_collection(
            self.db.per_profile_applications.find(), PerProfileApplication
        )
        self.emails = self._load_collection(self.db.emails.find(), Email)

    def _load_collection(self, rows: Iterable[dict], model):
        loaded = {}
        for row in rows:
            row["id"] = str(row["_id"])
            row.pop("_id")
            loaded[row["id"]] = model.model_validate(row)
        return loaded

    def _model_from_mongo_row(self, row: dict, model):
        payload = dict(row)
        payload["id"] = str(payload.pop("_id"))
        return model.model_validate(payload)

    def _models_from_mongo_rows(self, rows: Iterable[dict], model):
        return [self._model_from_mongo_row(row, model) for row in rows]

    def _mongo_find_page(
        self,
        collection_name: str,
        query: dict,
        model,
        *,
        sort: list[tuple[str, int]] | None = None,
        skip: int = 0,
        limit: int | None = None,
        collation: dict | None = None,
        projection: dict[str, int] | None = None,
    ):
        cursor = self.db[collection_name].find(query, projection)
        if collation and hasattr(cursor, "collation"):
            cursor = cursor.collation(collation)
        if sort:
            cursor = cursor.sort(sort)
        if skip:
            cursor = cursor.skip(skip)
        if limit is not None:
            cursor = cursor.limit(limit)
        return self._models_from_mongo_rows(cursor, model)

    def _mongo_find_docs(
        self,
        collection_name: str,
        query: dict,
        *,
        sort: list[tuple[str, int]] | None = None,
        skip: int = 0,
        limit: int | None = None,
        projection: dict[str, int] | None = None,
        collation: dict | None = None,
    ) -> list[dict]:
        cursor = self.db[collection_name].find(query, projection)
        if collation and hasattr(cursor, "collation"):
            cursor = cursor.collation(collation)
        if sort:
            cursor = cursor.sort(sort)
        if skip:
            cursor = cursor.skip(skip)
        if limit is not None:
            cursor = cursor.limit(limit)
        return list(cursor)

    def _industry_query(
        self, search: str | None, exclude_ids: list[str] | None = None
    ) -> dict[str, object]:
        query: dict[str, object] = {}
        if search:
            query["name"] = {"$regex": re.escape(search), "$options": "i"}
        if exclude_ids:
            query["_id"] = {"$nin": list(dict.fromkeys(exclude_ids))}
        return query

    def _literal_contains_filter(self, value: str) -> dict:
        return {"$regex": re.escape(value), "$options": "i"}

    def _mongo_json_datetime(self, value: datetime) -> str:
        return value.isoformat().replace("+00:00", "Z")

    def _company_research_status_filter(self, status: CompanyResearchStatus) -> dict:
        if status == CompanyResearchStatus.indexed:
            return {
                "$or": [
                    {"research_status": status.value},
                    {"research_status": {"$exists": False}, "indexed": True},
                ]
            }
        if status == CompanyResearchStatus.pending:
            return {
                "$or": [
                    {"research_status": status.value},
                    {"research_status": {"$exists": False}, "indexed": {"$ne": True}},
                ]
            }
        return {"research_status": status.value}

    def _application_status_values_for_query(self, status: ApplicationStatus) -> list[str]:
        values = {
            raw
            for raw in (
                "draft",
                "pending_preparation",
                "researching",
                "analysis_ready",
                "preparation_ready",
                "applied",
                *[item.value for item in ApplicationStatus],
            )
            if migrate_legacy_application_status(raw)[0] == status
        }
        return sorted(values)

    def _company_sort_spec(self, sort: str) -> list[tuple[str, int]]:
        if sort == "created_at_desc":
            return [("created_at", -1)]
        if sort == "created_at_asc":
            return [("created_at", 1)]
        if sort == "updated_at_asc":
            return [("updated_at", 1)]
        if sort == "name_asc":
            return [("name", 1)]
        return [("updated_at", -1)]

    def _application_sort_spec(self, sort: str) -> list[tuple[str, int]]:
        if sort == "created_at_asc":
            return [("created_at", 1)]
        if sort == "created_at_desc":
            return [("created_at", -1)]
        if sort == "updated_at_asc":
            return [("updated_at", 1)]
        return [("updated_at", -1)]

    def _company_ids_with_applications_mongo(self, query: dict | None = None) -> set[str]:
        return {str(value) for value in self.db.applications.distinct("company_id", query or {})}

    def _annotate_companies_has_application_mongo(self, companies: list[Company]) -> list[Company]:
        if not companies:
            return []
        company_ids = [company.id for company in companies]
        app_company_ids = self._company_ids_with_applications_mongo(
            {"company_id": {"$in": company_ids}}
        )
        return [
            company.model_copy(update={"has_application": company.id in app_company_ids})
            for company in companies
        ]

    def _annotate_company_summaries_has_application_mongo(
        self, companies: list[CompanyListItem]
    ) -> list[CompanyListItem]:
        if not companies:
            return []
        company_ids = [company.id for company in companies]
        app_company_ids = self._company_ids_with_applications_mongo(
            {"company_id": {"$in": company_ids}}
        )
        return [
            company.model_copy(update={"has_application": company.id in app_company_ids})
            for company in companies
        ]

    def _company_list_query(
        self,
        search: str | None,
        research_status: CompanyResearchStatus | None,
        has_application: bool | None,
    ) -> dict[str, object]:
        query: dict[str, object] = {"archived": {"$ne": True}}
        if search:
            query["name"] = self._literal_contains_filter(search)
        if research_status is not None:
            query = {
                "$and": [
                    query,
                    self._company_research_status_filter(research_status),
                ]
            }
        if has_application is not None:
            company_ids = list(self._company_ids_with_applications_mongo())
            query["_id"] = {"$in" if has_application else "$nin": company_ids}
        return query

    def _sync(self) -> None:
        # Repair/bootstrap fallback only. Normal writes must use targeted helpers below.
        self._sync_collection("users", self.users)
        self._sync_collection("industries", self.industries)
        self._sync_collection("companies", self.companies)
        self._sync_collection("profiles", self.profiles)
        self._sync_collection("applications", self.applications)
        self._sync_collection("audit_events", self.audit_events)
        self._sync_collection("notifications", self.notifications)
        self._sync_collection("agent_api_keys", self.agent_api_keys)
        self._sync_collection("per_profile_applications", self.per_profile_applications)
        self._sync_collection("emails", self.emails)

    def _sync_collection(self, name: str, values: dict):
        collection = self.db[name]
        collection.delete_many({})
        docs = []
        for item in values.values():
            payload = item.model_dump(mode="json")
            payload["_id"] = payload["id"]
            payload.pop("id")
            docs.append(payload)
        if docs:
            collection.insert_many(docs)

    @contextmanager
    def bulk_persistence(self):
        batch = _MONGO_PERSISTENCE_BATCH.get()
        token = None
        if batch is None:
            batch = _MongoPersistenceBatch()
            token = _MONGO_PERSISTENCE_BATCH.set(batch)
        batch.depth += 1
        try:
            yield
        finally:
            batch.depth -= 1
            if token is not None:
                try:
                    self._flush_bulk_persistence(batch)
                finally:
                    _MONGO_PERSISTENCE_BATCH.reset(token)

    def _flush_bulk_persistence(self, batch: _MongoPersistenceBatch) -> None:
        for collection_name in set(batch.deletes) | set(batch.replacements):
            collection = self.db[collection_name]
            ids = batch.deletes.get(collection_name, set())
            values = batch.replacements.get(collection_name, {})
            operations = [DeleteOne({"_id": item_id}) for item_id in ids]
            operations.extend(
                ReplaceOne(
                    {"_id": item.id}, self._serialize_document(item), upsert=True
                )
                for item in values.values()
            )
            if not operations:
                continue
            if hasattr(collection, "bulk_write"):
                collection.bulk_write(operations, ordered=False)
                continue
            for item_id in ids:
                collection.delete_one({"_id": item_id})
            for item in values.values():
                self._persist_document_now(collection_name, item)

    def _serialize_document(self, item) -> dict:
        payload = item.model_dump(mode="json")
        payload["_id"] = payload["id"]
        payload.pop("id")
        return payload

    def _persist_document_now(self, collection_name: str, item) -> None:
        self.db[collection_name].replace_one(
            {"_id": item.id}, self._serialize_document(item), upsert=True
        )

    def _persist_document(self, collection_name: str, item) -> None:
        batch = _MONGO_PERSISTENCE_BATCH.get()
        if batch is not None:
            item_id = str(item.id)
            batch.deletes.setdefault(collection_name, set()).discard(item_id)
            batch.replacements.setdefault(collection_name, {})[item_id] = item
            return
        self._persist_document_now(collection_name, item)

    def _delete_document(self, collection_name: str, item_id: str) -> None:
        batch = _MONGO_PERSISTENCE_BATCH.get()
        if batch is not None:
            batch.replacements.setdefault(collection_name, {}).pop(item_id, None)
            batch.deletes.setdefault(collection_name, set()).add(item_id)
            return
        self.db[collection_name].delete_one({"_id": item_id})

    def _persist_ids(self, collection_name: str, values: dict, item_ids: set[str]) -> None:
        for item_id in item_ids:
            item = values.get(item_id)
            if item is None:
                self._delete_document(collection_name, item_id)
            else:
                self._persist_document(collection_name, item)

    def _changed_ids(self, before: dict[str, object], values: dict) -> set[str]:
        item_ids = set(before) | set(values)
        return {item_id for item_id in item_ids if before.get(item_id) != values.get(item_id)}

    def _applications_for_company(self, company_id: str) -> dict[str, Application]:
        return {a.id: a for a in self.applications.values() if a.company_id == company_id}

    def _ppas_for_applications(self, application_ids: set[str]) -> dict[str, PerProfileApplication]:
        return {
            p.id: p
            for p in self.per_profile_applications.values()
            if p.application_id in application_ids
        }

    def _ppa_ids_for_applications(self, application_ids: set[str]) -> set[str]:
        return set(self._ppas_for_applications(application_ids))

    def _emails_for_ppas(self, ppa_ids: set[str]) -> dict[str, Email]:
        return {
            e.id: e for e in self.emails.values() if e.per_profile_application_id in ppa_ids
        }

    def _email_ids_for_ppas(self, ppa_ids: set[str]) -> set[str]:
        return set(self._emails_for_ppas(ppa_ids))

    def _mongo_application_ids_for_company(
        self, company_id: str, *, include_archived: bool = True
    ) -> set[str]:
        query: dict[str, object] = {"company_id": company_id}
        if not include_archived:
            query["status"] = {"$ne": ApplicationStatus.archived.value}
        return {
            str(application_id)
            for application_id in self.db.applications.distinct("_id", query)
            if application_id is not None
        }

    def _mongo_ppa_ids_for_applications(self, application_ids: set[str]) -> set[str]:
        if not application_ids:
            return set()
        return {
            str(ppa_id)
            for ppa_id in self.db.per_profile_applications.distinct(
                "_id", {"application_id": {"$in": sorted(application_ids)}}
            )
            if ppa_id is not None
        }

    def _mongo_email_ids_for_ppas(self, ppa_ids: set[str]) -> set[str]:
        if not ppa_ids:
            return set()
        return {
            str(email_id)
            for email_id in self.db.emails.distinct(
                "_id", {"per_profile_application_id": {"$in": sorted(ppa_ids)}}
            )
            if email_id is not None
        }

    def list_companies(
        self,
        skip: int,
        limit: int,
        search: str | None,
        sort: str = "updated_at_desc",
        research_status: CompanyResearchStatus | None = None,
        has_application: bool | None = None,
    ) -> list[Company]:
        query = self._company_list_query(search, research_status, has_application)
        companies = self._mongo_find_page(
            "companies",
            query,
            Company,
            sort=self._company_sort_spec(sort),
            skip=skip,
            limit=limit,
            collation={"locale": "en", "strength": 2} if sort == "name_asc" else None,
        )
        return self._annotate_companies_has_application_mongo(companies)

    def list_company_summaries(
        self,
        skip: int,
        limit: int,
        search: str | None,
        sort: str = "updated_at_desc",
        research_status: CompanyResearchStatus | None = None,
        has_application: bool | None = None,
    ) -> list[CompanyListItem]:
        companies = self._mongo_find_page(
            "companies",
            self._company_list_query(search, research_status, has_application),
            CompanyListItem,
            sort=self._company_sort_spec(sort),
            skip=skip,
            limit=limit,
            collation={"locale": "en", "strength": 2} if sort == "name_asc" else None,
            projection={
                "_id": 1,
                "name": 1,
                "website": 1,
                "research_status": 1,
                "indexed": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        )
        return self._annotate_company_summaries_has_application_mongo(companies)

    def list_company_research_tasks(
        self, limit: int
    ) -> list[AgentCompanyResearchTaskSummary]:
        query = {
            "$and": [
                {"archived": {"$ne": True}},
                self._company_research_status_filter(CompanyResearchStatus.pending),
            ]
        }
        docs = self._mongo_find_docs(
            "companies",
            query,
            sort=[("created_at", 1)],
            limit=limit,
            projection={
                "_id": 1,
                "name": 1,
                "website": 1,
                "research_status": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        )
        company_ids = [str(doc["_id"]) for doc in docs]
        company_ids_with_apps = self._company_ids_with_applications_mongo(
            {"company_id": {"$in": company_ids}}
        )
        return [
            AgentCompanyResearchTaskSummary(
                id=str(doc["_id"]),
                name=doc["name"],
                website=doc.get("website"),
                research_status=Company.model_validate({**doc, "id": str(doc["_id"])}).research_status,
                has_application=str(doc["_id"]) in company_ids_with_apps,
                created_at=doc["created_at"],
                updated_at=doc["updated_at"],
            )
            for doc in docs
        ]

    def list_profiles(
        self,
        skip: int,
        limit: int,
        search: str | None,
        include_frozen: bool = True,
        frozen: bool | None = None,
    ) -> list[Profile]:
        query: dict[str, object] = {}
        if frozen is True:
            query["frozen"] = True
        elif frozen is False:
            query["frozen"] = {"$ne": True}
        elif not include_frozen:
            query["frozen"] = {"$ne": True}
        if search:
            search_filter = self._literal_contains_filter(search)
            query["$or"] = [
                {"name": search_filter},
                {"email": search_filter},
                {"location": search_filter},
                {"niche_info_md": search_filter},
            ]
        return self._mongo_find_page(
            "profiles",
            query,
            Profile,
            sort=[("name", 1)],
            skip=skip,
            limit=limit,
            collation={"locale": "en", "strength": 2},
        )

    def list_profile_summaries(
        self,
        skip: int,
        limit: int,
        search: str | None,
        frozen: bool | None = None,
    ) -> list[ProfileListItem]:
        query: dict[str, object] = {}
        if frozen is True:
            query["frozen"] = True
        elif frozen is False:
            query["frozen"] = {"$ne": True}
        if search:
            search_filter = self._literal_contains_filter(search)
            query["$or"] = [
                {"name": search_filter},
                {"email": search_filter},
                {"location": search_filter},
                {"niche_info_md": search_filter},
            ]
        docs = self._mongo_find_docs(
            "profiles",
            query,
            sort=[("name", 1)],
            skip=skip,
            limit=limit,
            projection={
                "_id": 1,
                "name": 1,
                "frozen": 1,
                "location": 1,
                "email": 1,
                "phone": 1,
                "created_at": 1,
                "updated_at": 1,
            },
            collation={"locale": "en", "strength": 2},
        )
        return [
            ProfileListItem(
                id=str(doc["_id"]),
                name=doc["name"],
                frozen=bool(doc.get("frozen", False)),
                location=doc.get("location"),
                email=doc.get("email"),
                phone=doc.get("phone"),
                created_at=doc["created_at"],
                updated_at=doc["updated_at"],
            )
            for doc in docs
        ]

    def list_profile_names_by_ids(self, profile_ids: list[str]) -> dict[str, str]:
        ids = list(dict.fromkeys(profile_ids))
        if not ids:
            return {}
        docs = self._mongo_find_docs(
            "profiles",
            {"_id": {"$in": ids}},
            projection={"_id": 1, "name": 1},
        )
        return {str(doc["_id"]): doc["name"] for doc in docs}

    def list_profile_ids(self, skip: int, limit: int, include_frozen: bool = True) -> list[str]:
        query: dict[str, object] = {}
        if not include_frozen:
            query["frozen"] = {"$ne": True}
        rows = self._mongo_find_page(
            "profiles",
            query,
            Profile,
            sort=[("created_at", 1)],
            skip=skip,
            limit=limit,
        )
        return [profile.id for profile in rows]

    def _mongo_batch_applied_profile_names_for_applications(
        self, application_ids: list[str]
    ) -> dict[str, list[AppliedProfileName]]:
        first_profile_name_by_app = self._mongo_first_applied_profile_name_by_application_ids(
            application_ids
        )
        return {
            application_id: [AppliedProfileName(profile_name=profile_name)]
            if profile_name
            else []
            for application_id in application_ids
            for profile_name in [first_profile_name_by_app.get(application_id)]
        }

    def _mongo_first_applied_profile_name_by_application_ids(
        self, application_ids: list[str]
    ) -> dict[str, str]:
        if not application_ids:
            return {}
        ppa_docs = self._mongo_find_docs(
            "per_profile_applications",
            {"application_id": {"$in": application_ids}},
            sort=[("application_id", 1), ("order_index", 1), ("created_at", 1)],
            projection={
                "_id": 1,
                "application_id": 1,
                "profile_id": 1,
                "order_index": 1,
                "created_at": 1,
            },
        )
        first_profile_id_by_app: dict[str, str] = {}
        for doc in ppa_docs:
            application_id = str(doc["application_id"])
            if application_id in first_profile_id_by_app:
                continue
            profile_id = doc.get("profile_id")
            if profile_id is None:
                continue
            first_profile_id_by_app[application_id] = str(profile_id)
        profile_ids = list(dict.fromkeys(first_profile_id_by_app.values()))
        if not profile_ids:
            return {}
        profile_docs = self._mongo_find_docs(
            "profiles",
            {"_id": {"$in": profile_ids}},
            projection={"_id": 1, "name": 1},
        )
        profile_name_by_id = {str(doc["_id"]): doc["name"] for doc in profile_docs}
        return {
            application_id: profile_name_by_id.get(profile_id, "Unknown profile")
            for application_id, profile_id in first_profile_id_by_app.items()
        }

    def _mongo_matching_company_ids_for_search(self, company_search: str) -> list[str]:
        normalized_company_search = _normalized_optional_text_filter(company_search)
        if not normalized_company_search:
            return []
        docs = self._mongo_find_docs(
            "companies",
            {"name": self._literal_contains_filter(normalized_company_search)},
            projection={"_id": 1},
        )
        return [str(doc["_id"]) for doc in docs]

    def _mongo_application_query(
        self,
        *,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        exclude_status: ApplicationStatus | None = None,
        created_by_user_id: str | None = None,
        company_search: str | None = None,
    ) -> dict[str, object] | None:
        query: dict[str, object] = {}
        if status and exclude_status:
            query["$and"] = [
                {"status": {"$in": self._application_status_values_for_query(status)}},
                {"status": {"$nin": self._application_status_values_for_query(exclude_status)}},
            ]
        elif status:
            query["status"] = {"$in": self._application_status_values_for_query(status)}
        elif exclude_status:
            query["status"] = {"$nin": self._application_status_values_for_query(exclude_status)}
        if company_id:
            query["company_id"] = company_id
        normalized_company_search = _normalized_optional_text_filter(company_search)
        if normalized_company_search:
            matching_company_ids = self._mongo_matching_company_ids_for_search(
                normalized_company_search
            )
            if not matching_company_ids:
                return None
            if company_id:
                if company_id not in matching_company_ids:
                    return None
            else:
                query["company_id"] = {"$in": matching_company_ids}
        if created_by_user_id is not None:
            query["created_by_user_id"] = created_by_user_id
        if applied is True:
            query = {"$and": [query, {"$or": [{"applied": True}, {"status": "applied"}]}]}
        elif applied is False:
            query = {"$and": [query, {"applied": {"$ne": True}}, {"status": {"$ne": "applied"}}]}
        if email_sent is not None:
            query["email_sent"] = email_sent
        return query

    def _mongo_application_ids_matching_applied_profile_names(
        self, query: dict[str, object], applied_profile_names: list[str]
    ) -> list[str]:
        selected_profile_names = set(_normalized_nonempty_text_list(applied_profile_names))
        if not selected_profile_names:
            return []
        application_ids = [str(value) for value in self.db.applications.distinct("_id", query)]
        if not application_ids:
            return []
        first_profile_name_by_app = self._mongo_first_applied_profile_name_by_application_ids(
            application_ids
        )
        return [
            application_id
            for application_id, profile_name in first_profile_name_by_app.items()
            if profile_name in selected_profile_names
        ]

    def _mongo_application_first_profile_lookup_stages(self) -> list[dict[str, object]]:
        return [
            {
                "$lookup": {
                    "from": "per_profile_applications",
                    "let": {"application_id": "$_id"},
                    "pipeline": [
                        {"$match": {"$expr": {"$eq": ["$application_id", "$$application_id"]}}},
                        {"$sort": {"order_index": 1, "created_at": 1}},
                        {"$limit": 1},
                        {"$project": {"_id": 1, "application_id": 1, "profile_id": 1}},
                    ],
                    "as": "first_ppa",
                }
            },
            {"$unwind": "$first_ppa"},
            {
                "$lookup": {
                    "from": "profiles",
                    "localField": "first_ppa.profile_id",
                    "foreignField": "_id",
                    "as": "first_profile",
                }
            },
            {"$unwind": "$first_profile"},
        ]

    def _mongo_aggregate_application_docs_by_first_profile(
        self,
        *,
        query: dict[str, object],
        profile_names: list[str],
        sort: str,
        skip: int,
        limit: int,
    ) -> list[dict] | None:
        aggregate = getattr(self.db.applications, "aggregate", None)
        if not callable(aggregate):
            return None
        pipeline: list[dict[str, object]] = [
            {"$match": query},
            *self._mongo_application_first_profile_lookup_stages(),
            {"$match": {"first_profile.name": {"$in": profile_names}}},
            {"$sort": dict(self._application_sort_spec(sort))},
        ]
        if skip:
            pipeline.append({"$skip": skip})
        pipeline.append({"$limit": limit})
        return list(aggregate(pipeline))

    def _mongo_application_profile_facets_with_aggregation(
        self, *, query: dict[str, object], limit: int
    ) -> list[str] | None:
        aggregate = getattr(self.db.applications, "aggregate", None)
        if not callable(aggregate):
            return None
        pipeline: list[dict[str, object]] = [
            {"$match": query},
            *self._mongo_application_first_profile_lookup_stages(),
            {"$group": {"_id": "$first_profile.name"}},
            {"$sort": {"_id": 1}},
            {"$limit": limit},
        ]
        return [str(doc["_id"]) for doc in aggregate(pipeline) if doc.get("_id")]

    def list_applications(
        self,
        skip: int,
        limit: int,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        sort: str = "updated_at_desc",
        exclude_status: ApplicationStatus | None = None,
        created_by_user_id: str | None = None,
        company_search: str | None = None,
        applied_profile_names: list[str] | None = None,
    ) -> list[ApplicationListItem]:
        query = self._mongo_application_query(
            status=status,
            company_id=company_id,
            applied=applied,
            email_sent=email_sent,
            exclude_status=exclude_status,
            created_by_user_id=created_by_user_id,
            company_search=company_search,
        )
        if query is None:
            return []
        selected_profile_names = _normalized_nonempty_text_list(applied_profile_names)
        if selected_profile_names:
            application_docs = self._mongo_aggregate_application_docs_by_first_profile(
                query=query,
                profile_names=selected_profile_names,
                sort=sort,
                skip=skip,
                limit=limit,
            )
            if application_docs is not None:
                applications = self._models_from_mongo_rows(application_docs, Application)
            else:
                matching_application_ids = self._mongo_application_ids_matching_applied_profile_names(
                    query, selected_profile_names
                )
                if not matching_application_ids:
                    return []
                query = {"$and": [query, {"_id": {"$in": matching_application_ids}}]}
                applications = self._mongo_find_page(
                    "applications",
                    query,
                    Application,
                    sort=self._application_sort_spec(sort),
                    skip=skip,
                    limit=limit,
                )
        else:
            applications = self._mongo_find_page(
                "applications",
                query,
                Application,
                sort=self._application_sort_spec(sort),
                skip=skip,
                limit=limit,
            )
        company_ids = list({application.company_id for application in applications})
        companies = self._mongo_find_page("companies", {"_id": {"$in": company_ids}}, Company)
        company_name_by_id = {company.id: company.name for company in companies}
        batch = self._mongo_batch_applied_profile_names_for_applications(
            [application.id for application in applications]
        )
        return [
            ApplicationListItem(
                **application.model_dump(),
                company_name=company_name_by_id.get(application.company_id, "Unknown company"),
                applied_profiles=batch.get(application.id, []),
            )
            for application in applications
        ]

    def list_application_applied_profile_facets(
        self,
        *,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        exclude_status: ApplicationStatus | None = None,
        created_by_user_id: str | None = None,
        company_search: str | None = None,
        limit: int = APPLICATION_PROFILE_FACET_LIMIT,
    ) -> list[str]:
        query = self._mongo_application_query(
            status=status,
            company_id=company_id,
            applied=applied,
            email_sent=email_sent,
            exclude_status=exclude_status,
            created_by_user_id=created_by_user_id,
            company_search=company_search,
        )
        if query is None:
            return []
        aggregated_names = self._mongo_application_profile_facets_with_aggregation(
            query=query,
            limit=limit,
        )
        if aggregated_names is not None:
            return aggregated_names
        application_ids = [str(value) for value in self.db.applications.distinct("_id", query)]
        if not application_ids:
            return []
        first_profile_name_by_app = self._mongo_first_applied_profile_name_by_application_ids(
            application_ids
        )
        return sorted(set(first_profile_name_by_app.values()), key=lambda name: name.lower())[:limit]

    def list_agent_application_tasks(
        self, status: ApplicationStatus, limit: int
    ) -> list[AgentApplicationTaskSummary]:
        application_docs = self._mongo_find_docs(
            "applications",
            {"status": {"$in": self._application_status_values_for_query(status)}},
            sort=[("created_at", 1)],
            limit=limit,
            projection={
                "_id": 1,
                "status": 1,
                "company_id": 1,
                "job_post.job_link": 1,
                "created_at": 1,
                "updated_at": 1,
            },
        )
        company_ids = list({doc["company_id"] for doc in application_docs})
        company_docs = self._mongo_find_docs(
            "companies",
            {"_id": {"$in": company_ids}},
            projection={"_id": 1, "name": 1, "website": 1},
        )
        company_by_id = {str(doc["_id"]): doc for doc in company_docs}
        return [
            AgentApplicationTaskSummary(
                id=str(doc["_id"]),
                status=migrate_legacy_application_status(str(doc["status"]))[0],
                company_id=doc["company_id"],
                company_name=company_by_id.get(doc["company_id"], {}).get(
                    "name", "Unknown company"
                ),
                company_website=company_by_id.get(doc["company_id"], {}).get("website"),
                job_link=(doc.get("job_post") or {}).get("job_link"),
                created_at=doc["created_at"],
                updated_at=doc["updated_at"],
            )
            for doc in application_docs
        ]

    def list_audit_events(self, query: AuditListQuery) -> list[AuditEvent]:
        mongo_query: dict[str, object] = {}
        if query.actor_type:
            mongo_query["actor_type"] = query.actor_type.value
        if query.entity_type:
            mongo_query["entity_type"] = query.entity_type
        created_at: dict[str, str] = {}
        if query.from_ts:
            created_at["$gte"] = self._mongo_json_datetime(query.from_ts)
        if query.to_ts:
            created_at["$lte"] = self._mongo_json_datetime(query.to_ts)
        if created_at:
            mongo_query["created_at"] = created_at
        return self._mongo_find_page(
            "audit_events",
            mongo_query,
            AuditEvent,
            sort=[("created_at", -1)],
            skip=query.skip,
            limit=query.limit,
        )

    def list_notifications(self, user_id: str, q: NotificationListQuery) -> list[UserNotification]:
        query: dict[str, object] = {"user_id": user_id}
        if q.unread_only:
            query["read_at"] = None
        return self._mongo_find_page(
            "notifications",
            query,
            UserNotification,
            sort=[("timestamp", -1)],
            skip=q.skip,
            limit=q.limit,
        )

    def list_per_profile_for_application(
        self, application_id: str
    ) -> list[PerProfileApplication]:
        return self._mongo_find_page(
            "per_profile_applications",
            {"application_id": application_id},
            PerProfileApplication,
            sort=[("order_index", 1), ("created_at", 1)],
        )

    def list_emails_for_ppas(self, per_profile_application_ids: list[str]) -> dict[str, list[Email]]:
        ppa_ids = list(dict.fromkeys(per_profile_application_ids))
        if not ppa_ids:
            return {}
        rows = self._mongo_find_page(
            "emails",
            {"per_profile_application_id": {"$in": ppa_ids}},
            Email,
            sort=[("per_profile_application_id", 1), ("created_at", 1)],
        )
        grouped = {ppa_id: [] for ppa_id in ppa_ids}
        for email in rows:
            grouped.setdefault(email.per_profile_application_id, []).append(email)
        return grouped

    def count_industries(self, search: str | None) -> int:
        return self.db.industries.count_documents(self._industry_query(search))

    def list_industries(self, skip: int, limit: int, search: str | None) -> list[Industry]:
        return self._mongo_find_page(
            "industries",
            self._industry_query(search),
            Industry,
            sort=[("name", 1)],
            skip=skip,
            limit=limit,
            collation={"locale": "en", "strength": 2},
        )

    def get_industries_by_ids(self, industry_ids: list[str]) -> list[Industry]:
        ids = list(dict.fromkeys(industry_ids))
        if not ids:
            return []
        rows = self._mongo_find_page("industries", {"_id": {"$in": ids}}, Industry)
        by_id = {industry.id: industry for industry in rows}
        return [by_id[industry_id] for industry_id in ids if industry_id in by_id]

    def list_industry_options(
        self,
        *,
        limit: int,
        search: str | None,
        exclude_ids: list[str] | None = None,
    ) -> list[Industry]:
        return self._mongo_find_page(
            "industries",
            self._industry_query(search, exclude_ids),
            Industry,
            sort=[("name", 1)],
            limit=limit,
            collation={"locale": "en", "strength": 2},
        )

    def create_user(self, payload: UserCreate, password_hash: str) -> UserInDB:
        user = super().create_user(payload, password_hash)
        self._persist_document("users", user)
        return user

    def create_industry(self, payload: IndustryCreate) -> Industry:
        industry = super().create_industry(payload)
        self._persist_document("industries", industry)
        return industry

    def update_industry(self, industry_id: str, payload: IndustryUpdate) -> Industry | None:
        industry = super().update_industry(industry_id, payload)
        if industry:
            self._persist_document("industries", industry)
        return industry

    def delete_industry(self, industry_id: str) -> bool:
        deleted = super().delete_industry(industry_id)
        if deleted:
            self._delete_document("industries", industry_id)
        return deleted

    def update_company(self, company_id: str, payload: CompanyUpdate) -> Company | None:
        applications_before = self._applications_for_company(company_id)
        company = super().update_company(company_id, payload)
        if company:
            application_ids = self._changed_ids(
                applications_before, self._applications_for_company(company_id)
            )
            self._persist_document("companies", company)
            self._persist_ids("applications", self.applications, application_ids)
        return company

    def create_company(self, payload: CompanyCreate) -> Company:
        company = super().create_company(payload)
        self._persist_document("companies", company)
        return company

    def unarchive_company(self, company_id: str, payload: CompanyCreate) -> Company | None:
        company = super().unarchive_company(company_id, payload)
        if company:
            self._persist_document("companies", company)
        return company

    def archive_company(self, company_id: str, archive_reason: str) -> tuple[bool, int]:
        applications_before = self._applications_for_company(company_id)
        ok, n = super().archive_company(company_id, archive_reason)
        if ok:
            application_ids = self._changed_ids(
                applications_before, self._applications_for_company(company_id)
            )
            self._persist_document("companies", self.companies[company_id])
            self._persist_ids("applications", self.applications, application_ids)
        return (ok, n)

    def count_applications_for_company(self, company_id: str) -> int:
        return self.db.applications.count_documents({"company_id": company_id})

    def clear_company_research_detail(
        self,
        company_id: str,
        *,
        related_applications: Literal["none", "archive", "reset"] = "none",
    ) -> Company | None:
        company = self.get_company(company_id)
        if not company:
            return None
        cleared_company = self._clear_company_research_detail_model(company)
        self.companies[company_id] = cleared_company
        with self.bulk_persistence():
            self._persist_document("companies", cleared_company)
            if related_applications == "archive":
                application_ids = self._mongo_application_ids_for_company(company_id)
                for application_id in application_ids:
                    application = self.applications.get(application_id)
                    if application is None:
                        continue
                    merged = self._archive_application_for_company(
                        application, RELATED_COMPANY_RESEARCH_CLEARED_ARCHIVE_REASON
                    )
                    self.applications[application_id] = merged
                    self._persist_document("applications", merged)
            elif related_applications == "reset":
                application_ids = self._mongo_application_ids_for_company(
                    company_id, include_archived=False
                )
                ppa_ids = self._mongo_ppa_ids_for_applications(application_ids)
                email_ids = self._mongo_email_ids_for_ppas(ppa_ids)
                next_status = self._initial_application_status_for_company(company_id)
                for email_id in email_ids:
                    self.emails.pop(email_id, None)
                    self._delete_document("emails", email_id)
                for ppa_id in ppa_ids:
                    self.per_profile_applications.pop(ppa_id, None)
                    self._delete_document("per_profile_applications", ppa_id)
                for application_id in application_ids:
                    application = self.applications.get(application_id)
                    if application is None:
                        continue
                    merged = self._clear_application_model_to_company_research_pending(
                        application, next_status=next_status
                    )
                    self.applications[application_id] = merged
                    self._persist_document("applications", merged)
        return cleared_company

    def dashboard_application_counts(self, created_by_user_id: str | None = None) -> dict[str, int]:
        base_filter: dict[str, object] = {
            "status": {"$ne": ApplicationStatus.archived.value},
        }
        if created_by_user_id is not None:
            base_filter["created_by_user_id"] = created_by_user_id
        pipeline_filter = {
            **base_filter,
            "status": {
                "$in": [
                    ApplicationStatus.company_research_pending.value,
                    ApplicationStatus.company_researching.value,
                ]
            },
        }
        ready_filter = {
            **base_filter,
            "status": ApplicationStatus.application_ready.value,
        }
        actions_filter = {
            **ready_filter,
            "applied": False,
        }
        return {
            "company_research_pipeline": self.db.applications.count_documents(pipeline_filter),
            "application_ready": self.db.applications.count_documents(ready_filter),
            "actions_need_review": self.db.applications.count_documents(actions_filter),
        }

    def create_profile(self, payload: ProfileCreate) -> Profile:
        profile = super().create_profile(payload)
        self._persist_document("profiles", profile)
        return profile

    def update_profile(self, profile_id: str, payload: ProfileUpdate) -> Profile | None:
        profile = super().update_profile(profile_id, payload)
        if profile:
            self._persist_document("profiles", profile)
        return profile

    def delete_profile(self, profile_id: str) -> bool:
        deleted = super().delete_profile(profile_id)
        if deleted:
            self._delete_document("profiles", profile_id)
        return deleted

    def create_application(self, payload: ApplicationCreate, created_by_user_id: str | None) -> Application:
        application = super().create_application(payload, created_by_user_id)
        self._persist_document("applications", application)
        return application

    def bootstrap_application(
        self,
        company: Company,
        payload: ApplicationBootstrapCreate,
        created_by_user_id: str | None,
    ) -> tuple[Company, Application]:
        result = super().bootstrap_application(company, payload, created_by_user_id)
        return result

    def update_application(
        self, application_id: str, payload: ApplicationUpdate
    ) -> Application | None:
        application = super().update_application(application_id, payload)
        if application:
            self._persist_document("applications", application)
        return application

    def mark_application_applied(
        self, application_id: str, applied: bool, *, force: bool = False
    ) -> Application | None:
        application = super().mark_application_applied(application_id, applied, force=force)
        if application:
            self._persist_document("applications", application)
        return application

    def mark_application_email_sent(
        self, application_id: str, sent: bool
    ) -> Application | None:
        application = super().mark_application_email_sent(application_id, sent)
        if application:
            self._persist_document("applications", application)
        return application

    def delete_application(self, application_id: str) -> bool:
        deleted = super().delete_application(application_id)
        if deleted:
            self._delete_document("applications", application_id)
        return deleted

    def clear_application_to_company_research_pending(self, application_id: str) -> Application | None:
        application_ids = {application_id}
        ppa_ids = self._ppa_ids_for_applications(application_ids)
        email_ids = self._email_ids_for_ppas(ppa_ids)
        application = super().clear_application_to_company_research_pending(application_id)
        if application:
            ppa_ids.update(self._ppa_ids_for_applications(application_ids))
            email_ids.update(self._email_ids_for_ppas(ppa_ids))
            self._persist_document("applications", application)
            self._persist_ids(
                "per_profile_applications", self.per_profile_applications, ppa_ids
            )
            self._persist_ids("emails", self.emails, email_ids)
        return application

    def create_audit_event(
        self,
        *,
        actor_type: str,
        actor_id: str,
        action: str,
        entity_type: str,
        entity_id: str,
        metadata: dict | None = None,
    ) -> AuditEvent:
        event = super().create_audit_event(
            actor_type=actor_type,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata=metadata,
        )
        self._persist_document("audit_events", event)
        return event

    def create_notification(
        self,
        *,
        user_id: str,
        notification: NotificationKind,
        notification_type: NotificationSeverity,
        payload: NotificationPayload,
        timestamp: datetime | None = None,
        check: bool = False,
    ) -> UserNotification:
        note = super().create_notification(
            user_id=user_id,
            notification=notification,
            notification_type=notification_type,
            payload=payload,
            timestamp=timestamp,
            check=check,
        )
        self._persist_document("notifications", note)
        return note

    def mark_notification_read(self, user_id: str, notification_id: str) -> UserNotification | None:
        note = super().mark_notification_read(user_id, notification_id)
        if note:
            self._persist_document("notifications", note)
        return note

    def mark_notifications_read_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        owned_ids = {
            note_id
            for note_id in dict.fromkeys(notification_ids)
            if (
                (note := self.notifications.get(note_id))
                and note.user_id == user_id
                and note.read_at is None
            )
        }
        n = super().mark_notifications_read_bulk(user_id, notification_ids)
        if n:
            self._persist_ids("notifications", self.notifications, owned_ids)
        return n

    def delete_notification(self, user_id: str, notification_id: str) -> bool:
        ok = super().delete_notification(user_id, notification_id)
        if ok:
            self._delete_document("notifications", notification_id)
        return ok

    def delete_notifications_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        owned_ids = {
            note_id
            for note_id in dict.fromkeys(notification_ids)
            if (
                (note := self.notifications.get(note_id))
                and note.user_id == user_id
            )
        }
        n = super().delete_notifications_bulk(user_id, notification_ids)
        if n:
            self._persist_ids("notifications", self.notifications, owned_ids)
        return n

    def create_agent_api_key(self, payload: AgentApiKeyCreate, key_hash: str) -> AgentApiKeyInDB:
        rec = super().create_agent_api_key(payload, key_hash)
        self._persist_document("agent_api_keys", rec)
        return rec

    def revoke_agent_api_key(self, key_id: str) -> bool:
        revoked = super().revoke_agent_api_key(key_id)
        if revoked:
            self._delete_document("agent_api_keys", key_id)
            self._persist_workers_mongo()
        return revoked

    def touch_agent_api_key_used(self, key_id: str) -> None:
        super().touch_agent_api_key_used(key_id)
        key = self.agent_api_keys.get(key_id)
        if not key:
            return
        payload = key.model_dump(mode="json")
        payload["_id"] = payload.pop("id")
        self.db.agent_api_keys.replace_one({"_id": key_id}, payload, upsert=True)

    def create_per_profile_application(
        self, payload: PerProfileApplicationCreate
    ) -> PerProfileApplication:
        ppa = super().create_per_profile_application(payload)
        self._persist_document("per_profile_applications", ppa)
        return ppa

    def update_per_profile_application(
        self, ppa_id: str, payload: PerProfileApplicationUpdate
    ) -> PerProfileApplication | None:
        ppa = super().update_per_profile_application(ppa_id, payload)
        if ppa:
            self._persist_document("per_profile_applications", ppa)
        return ppa

    def delete_per_profile_application(self, ppa_id: str) -> bool:
        deleted = super().delete_per_profile_application(ppa_id)
        if deleted:
            self._delete_document("per_profile_applications", ppa_id)
        return deleted

    def create_email(self, payload: EmailCreate) -> Email:
        email = super().create_email(payload)
        self._persist_document("emails", email)
        return email

    def update_email(self, email_id: str, payload: EmailUpdate) -> Email | None:
        email = super().update_email(email_id, payload)
        if email:
            self._persist_document("emails", email)
        return email

    def mark_email_sent(self, email_id: str, sent: bool) -> Email | None:
        email = super().mark_email_sent(email_id, sent)
        if email:
            self._persist_document("emails", email)
        return email

    def delete_email(self, email_id: str) -> bool:
        deleted = super().delete_email(email_id)
        if deleted:
            self._delete_document("emails", email_id)
        return deleted

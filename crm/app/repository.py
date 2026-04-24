from __future__ import annotations

from collections.abc import Iterable
from typing import Literal
from datetime import datetime
from uuid import uuid4

from pymongo import MongoClient

from app.company_name import normalize_company_name
from app.config import settings
from app.models import (
    AgentApiKeyCreate,
    AgentApiKeyInDB,
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
    utcnow,
    validate_application_transition,
)

# When company research is cleared and the user chooses to archive related applications.
RELATED_COMPANY_RESEARCH_CLEARED_ARCHIVE_REASON = "Related company research cleared"


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


class BaseRepository:
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

    def list_companies_unindexed(self, limit: int) -> list[Company]:
        """Companies with research_status=pending, oldest created first (FIFO)."""
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
        self, skip: int, limit: int, search: str | None, include_frozen: bool = True
    ) -> list[Profile]:
        raise NotImplementedError

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
    ) -> list[ApplicationListItem]:
        raise NotImplementedError

    def list_applications_by_status(self, status: ApplicationStatus, limit: int) -> list[Application]:
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

    def list_industries(self, skip: int, limit: int, search: str | None) -> list[Industry]:
        values = list(self.industries.values())
        if search:
            needle = search.lower()
            values = [i for i in values if needle in i.name.lower()]
        values.sort(key=lambda i: i.name.lower())
        return values[skip : skip + limit]

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

    def list_companies_unindexed(self, limit: int) -> list[Company]:
        values = [
            c
            for c in self.companies.values()
            if c.research_status == CompanyResearchStatus.pending and not c.archived
        ]
        values.sort(key=lambda c: c.created_at)
        return values[:limit]

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
            if application.status != ApplicationStatus.archived:
                if not validate_application_transition(
                    application.status, ApplicationStatus.archived
                ):
                    raise ValueError(
                        f"Cannot archive application {app_id} from status {application.status}"
                    )
                merged = application.model_copy(
                    update={
                        "status": ApplicationStatus.archived,
                        "archive_reason": archive_reason,
                        "updated_at": utcnow(),
                    }
                )
            else:
                merged = application.model_copy(
                    update={
                        "archive_reason": archive_reason,
                        "updated_at": utcnow(),
                    }
                )
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
        self, skip: int, limit: int, search: str | None, include_frozen: bool = True
    ) -> list[Profile]:
        values = list(self.profiles.values())
        if not include_frozen:
            values = [p for p in values if not p.frozen]
        if search:
            needle = search.lower()
            values = [p for p in values if needle in p.name.lower()]
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

        out: dict[str, list[AppliedProfileName]] = {}
        for aid in application_ids:
            rows = sorted(ppas_by_app[aid], key=lambda p: (p.order_index, p.created_at))
            first_ppa = rows[0] if rows else None
            if not first_ppa:
                out[aid] = []
                continue
            prof = self.get_profile(first_ppa.profile_id)
            display = prof.name if prof else "Unknown profile"
            out[aid] = [AppliedProfileName(profile_name=display)]
        return out

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
    ) -> list[ApplicationListItem]:
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

    def list_applications_by_status(self, status: ApplicationStatus, limit: int) -> list[Application]:
        rows = [a for a in self.applications.values() if a.status == status]
        rows = _sort_applications(rows, "created_at_asc")
        return rows[:limit]

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
        merged = application.model_copy(
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
        merged = company.model_copy(
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
        return self.agent_api_keys.pop(key_id, None) is not None

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
        self._load()
        self._load_workers_mongo()

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

    def _sync(self) -> None:
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

    def create_user(self, payload: UserCreate, password_hash: str) -> UserInDB:
        user = super().create_user(payload, password_hash)
        self._sync()
        return user

    def create_industry(self, payload: IndustryCreate) -> Industry:
        industry = super().create_industry(payload)
        self._sync()
        return industry

    def update_industry(self, industry_id: str, payload: IndustryUpdate) -> Industry | None:
        industry = super().update_industry(industry_id, payload)
        self._sync()
        return industry

    def delete_industry(self, industry_id: str) -> bool:
        deleted = super().delete_industry(industry_id)
        self._sync()
        return deleted

    def update_company(self, company_id: str, payload: CompanyUpdate) -> Company | None:
        company = super().update_company(company_id, payload)
        self._sync()
        return company

    def create_company(self, payload: CompanyCreate) -> Company:
        company = super().create_company(payload)
        self._sync()
        return company

    def unarchive_company(self, company_id: str, payload: CompanyCreate) -> Company | None:
        company = super().unarchive_company(company_id, payload)
        if company:
            self._sync()
        return company

    def archive_company(self, company_id: str, archive_reason: str) -> tuple[bool, int]:
        ok, n = super().archive_company(company_id, archive_reason)
        if ok:
            self._sync()
        return (ok, n)

    def clear_company_research_detail(
        self,
        company_id: str,
        *,
        related_applications: Literal["none", "archive", "reset"] = "none",
    ) -> Company | None:
        company = super().clear_company_research_detail(
            company_id, related_applications=related_applications
        )
        if company:
            self._sync()
        return company

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
        self._sync()
        return profile

    def update_profile(self, profile_id: str, payload: ProfileUpdate) -> Profile | None:
        profile = super().update_profile(profile_id, payload)
        self._sync()
        return profile

    def delete_profile(self, profile_id: str) -> bool:
        deleted = super().delete_profile(profile_id)
        self._sync()
        return deleted

    def create_application(self, payload: ApplicationCreate, created_by_user_id: str | None) -> Application:
        application = super().create_application(payload, created_by_user_id)
        self._sync()
        return application

    def bootstrap_application(
        self,
        company: Company,
        payload: ApplicationBootstrapCreate,
        created_by_user_id: str | None,
    ) -> tuple[Company, Application]:
        result = super().bootstrap_application(company, payload, created_by_user_id)
        self._sync()
        return result

    def update_application(
        self, application_id: str, payload: ApplicationUpdate
    ) -> Application | None:
        application = super().update_application(application_id, payload)
        self._sync()
        return application

    def mark_application_applied(
        self, application_id: str, applied: bool, *, force: bool = False
    ) -> Application | None:
        application = super().mark_application_applied(application_id, applied, force=force)
        self._sync()
        return application

    def mark_application_email_sent(
        self, application_id: str, sent: bool
    ) -> Application | None:
        application = super().mark_application_email_sent(application_id, sent)
        self._sync()
        return application

    def delete_application(self, application_id: str) -> bool:
        deleted = super().delete_application(application_id)
        self._sync()
        return deleted

    def clear_application_to_company_research_pending(self, application_id: str) -> Application | None:
        application = super().clear_application_to_company_research_pending(application_id)
        self._sync()
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
        self._sync()
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
        self._sync()
        return note

    def mark_notification_read(self, user_id: str, notification_id: str) -> UserNotification | None:
        note = super().mark_notification_read(user_id, notification_id)
        self._sync()
        return note

    def mark_notifications_read_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        n = super().mark_notifications_read_bulk(user_id, notification_ids)
        if n:
            self._sync()
        return n

    def delete_notification(self, user_id: str, notification_id: str) -> bool:
        ok = super().delete_notification(user_id, notification_id)
        if ok:
            self._sync()
        return ok

    def delete_notifications_bulk(self, user_id: str, notification_ids: list[str]) -> int:
        n = super().delete_notifications_bulk(user_id, notification_ids)
        if n:
            self._sync()
        return n

    def create_agent_api_key(self, payload: AgentApiKeyCreate, key_hash: str) -> AgentApiKeyInDB:
        rec = super().create_agent_api_key(payload, key_hash)
        self._sync()
        return rec

    def revoke_agent_api_key(self, key_id: str) -> bool:
        revoked = super().revoke_agent_api_key(key_id)
        if revoked:
            self._sync()
        return revoked

    def touch_agent_api_key_used(self, key_id: str) -> None:
        # Hot path: update in-memory only (avoid full Mongo resync on every agent request).
        super().touch_agent_api_key_used(key_id)

    def create_per_profile_application(
        self, payload: PerProfileApplicationCreate
    ) -> PerProfileApplication:
        ppa = super().create_per_profile_application(payload)
        self._sync()
        return ppa

    def update_per_profile_application(
        self, ppa_id: str, payload: PerProfileApplicationUpdate
    ) -> PerProfileApplication | None:
        ppa = super().update_per_profile_application(ppa_id, payload)
        self._sync()
        return ppa

    def delete_per_profile_application(self, ppa_id: str) -> bool:
        deleted = super().delete_per_profile_application(ppa_id)
        self._sync()
        return deleted

    def create_email(self, payload: EmailCreate) -> Email:
        email = super().create_email(payload)
        self._sync()
        return email

    def update_email(self, email_id: str, payload: EmailUpdate) -> Email | None:
        email = super().update_email(email_id, payload)
        self._sync()
        return email

    def mark_email_sent(self, email_id: str, sent: bool) -> Email | None:
        email = super().mark_email_sent(email_id, sent)
        self._sync()
        return email

    def delete_email(self, email_id: str) -> bool:
        deleted = super().delete_email(email_id)
        self._sync()
        return deleted

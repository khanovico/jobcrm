from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from uuid import uuid4

from pymongo import MongoClient

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
    CompanyUpdate,
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
    UserCreate,
    UserInDB,
    UserNotification,
    utcnow,
    validate_application_transition,
)


class BaseRepository:
    def create_user(self, payload: UserCreate, password_hash: str) -> UserInDB:
        raise NotImplementedError

    def get_user_by_email(self, email: str) -> UserInDB | None:
        raise NotImplementedError

    def get_user(self, user_id: str) -> UserInDB | None:
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

    def list_companies(self, skip: int, limit: int, search: str | None) -> list[Company]:
        raise NotImplementedError

    def list_companies_unindexed(self, limit: int) -> list[Company]:
        """Companies with indexed=False, oldest created first (FIFO)."""
        raise NotImplementedError

    def create_company(self, payload: CompanyCreate) -> Company:
        raise NotImplementedError

    def get_company(self, company_id: str) -> Company | None:
        raise NotImplementedError

    def update_company(self, company_id: str, payload: CompanyUpdate) -> Company | None:
        raise NotImplementedError

    def delete_company(self, company_id: str) -> bool:
        raise NotImplementedError

    def list_profiles(self, skip: int, limit: int, search: str | None) -> list[Profile]:
        raise NotImplementedError

    def list_profile_ids(self, skip: int, limit: int) -> list[str]:
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
        sort: str = "created_at_desc",
        exclude_status: ApplicationStatus | None = None,
    ) -> list[ApplicationListItem]:
        raise NotImplementedError

    def list_pending_applications(self, limit: int) -> list[Application]:
        raise NotImplementedError

    def create_application(self, payload: ApplicationCreate, created_by_user_id: str | None) -> Application:
        raise NotImplementedError

    def bootstrap_application(
        self, payload: ApplicationBootstrapCreate, created_by_user_id: str | None
    ) -> tuple[Company, Application]:
        raise NotImplementedError

    def get_application(self, application_id: str) -> Application | None:
        raise NotImplementedError

    def update_application(
        self, application_id: str, payload: ApplicationUpdate
    ) -> Application | None:
        raise NotImplementedError

    def mark_application_applied(
        self, application_id: str, applied: bool
    ) -> Application | None:
        raise NotImplementedError

    def mark_application_email_sent(
        self, application_id: str, sent: bool
    ) -> Application | None:
        raise NotImplementedError

    def delete_application(self, application_id: str) -> bool:
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
        kind: str,
        title: str,
        body: str,
        link: str | None = None,
    ) -> UserNotification:
        raise NotImplementedError

    def list_notifications(self, user_id: str, q: NotificationListQuery) -> list[UserNotification]:
        raise NotImplementedError

    def mark_notification_read(self, user_id: str, notification_id: str) -> UserNotification | None:
        raise NotImplementedError

    def create_agent_api_key(self, payload: AgentApiKeyCreate, key_hash: str) -> AgentApiKeyInDB:
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


def _as_dict(model) -> dict:
    return model.model_dump(exclude_none=True)


def _sort_applications(items: list[Application], sort: str) -> list[Application]:
    if sort == "created_at_asc":
        return sorted(items, key=lambda a: a.created_at)
    if sort == "updated_at_desc":
        return sorted(items, key=lambda a: a.updated_at, reverse=True)
    return sorted(items, key=lambda a: a.created_at, reverse=True)


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

    def list_companies(self, skip: int, limit: int, search: str | None) -> list[Company]:
        values = list(self.companies.values())
        if search:
            needle = search.lower()
            values = [c for c in values if needle in c.name.lower()]
        values.sort(key=lambda c: c.name.lower())
        return values[skip : skip + limit]

    def list_companies_unindexed(self, limit: int) -> list[Company]:
        values = [c for c in self.companies.values() if not c.indexed]
        values.sort(key=lambda c: c.created_at)
        return values[:limit]

    def create_company(self, payload: CompanyCreate) -> Company:
        now = utcnow()
        company = Company(id=self._new_id(), created_at=now, updated_at=now, **_as_dict(payload))
        self.companies[company.id] = company
        return company

    def get_company(self, company_id: str) -> Company | None:
        return self.companies.get(company_id)

    def update_company(self, company_id: str, payload: CompanyUpdate) -> Company | None:
        company = self.get_company(company_id)
        if not company:
            return None
        merged = company.model_copy(
            update={**payload.model_dump(exclude_none=True), "updated_at": utcnow()}
        )
        self.companies[company_id] = merged
        return merged

    def delete_company(self, company_id: str) -> bool:
        return self.companies.pop(company_id, None) is not None

    def list_profiles(self, skip: int, limit: int, search: str | None) -> list[Profile]:
        values = list(self.profiles.values())
        if search:
            needle = search.lower()
            values = [p for p in values if needle in p.name.lower()]
        values.sort(key=lambda p: p.name.lower())
        return values[skip : skip + limit]

    def list_profile_ids(self, skip: int, limit: int) -> list[str]:
        values = sorted(self.profiles.values(), key=lambda p: p.created_at)
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

    def _applied_profile_names_for_application(self, application_id: str) -> list[AppliedProfileName]:
        rows = [
            p
            for p in self.per_profile_applications.values()
            if p.application_id == application_id and p.applied
        ]
        rows = sorted(rows, key=lambda p: (p.order_index, p.created_at))
        out: list[AppliedProfileName] = []
        for ppa in rows:
            prof = self.get_profile(ppa.profile_id)
            name = prof.name if prof else ppa.profile_id
            out.append(AppliedProfileName(profile_id=ppa.profile_id, profile_name=name))
        return out

    def list_applications(
        self,
        skip: int,
        limit: int,
        status: ApplicationStatus | None,
        company_id: str | None = None,
        applied: bool | None = None,
        email_sent: bool | None = None,
        sort: str = "created_at_desc",
        exclude_status: ApplicationStatus | None = None,
    ) -> list[ApplicationListItem]:
        values = list(self.applications.values())
        if status:
            values = [a for a in values if a.status == status]
        if exclude_status:
            values = [a for a in values if a.status != exclude_status]
        if company_id:
            values = [a for a in values if a.company_id == company_id]
        if applied is not None:
            values = [a for a in values if a.applied is applied]
        if email_sent is not None:
            values = [a for a in values if a.email_sent is email_sent]
        values = _sort_applications(values, sort)
        sliced = values[skip : skip + limit]
        return [
            ApplicationListItem(
                **a.model_dump(),
                applied_profiles=self._applied_profile_names_for_application(a.id),
            )
            for a in sliced
        ]

    def list_pending_applications(self, limit: int) -> list[Application]:
        pending = [
            a
            for a in self.applications.values()
            if a.status == ApplicationStatus.pending_preparation
        ]
        pending = _sort_applications(pending, "created_at_asc")
        return pending[:limit]

    def create_application(self, payload: ApplicationCreate, created_by_user_id: str | None) -> Application:
        now = utcnow()
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
            **_as_dict(payload),
        )
        self.applications[application.id] = application
        return application

    def bootstrap_application(
        self, payload: ApplicationBootstrapCreate, created_by_user_id: str | None
    ) -> tuple[Company, Application]:
        company = self.create_company(
            CompanyCreate(name=payload.company_name, website=payload.company_website)
        )
        app_payload = ApplicationCreate(
            company_id=company.id,
            job_post=payload.job_post,
            status=ApplicationStatus.pending_preparation,
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
        next_status = updates.get("status")
        if next_status and not validate_application_transition(application.status, next_status):
            raise ValueError("Invalid status transition")
        merged = application.model_copy(update={**updates, "updated_at": utcnow()})
        if merged.status == ApplicationStatus.applied and not merged.applied_at:
            merged = merged.model_copy(update={"applied": True, "applied_at": utcnow()})
        self.applications[application_id] = merged
        return merged

    def mark_application_applied(
        self, application_id: str, applied: bool
    ) -> Application | None:
        application = self.get_application(application_id)
        if not application:
            return None
        if applied:
            if application.status == ApplicationStatus.archived:
                raise ValueError("Archived application cannot be applied")
            stamp = application.applied_at or utcnow()
            updated = application.model_copy(
                update={
                    "applied": True,
                    "applied_at": stamp,
                    "status": ApplicationStatus.applied,
                    "updated_at": utcnow(),
                }
            )
        else:
            updated = application.model_copy(
                update={"applied": False, "updated_at": utcnow()}
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

    def global_search(self, query: str, limit: int) -> GlobalSearchResult:
        q = query.strip().lower()
        if not q:
            return GlobalSearchResult(companies=[], profiles=[], applications=[])
        companies = [
            c
            for c in self.companies.values()
            if q in c.name.lower() or (c.overview and q in c.overview.lower())
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
        kind: str,
        title: str,
        body: str,
        link: str | None = None,
    ) -> UserNotification:
        now = utcnow()
        note = UserNotification(
            id=self._new_id(),
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            link=link,
            read_at=None,
            created_at=now,
        )
        self.notifications[note.id] = note
        return note

    def list_notifications(self, user_id: str, q: NotificationListQuery) -> list[UserNotification]:
        rows = [n for n in self.notifications.values() if n.user_id == user_id]
        if q.unread_only:
            rows = [n for n in rows if n.read_at is None]
        rows.sort(key=lambda n: n.created_at, reverse=True)
        return rows[q.skip : q.skip + q.limit]

    def mark_notification_read(self, user_id: str, notification_id: str) -> UserNotification | None:
        note = self.notifications.get(notification_id)
        if not note or note.user_id != user_id:
            return None
        updated = note.model_copy(update={"read_at": utcnow()})
        self.notifications[notification_id] = updated
        return updated

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


class MongoRepository(InMemoryRepository):
    def __init__(self) -> None:
        super().__init__()
        self.client = MongoClient(settings.mongo_uri)
        self.db = self.client[settings.mongo_db_name]
        self._load()

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

    def delete_company(self, company_id: str) -> bool:
        deleted = super().delete_company(company_id)
        self._sync()
        return deleted

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
        self, payload: ApplicationBootstrapCreate, created_by_user_id: str | None
    ) -> tuple[Company, Application]:
        result = super().bootstrap_application(payload, created_by_user_id)
        self._sync()
        return result

    def update_application(
        self, application_id: str, payload: ApplicationUpdate
    ) -> Application | None:
        application = super().update_application(application_id, payload)
        self._sync()
        return application

    def mark_application_applied(
        self, application_id: str, applied: bool
    ) -> Application | None:
        application = super().mark_application_applied(application_id, applied)
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
        kind: str,
        title: str,
        body: str,
        link: str | None = None,
    ) -> UserNotification:
        note = super().create_notification(
            user_id=user_id, kind=kind, title=title, body=body, link=link
        )
        self._sync()
        return note

    def mark_notification_read(self, user_id: str, notification_id: str) -> UserNotification | None:
        note = super().mark_notification_read(user_id, notification_id)
        self._sync()
        return note

    def create_agent_api_key(self, payload: AgentApiKeyCreate, key_hash: str) -> AgentApiKeyInDB:
        rec = super().create_agent_api_key(payload, key_hash)
        self._sync()
        return rec

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

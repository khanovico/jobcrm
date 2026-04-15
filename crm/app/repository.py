from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime
from uuid import uuid4

from pymongo import MongoClient

from app.config import settings
from app.models import (
    Application,
    ApplicationCreate,
    ApplicationStatus,
    ApplicationUpdate,
    Company,
    CompanyCreate,
    CompanyUpdate,
    Profile,
    ProfileCreate,
    ProfileUpdate,
    UserCreate,
    UserInDB,
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

    def list_companies(self, skip: int, limit: int, search: str | None) -> list[Company]:
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
    ) -> list[Application]:
        raise NotImplementedError

    def create_application(self, payload: ApplicationCreate) -> Application:
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

    def delete_application(self, application_id: str) -> bool:
        raise NotImplementedError


def _as_dict(model) -> dict:
    return model.model_dump(exclude_none=True)


class InMemoryRepository(BaseRepository):
    def __init__(self) -> None:
        self.users: dict[str, UserInDB] = {}
        self.companies: dict[str, Company] = {}
        self.profiles: dict[str, Profile] = {}
        self.applications: dict[str, Application] = {}

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

    def list_companies(self, skip: int, limit: int, search: str | None) -> list[Company]:
        values = list(self.companies.values())
        if search:
            needle = search.lower()
            values = [c for c in values if needle in c.name.lower()]
        return values[skip : skip + limit]

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
        return values[skip : skip + limit]

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

    def list_applications(
        self, skip: int, limit: int, status: ApplicationStatus | None
    ) -> list[Application]:
        values = list(self.applications.values())
        if status:
            values = [a for a in values if a.status == status]
        return values[skip : skip + limit]

    def create_application(self, payload: ApplicationCreate) -> Application:
        now = utcnow()
        application = Application(
            id=self._new_id(),
            created_at=now,
            updated_at=now,
            applied=False,
            applied_at=None,
            **_as_dict(payload),
        )
        self.applications[application.id] = application
        return application

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

    def delete_application(self, application_id: str) -> bool:
        return self.applications.pop(application_id, None) is not None


class MongoRepository(InMemoryRepository):
    def __init__(self) -> None:
        super().__init__()
        self.client = MongoClient(settings.mongo_uri)
        self.db = self.client[settings.mongo_db_name]
        self._load()

    def _load(self) -> None:
        self.users = self._load_collection(self.db.users.find(), UserInDB)
        self.companies = self._load_collection(self.db.companies.find(), Company)
        self.profiles = self._load_collection(self.db.profiles.find(), Profile)
        self.applications = self._load_collection(self.db.applications.find(), Application)

    def _load_collection(self, rows: Iterable[dict], model):
        loaded = {}
        for row in rows:
            row["id"] = str(row["_id"])
            row.pop("_id")
            loaded[row["id"]] = model.model_validate(row)
        return loaded

    def _sync(self) -> None:
        self._sync_collection("users", self.users)
        self._sync_collection("companies", self.companies)
        self._sync_collection("profiles", self.profiles)
        self._sync_collection("applications", self.applications)

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

    def create_application(self, payload: ApplicationCreate) -> Application:
        application = super().create_application(payload)
        self._sync()
        return application

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

    def delete_application(self, application_id: str) -> bool:
        deleted = super().delete_application(application_id)
        self._sync()
        return deleted

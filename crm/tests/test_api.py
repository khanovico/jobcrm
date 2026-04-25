from contextvars import copy_context

import pytest
from fastapi.testclient import TestClient

from app.auth import hash_password
from app.deps import get_repository
from app.main import app
from app.models import (
    ApplicationCreate,
    ApplicationStatus,
    ActorType,
    AuditListQuery,
    CompanyCreate,
    CompanyResearchStatus,
    CompanyUpdate,
    EmailCreate,
    EmailKind,
    IndustryCreate,
    NotificationKind,
    NotificationListQuery,
    NotificationPayload,
    NotificationSeverity,
    PerProfileApplication,
    PerProfileApplicationCreate,
    ProfileCreate,
    UserCreate,
)
from app.repository import (
    InMemoryRepository,
    MongoRepository,
    RELATED_COMPANY_RESEARCH_CLEARED_ARCHIVE_REASON,
)


def _register_and_login(client: TestClient) -> str:
    payload = {
        "name": "Test",
        "email": "test@example.com",
        "password": "secret1234",
        "role": "admin",
    }
    repo = app.dependency_overrides[get_repository]()
    repo.create_user(UserCreate.model_validate(payload), hash_password(payload["password"]))

    login_response = client.post(
        "/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]}
    )
    assert login_response.status_code == 200
    return login_response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_user_and_login(
    client: TestClient,
    *,
    name: str,
    email: str,
    password: str = "secret1234",
    role: str = "user",
) -> str:
    repo = app.dependency_overrides[get_repository]()
    repo.create_user(
        UserCreate.model_validate(
            {"name": name, "email": email, "password": password, "role": role}
        ),
        hash_password(password),
    )
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login_response.status_code == 200
    return login_response.json()["access_token"]


def _valid_profile_create_payload() -> dict:
    return {
        "name": "General SWE",
        "location": "Austin, TX",
        "email": "general@example.com",
        "phone": "+15555550100",
        "educations": [{"university_name": "State University", "from_year": 2018, "to_year": 2022}],
        "bio_md": "Experienced software engineer.",
        "niche_info_md": "Distributed systems and APIs.",
    }


def test_list_applications_exclude_archived() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()
    active = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    archived = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    client.put(
        f"/api/v1/applications/{archived['id']}",
        json={"status": "archived", "archive_reason": "done"},
        headers=headers,
    )
    listed = client.get(
        "/api/v1/applications",
        params={"exclude_status": "archived"},
        headers=headers,
    ).json()
    assert len(listed) == 1
    assert listed[0]["id"] == active["id"]
    only_arch = client.get(
        "/api/v1/applications",
        params={"status_filter": "archived"},
        headers=headers,
    ).json()
    assert len(only_arch) == 1
    assert only_arch[0]["archive_reason"] == "done"


def test_list_applications_tolerates_ppa_cold_email_plan_stored_as_dict() -> None:
    """Mongo / model_construct can leave nested cold_email_plan as a dict; list must not 500."""
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    company = client.post("/api/v1/companies", json={"name": "Dict Plan Co"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    ppa_resp = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "cold_email_plan": {
                "subjects": ["Hi"],
                "selected_subject_index": 0,
                "to": {"title": "Eng", "name": "Pat", "email": "pat@corp.com"},
                "status": "none",
            },
        },
        headers=headers,
    )
    assert ppa_resp.status_code == 201
    ppa_id = ppa_resp.json()["id"]
    raw = repo.get_per_profile_application(ppa_id)
    assert raw is not None
    repo.per_profile_applications[ppa_id] = PerProfileApplication.model_construct(
        id=raw.id,
        application_id=raw.application_id,
        profile_id=raw.profile_id,
        order_index=raw.order_index,
        fit_score=raw.fit_score,
        analysis=raw.analysis,
        tailored_resume_link=raw.tailored_resume_link,
        cold_email_plan={
            "subjects": ["Hi"],
            "selected_subject_index": 0,
            "to": {"title": "Eng", "name": "Pat", "email": "pat@corp.com"},
            "status": "none",
        },
        applied=raw.applied,
        applied_at=raw.applied_at,
        created_at=raw.created_at,
        updated_at=raw.updated_at,
    )
    r = client.get(
        "/api/v1/applications",
        params={"exclude_status": "archived", "applied": "false"},
        headers=headers,
    )
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["applied_profiles"] == [{"profile_name": profile["name"]}]


def test_create_application_defaults_to_pending_preparation() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"]},
        headers=headers,
    )
    assert application.status_code == 201
    assert application.json()["status"] == "company_research_pending"


def test_auth_me_returns_user() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200
    body = me.json()
    assert body["email"] == "test@example.com"
    assert "admin" in body


def test_public_signup_routes_are_not_exposed() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    assert client.post("/api/v1/auth/register", json={}).status_code == 404
    assert client.get("/api/v1/auth/registration-status").status_code == 404


def test_auth_required_for_companies() -> None:
    app.dependency_overrides[get_repository] = lambda: InMemoryRepository()
    client = TestClient(app)
    response = client.get("/api/v1/companies")
    assert response.status_code == 401


def test_auth_required_for_industry_picker_endpoints() -> None:
    app.dependency_overrides[get_repository] = lambda: InMemoryRepository()
    client = TestClient(app)

    assert client.get("/api/v1/industries/count").status_code == 401
    assert client.get("/api/v1/industries/options").status_code == 401


def test_human_list_endpoints_reject_unbounded_limits() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    endpoints = [
        "/api/v1/industries",
        "/api/v1/industries/options",
        "/api/v1/companies",
        "/api/v1/companies/summary",
        "/api/v1/profiles",
        "/api/v1/profiles/summary",
        "/api/v1/applications",
        "/api/v1/notifications",
        "/api/v1/audit-events",
    ]
    for endpoint in endpoints:
        response = client.get(endpoint, headers=headers, params={"limit": 201})
        assert response.status_code == 422, endpoint


def test_user_role_cannot_access_settings_or_audit() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _create_user_and_login(
        client,
        name="Basic User",
        email="basic-user@example.com",
        role="user",
    )
    headers = _auth_headers(token)

    summary_response = client.get("/api/v1/workers/summary", headers=headers)
    assert summary_response.status_code == 200
    assert summary_response.json() == {
        "settings": {
            "max_company_researcher": 1,
            "max_ppa_analyser": 1,
            "max_application_drafter": 1,
        },
        "active": {
            "company_researcher": 0,
            "ppa_analyser": 0,
            "application_drafter": 0,
        },
        "max": {
            "company_researcher": 1,
            "ppa_analyser": 1,
            "application_drafter": 1,
        },
    }

    settings_response = client.get("/api/v1/settings/workers", headers=headers)
    assert settings_response.status_code == 403

    patch_response = client.patch(
        "/api/v1/settings/workers",
        json={"max_company_researcher": 2},
        headers=headers,
    )
    assert patch_response.status_code == 403

    audit_response = client.get("/api/v1/audit-events", headers=headers)
    assert audit_response.status_code == 403


def test_company_summary_returns_compact_fields_and_respects_filters_sort_pagination() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    alpha = client.post(
        "/api/v1/companies",
        json={
            "name": "Acme Alpha",
            "website": "https://alpha.example",
            "overview": "heavy overview",
            "full_product_detail": "heavy product detail",
            "full_hiring_detail": "heavy hiring detail",
            "full_organization_detail": "heavy org detail",
            "enrichment_source_links": ["https://source.example/alpha"],
        },
        headers=headers,
    )
    assert alpha.status_code == 201
    beta = client.post(
        "/api/v1/companies",
        json={"name": "Acme Beta", "website": "https://beta.example"},
        headers=headers,
    )
    assert beta.status_code == 201
    gamma = client.post(
        "/api/v1/companies",
        json={
            "name": "Acme Gamma",
            "website": "https://gamma.example",
            "research_status": "indexed",
        },
        headers=headers,
    )
    assert gamma.status_code == 201
    other = client.post(
        "/api/v1/companies",
        json={"name": "Other Co", "website": "https://other.example"},
        headers=headers,
    )
    assert other.status_code == 201

    for company_id in [alpha.json()["id"], beta.json()["id"]]:
        application = client.post(
            "/api/v1/applications",
            json={"company_id": company_id, "status": "company_research_pending"},
            headers=headers,
        )
        assert application.status_code == 201

    response = client.get(
        "/api/v1/companies/summary",
        params={
            "search": "Acme",
            "research_status": "pending",
            "has_application": "true",
            "sort": "name_asc",
            "skip": 1,
            "limit": 1,
        },
        headers=headers,
    )

    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["name"] == "Acme Beta"
    assert rows[0]["website"] == "https://beta.example"
    assert rows[0]["research_status"] == "pending"
    assert rows[0]["has_application"] is True
    assert set(rows[0]) == {
        "id",
        "name",
        "research_status",
        "website",
        "has_application",
        "created_at",
        "updated_at",
    }


def test_user_role_profiles_are_read_only() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    admin_token = _register_and_login(client)
    admin_headers = _auth_headers(admin_token)
    created_profile = client.post(
        "/api/v1/profiles",
        json=_valid_profile_create_payload(),
        headers=admin_headers,
    )
    assert created_profile.status_code == 201
    profile_id = created_profile.json()["id"]

    user_token = _create_user_and_login(
        client,
        name="Readonly User",
        email="readonly-user@example.com",
        role="user",
    )
    user_headers = _auth_headers(user_token)

    listed = client.get("/api/v1/profiles", headers=user_headers)
    assert listed.status_code == 200
    fetched = client.get(f"/api/v1/profiles/{profile_id}", headers=user_headers)
    assert fetched.status_code == 200

    blocked_create = client.post(
        "/api/v1/profiles",
        json=_valid_profile_create_payload(),
        headers=user_headers,
    )
    assert blocked_create.status_code == 403

    blocked_update = client.put(
        f"/api/v1/profiles/{profile_id}",
        json={"name": "Updated"},
        headers=user_headers,
    )
    assert blocked_update.status_code == 403

    blocked_delete = client.delete(f"/api/v1/profiles/{profile_id}", headers=user_headers)
    assert blocked_delete.status_code == 403


def test_list_applications_includes_applied_profile_names() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()
    prof_payload = _valid_profile_create_payload()
    prof_payload["name"] = "Alex Dev"
    profile = client.post("/api/v1/profiles", json=prof_payload, headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "tailored_resume_link": "https://example.com/resume.pdf",
        },
        headers=headers,
    ).json()
    assert ppa["tailored_resume_link"]

    listed = client.get("/api/v1/applications", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["company_name"] == company["name"]
    assert listed[0]["applied_profiles"] == [{"profile_name": "Alex Dev"}]


def test_list_applications_supports_company_search_and_applied_profile_name_filters() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    acme_company = client.post("/api/v1/companies", json={"name": "Acme Platform"}, headers=headers).json()
    orbit_company = client.post("/api/v1/companies", json={"name": "Orbit Labs"}, headers=headers).json()

    alex_profile = client.post(
        "/api/v1/profiles",
        json={**_valid_profile_create_payload(), "name": "Alex Dev"},
        headers=headers,
    ).json()
    blair_profile = client.post(
        "/api/v1/profiles",
        json={**_valid_profile_create_payload(), "name": "Blair Ops", "email": "blair@example.com"},
        headers=headers,
    ).json()

    acme_application = client.post(
        "/api/v1/applications",
        json={"company_id": acme_company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    orbit_application = client.post(
        "/api/v1/applications",
        json={"company_id": orbit_company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()

    client.post(
        f"/api/v1/applications/{acme_application['id']}/per-profile-applications",
        json={
            "application_id": acme_application["id"],
            "profile_id": alex_profile["id"],
            "order_index": 0,
            "analysis": "acme fit",
        },
        headers=headers,
    )
    client.post(
        f"/api/v1/applications/{orbit_application['id']}/per-profile-applications",
        json={
            "application_id": orbit_application["id"],
            "profile_id": blair_profile["id"],
            "order_index": 0,
            "analysis": "orbit fit",
        },
        headers=headers,
    )

    company_filtered = client.get(
        "/api/v1/applications",
        params={"company_search": "acME"},
        headers=headers,
    )
    assert company_filtered.status_code == 200
    assert [row["id"] for row in company_filtered.json()] == [acme_application["id"]]

    profile_filtered = client.get(
        "/api/v1/applications",
        params=[("applied_profile_names", "Blair Ops"), ("applied_profile_names", "Missing")],
        headers=headers,
    )
    assert profile_filtered.status_code == 200
    assert [row["id"] for row in profile_filtered.json()] == [orbit_application["id"]]

    combined = client.get(
        "/api/v1/applications",
        params=[
            ("company_search", " acme "),
            ("applied_profile_names", "Alex Dev"),
        ],
        headers=headers,
    )
    assert combined.status_code == 200
    assert [row["id"] for row in combined.json()] == [acme_application["id"]]


def test_application_applied_profile_facets_return_sorted_unique_names_for_matching_rows() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    acme_company = client.post("/api/v1/companies", json={"name": "Acme Platform"}, headers=headers).json()
    other_company = client.post("/api/v1/companies", json={"name": "Other Co"}, headers=headers).json()

    alex_profile = client.post(
        "/api/v1/profiles",
        json={**_valid_profile_create_payload(), "name": "Alex Dev"},
        headers=headers,
    ).json()
    blair_profile = client.post(
        "/api/v1/profiles",
        json={**_valid_profile_create_payload(), "name": "Blair Ops", "email": "blair-facets@example.com"},
        headers=headers,
    ).json()

    first_acme_app = client.post(
        "/api/v1/applications",
        json={"company_id": acme_company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    second_acme_app = client.post(
        "/api/v1/applications",
        json={"company_id": acme_company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    other_app = client.post(
        "/api/v1/applications",
        json={"company_id": other_company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()

    client.post(
        f"/api/v1/applications/{first_acme_app['id']}/per-profile-applications",
        json={
            "application_id": first_acme_app["id"],
            "profile_id": blair_profile["id"],
            "order_index": 0,
            "analysis": "first acme",
        },
        headers=headers,
    )
    client.post(
        f"/api/v1/applications/{second_acme_app['id']}/per-profile-applications",
        json={
            "application_id": second_acme_app["id"],
            "profile_id": alex_profile["id"],
            "order_index": 0,
            "analysis": "second acme",
        },
        headers=headers,
    )
    client.post(
        f"/api/v1/applications/{other_app['id']}/per-profile-applications",
        json={
            "application_id": other_app["id"],
            "profile_id": blair_profile["id"],
            "order_index": 0,
            "analysis": "other company",
        },
        headers=headers,
    )

    response = client.get(
        "/api/v1/applications/applied-profile-facets",
        params={"company_search": "ACME"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == {"profile_names": ["Alex Dev", "Blair Ops"]}


def test_application_applied_profile_facets_cover_target_profile_count() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = repo.create_company(CompanyCreate(name="Scale Facets Co"))
    for index in range(200):
        profile = repo.create_profile(
            ProfileCreate.model_validate(
                {
                    **_valid_profile_create_payload(),
                    "name": f"Profile {index:03d}",
                    "email": f"profile-{index:03d}@example.com",
                }
            )
        )
        application = repo.create_application(
            ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
            created_by_user_id=None,
        )
        repo.create_per_profile_application(
            PerProfileApplicationCreate(application_id=application.id, profile_id=profile.id)
        )

    response = client.get(
        "/api/v1/applications/applied-profile-facets",
        params={"status_filter": "ppa_pending"},
        headers=headers,
    )

    assert response.status_code == 200
    profile_names = response.json()["profile_names"]
    assert len(profile_names) == 200
    assert "Profile 150" in profile_names


def test_clear_to_pending_preparation_removes_ppas_emails_and_resets_flags() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Reset Co"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "x",
        },
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/per-profile-applications/{ppa['id']}/emails",
        json={
            "per_profile_application_id": ppa["id"],
            "kind": "cold",
            "content": "Hi",
        },
        headers=headers,
    )

    r = client.post(
        f"/api/v1/applications/{application['id']}/clear-to-company-research-pending",
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "company_research_pending"
    assert body["applied"] is False
    assert body["applied_at"] is None
    assert body["email_sent"] is False
    assert body["email_sent_at"] is None

    ppas = client.get(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        headers=headers,
    ).json()
    assert ppas == []
    assert repo.get_per_profile_application(ppa["id"]) is None
    assert not any(e.per_profile_application_id == ppa["id"] for e in repo.emails.values())


def test_clear_company_research_detail_clears_enrichment_keeps_name_and_website() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    ind = client.post("/api/v1/industries", json={"name": "IndClr", "description": "d"}, headers=headers).json()
    company = client.post(
        "/api/v1/companies",
        json={
            "name": "Full Clear Co",
            "research_status": "indexed",
            "website": "https://w.example",
            "linkedin": "https://li.example/x",
            "industry_ids": [ind["id"]],
            "hq_locations": ["Austin", "Remote"],
            "employee_count_text": "50-100",
            "actively_hiring": True,
            "work_mode": "hybrid",
            "work_mode_description": "flex",
            "overview": "Overview text",
            "full_product_detail": "https://example.com/detail",
            "full_hiring_detail": "https://example.com/hiring-detail",
            "full_organization_detail": "https://example.com/org-detail",
            "analysis_links": [{"topic": "T", "link": "https://a.example"}],
            "enrichment_source_links": ["https://src.example"],
        },
        headers=headers,
    ).json()
    assert company["overview"] == "Overview text"

    r = client.post(
        f"/api/v1/companies/{company['id']}/clear-research-detail",
        json={"related_applications": "none"},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "Full Clear Co"
    assert body["research_status"] == "pending"
    assert body["website"] == "https://w.example"
    assert body["linkedin"] is None
    assert body["industry_ids"] == []
    assert body["hq_locations"] == []
    assert body["employee_count_text"] is None
    assert body["actively_hiring"] is None
    assert body["work_mode"] is None
    assert body["work_mode_description"] is None
    assert body["overview"] is None
    assert body["full_product_detail"] is None
    assert body["full_hiring_detail"] is None
    assert body["full_organization_detail"] is None
    assert body["analysis_links"] == []
    assert body["enrichment_source_links"] == []


def test_clear_company_research_detail_archives_related_applications() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Arch Co", "research_status": "indexed"}, headers=headers).json()
    client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    )

    r = client.post(
        f"/api/v1/companies/{company['id']}/clear-research-detail",
        json={"related_applications": "archive"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["research_status"] == "pending"
    listed = client.get("/api/v1/applications", headers=headers, params={"status_filter": "archived"}).json()
    assert len(listed) == 1
    assert listed[0]["archive_reason"] == RELATED_COMPANY_RESEARCH_CLEARED_ARCHIVE_REASON


def test_clear_company_research_detail_reset_related_applications() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Reset Co", "research_status": "indexed"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "x",
        },
        headers=headers,
    )

    r = client.post(
        f"/api/v1/companies/{company['id']}/clear-research-detail",
        json={"related_applications": "reset"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["research_status"] == "pending"
    got = client.get(f"/api/v1/applications/{application['id']}", headers=headers).json()
    assert got["status"] == "company_research_pending"
    ppas = client.get(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        headers=headers,
    ).json()
    assert ppas == []


def test_application_detail_endpoint_batches_company_ppas_profiles_and_emails() -> None:
    class BatchEmailRepository(InMemoryRepository):
        def __init__(self) -> None:
            super().__init__()
            self.email_batch_calls: list[list[str]] = []
            self.profile_batch_calls: list[list[str]] = []
            self.reject_single_profile_lookup = False

        def list_emails_for_ppa(self, per_profile_application_id: str):  # type: ignore[no-untyped-def]
            raise AssertionError("detail endpoint must batch load PPA emails")

        def list_emails_for_ppas(self, per_profile_application_ids: list[str]):  # type: ignore[no-untyped-def]
            self.email_batch_calls.append(list(per_profile_application_ids))
            return super().list_emails_for_ppas(per_profile_application_ids)

        def get_profile(self, profile_id: str):  # type: ignore[no-untyped-def]
            if self.reject_single_profile_lookup:
                raise AssertionError("detail endpoint must batch load profile names")
            return super().get_profile(profile_id)

        def list_profile_names_by_ids(self, profile_ids: list[str]):  # type: ignore[no-untyped-def]
            self.profile_batch_calls.append(list(profile_ids))
            return {
                profile_id: self.profiles[profile_id].name
                for profile_id in dict.fromkeys(profile_ids)
                if profile_id in self.profiles
            }

    repo = BatchEmailRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post(
        "/api/v1/companies",
        json={"name": "Detail Co", "research_status": "indexed"},
        headers=headers,
    ).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "strong fit",
        },
        headers=headers,
    ).json()
    email = client.post(
        f"/api/v1/per-profile-applications/{ppa['id']}/emails",
        json={
            "per_profile_application_id": ppa["id"],
            "kind": "cold",
            "content": "Hello there",
        },
        headers=headers,
    ).json()

    repo.reject_single_profile_lookup = True
    detail = client.get(f"/api/v1/applications/{application['id']}/detail", headers=headers)
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["application"]["id"] == application["id"]
    assert payload["company"]["id"] == company["id"]
    assert len(payload["per_profile_applications"]) == 1
    assert payload["per_profile_applications"][0]["id"] == ppa["id"]
    assert payload["per_profile_applications"][0]["profile_name"] == profile["name"]
    assert payload["per_profile_applications"][0]["emails"] == [email]
    assert repo.email_batch_calls == [[ppa["id"]]]
    assert repo.profile_batch_calls == [[profile["id"]]]


def test_ppa_cold_email_recipient_timezone_round_trips_in_application_detail() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "TZ Co"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={"application_id": application["id"], "profile_id": profile["id"], "order_index": 0},
        headers=headers,
    ).json()
    plan = {
        "subjects": ["Hello"],
        "selected_subject_index": 0,
        "to": {
            "title": "Eng",
            "name": "Pat",
            "email": "pat@corp.com",
            "timezone": "Europe/Berlin",
        },
        "status": "none",
    }
    client.put(f"/api/v1/per-profile-applications/{ppa['id']}", json={"cold_email_plan": plan}, headers=headers)

    detail = client.get(f"/api/v1/applications/{application['id']}/detail", headers=headers).json()
    assert detail["per_profile_applications"][0]["cold_email_plan"]["to"]["timezone"] == "Europe/Berlin"


def test_profile_summary_endpoint_returns_only_list_fields() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers)

    response = client.get("/api/v1/profiles/summary", headers=headers)
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["name"] == "General SWE"
    assert "bio_md" not in rows[0]
    assert "resume_md" not in rows[0]


def test_profile_summary_endpoint_supports_search_and_frozen_filter() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    first = client.post(
        "/api/v1/profiles",
        json={**_valid_profile_create_payload(), "name": "Alex Dev", "email": "alex@example.com"},
        headers=headers,
    )
    assert first.status_code == 201
    second = client.post(
        "/api/v1/profiles",
        json={
            **_valid_profile_create_payload(),
            "name": "Blair Ops",
            "email": "blair@example.com",
            "location": "Berlin",
            "niche_info_md": "Python + data pipelines",
        },
        headers=headers,
    )
    assert second.status_code == 201
    frozen = client.put(
        f"/api/v1/profiles/{second.json()['id']}",
        json={"frozen": True},
        headers=headers,
    )
    assert frozen.status_code == 200

    active_only = client.get(
        "/api/v1/profiles/summary",
        params={"search": "alex", "frozen": "false"},
        headers=headers,
    )
    assert active_only.status_code == 200
    assert [row["name"] for row in active_only.json()] == ["Alex Dev"]

    frozen_only = client.get(
        "/api/v1/profiles/summary",
        params={"search": "python", "frozen": "true"},
        headers=headers,
    )
    assert frozen_only.status_code == 200
    assert [row["name"] for row in frozen_only.json()] == ["Blair Ops"]


def test_profile_update_rejects_empty_name() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()

    response = client.put(
        f"/api/v1/profiles/{profile['id']}",
        json={"name": ""},
        headers=headers,
    )

    assert response.status_code == 422


def test_clear_to_pending_uses_ppa_pending_when_company_indexed() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post(
        "/api/v1/companies",
        json={"name": "Indexed Co", "research_status": "indexed"},
        headers=headers,
    ).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "x",
        },
        headers=headers,
    ).json()

    r = client.post(
        f"/api/v1/applications/{application['id']}/clear-to-company-research-pending",
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "ppa_pending"
    assert repo.get_per_profile_application(ppa["id"]) is None


def test_update_company_to_indexed_promotes_company_research_pending_to_ppa_pending() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Index Co"}, headers=headers).json()
    assert company["research_status"] == "pending"
    app_crp = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    app_ready = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()

    r = client.put(
        f"/api/v1/companies/{company['id']}",
        json={"research_status": "indexed"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["research_status"] == "indexed"

    got_crp = client.get(f"/api/v1/applications/{app_crp['id']}", headers=headers).json()
    assert got_crp["status"] == "ppa_pending"
    got_ready = client.get(f"/api/v1/applications/{app_ready['id']}", headers=headers).json()
    assert got_ready["status"] == "application_ready"


def test_update_company_to_invalid_marks_non_archived_applications_invalid() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Bad Co"}, headers=headers).json()
    assert company["research_status"] == "pending"
    app_crp = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    app_ready = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()

    r = client.put(
        f"/api/v1/companies/{company['id']}",
        json={"research_status": "invalid"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["research_status"] == "invalid"

    assert (
        client.get(f"/api/v1/applications/{app_crp['id']}", headers=headers).json()["status"]
        == "invalid"
    )
    assert (
        client.get(f"/api/v1/applications/{app_ready['id']}", headers=headers).json()["status"]
        == "invalid"
    )


def test_company_application_count_matches_tied_applications() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Count Co"}, headers=headers).json()
    r0 = client.get(f"/api/v1/companies/{company['id']}/application-count", headers=headers)
    assert r0.status_code == 200
    assert r0.json()["count"] == 0

    client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    )
    client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    )
    r2 = client.get(f"/api/v1/companies/{company['id']}/application-count", headers=headers)
    assert r2.json()["count"] == 2


def test_archive_company_archives_all_tied_applications_and_keeps_company() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Gone Co"}, headers=headers).json()
    a1 = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()
    a2 = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    client.put(
        f"/api/v1/applications/{a2['id']}",
        json={"status": "archived", "archive_reason": "old"},
        headers=headers,
    )

    reason = "no longer tracking"
    r = client.post(
        f"/api/v1/companies/{company['id']}/archive", json={"archive_reason": reason}, headers=headers
    )
    assert r.status_code == 200
    assert r.json()["applications_archived"] == 2

    comp_get = client.get(f"/api/v1/companies/{company['id']}", headers=headers)
    assert comp_get.status_code == 200
    assert comp_get.json()["archived"] is True
    assert comp_get.json()["archive_reason"] == reason

    assert client.get("/api/v1/companies", headers=headers).json() == []

    got1 = client.get(f"/api/v1/applications/{a1['id']}", headers=headers).json()
    assert got1["status"] == "archived"
    assert got1["archive_reason"] == reason

    got2 = client.get(f"/api/v1/applications/{a2['id']}", headers=headers).json()
    assert got2["status"] == "archived"
    assert got2["archive_reason"] == reason


def test_create_company_409_when_name_matches_active_company() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    client.post("/api/v1/companies", json={"name": "Dup Co"}, headers=headers)
    conflict = client.post("/api/v1/companies", json={"name": "dup co"}, headers=headers)
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "company_name_exists"


def test_create_company_409_when_name_matches_archived_without_ack() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    c = client.post(
        "/api/v1/companies",
        json={"name": "Once Co", "website": "https://once.example"},
        headers=headers,
    ).json()
    client.post(f"/api/v1/companies/{c['id']}/archive", json={"archive_reason": "gone"}, headers=headers)
    hit = client.post("/api/v1/companies", json={"name": "Once Co"}, headers=headers)
    assert hit.status_code == 409
    d = hit.json()["detail"]
    assert d["code"] == "archived_company_name_exists"
    assert d["website"] == "https://once.example"
    assert d["archive_reason"] == "gone"
    assert d["archived_at"]


def test_create_company_unarchives_archived_name_when_acknowledged() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    r0 = client.post(
        "/api/v1/companies", json={"name": "Return Co", "website": "https://old.example"}, headers=headers
    )
    assert r0.status_code == 201, r0.text
    c = r0.json()
    client.post(
        f"/api/v1/companies/{c['id']}/archive", json={"archive_reason": "temp"}, headers=headers
    )
    restored = client.post(
        "/api/v1/companies",
        json={"name": "return co", "website": "https://new.example", "acknowledge_reuse_of_archived_company": True},
        headers=headers,
    )
    assert restored.status_code == 201
    body = restored.json()
    assert body["id"] == c["id"]
    assert body["archived"] is False
    assert body["website"] == "https://new.example"
    listed = client.get("/api/v1/companies", headers=headers).json()
    assert len(listed) == 1


def test_list_applications_applied_profiles_includes_ppa_with_email_not_resume() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "ok",
        },
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/per-profile-applications/{ppa['id']}/emails",
        json={
            "per_profile_application_id": ppa["id"],
            "kind": "cold",
            "content": "Hello",
        },
        headers=headers,
    )

    listed = client.get("/api/v1/applications", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["company_name"] == company["name"]
    assert listed[0]["applied_profiles"] == [{"profile_name": profile["name"]}]


def test_list_applications_applied_profiles_uses_first_ppa_even_without_ready_artifacts() -> None:
    """Applied profiles column now always shows the first PPA profile (order index 0)."""
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Plain Co"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "in progress",
        },
        headers=headers,
    )

    listed = client.get("/api/v1/applications", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["applied_profiles"] == [{"profile_name": profile["name"]}]


def test_list_applications_applied_profiles_uses_order_index_zero_when_multiple_ppas() -> None:
    """With multiple PPAs, applied_profiles returns only the first PPA's profile."""
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Multi Co"}, headers=headers).json()
    first_profile = client.post(
        "/api/v1/profiles", json={**_valid_profile_create_payload(), "name": "Only Analysis"},
        headers=headers,
    ).json()
    second_profile = client.post(
        "/api/v1/profiles", json={**_valid_profile_create_payload(), "name": "Has Resume"},
        headers=headers,
    ).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": first_profile["id"],
            "order_index": 0,
            "analysis": "not ready yet",
        },
        headers=headers,
    )
    client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": second_profile["id"],
            "order_index": 1,
            "tailored_resume_link": "https://example.com/cv.pdf",
        },
        headers=headers,
    )

    listed = client.get("/api/v1/applications", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["applied_profiles"] == [{"profile_name": "Only Analysis"}]


def test_list_applications_applied_profiles_empty_when_application_has_no_ppa() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Placeholder Co"}, headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()

    listed = client.get("/api/v1/applications", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["applied_profiles"] == []


def test_list_applications_applied_profiles_uses_first_ppa_even_with_empty_email() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Empty Mail Co"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "x",
        },
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/per-profile-applications/{ppa['id']}/emails",
        json={
            "per_profile_application_id": ppa["id"],
            "kind": "cold",
            "content": "",
        },
        headers=headers,
    )

    listed = client.get("/api/v1/applications", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["applied_profiles"] == [{"profile_name": profile["name"]}]


def test_list_applications_applied_profiles_uses_first_ppa_even_with_only_plan_content() -> None:
    """Any first PPA is shown in list regardless of readiness artifact."""
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Plan Only Co"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "x",
            "cold_email_plan": {
                "subjects": ["Hello from a candidate"],
                "selected_subject_index": 0,
                "to": {"title": "Hiring", "name": "Sam", "email": "sam@example.com"},
                "status": "none",
            },
        },
        headers=headers,
    )

    listed = client.get("/api/v1/applications", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["applied_profiles"] == [{"profile_name": profile["name"]}]


def test_mark_applied_stamps_once() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()

    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()

    first = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": True},
        headers=headers,
    )
    assert first.status_code == 200
    first_stamp = first.json()["applied_at"]
    assert first.json()["status"] == "application_ready"

    second = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": True},
        headers=headers,
    )
    assert second.status_code == 200
    assert second.json()["applied_at"] == first_stamp


def test_unmark_applied_clears_stamp_and_resets_status() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()

    marked = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": True},
        headers=headers,
    )
    assert marked.status_code == 200
    assert marked.json()["status"] == "application_ready"
    assert marked.json()["applied_at"] is not None

    unmarked = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": False},
        headers=headers,
    )
    assert unmarked.status_code == 200
    assert unmarked.json()["applied"] is False
    assert unmarked.json()["applied_at"] is None
    assert unmarked.json()["status"] == "application_ready"


def test_rejects_invalid_status_transition() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()

    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()
    response = client.put(
        f"/api/v1/applications/{application['id']}",
        json={"status": "application_pending"},
        headers=headers,
    )
    assert response.status_code == 400


def test_company_profile_crud_happy_path() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company_res = client.post(
        "/api/v1/companies", json={"name": "RoadRunner", "website": "https://example.com"}, headers=headers
    )
    assert company_res.status_code == 201
    company = company_res.json()

    update_company = client.put(
        f"/api/v1/companies/{company['id']}",
        json={
            "overview": "Hiring fast",
            "full_product_detail": "https://drive.google.com/file/d/company-overview",
            "full_hiring_detail": "https://drive.google.com/file/d/company-hiring",
            "full_organization_detail": "https://drive.google.com/file/d/company-organization",
        },
        headers=headers,
    )
    assert update_company.status_code == 200
    assert update_company.json()["overview"] == "Hiring fast"
    assert (
        update_company.json()["full_product_detail"]
        == "https://drive.google.com/file/d/company-overview"
    )
    assert (
        update_company.json()["full_hiring_detail"]
        == "https://drive.google.com/file/d/company-hiring"
    )
    assert (
        update_company.json()["full_organization_detail"]
        == "https://drive.google.com/file/d/company-organization"
    )

    profile_res = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers)
    assert profile_res.status_code == 201
    profile = profile_res.json()

    delete_profile = client.delete(f"/api/v1/profiles/{profile['id']}", headers=headers)
    assert delete_profile.status_code == 204


def test_notifications_unread_count_endpoint_returns_only_unread_total() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    user = repo.get_user_by_email("test@example.com")
    assert user is not None
    unread_note = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a1", message="Ready"),
    )
    repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a2", message="Done"),
        check=True,
    )
    repo.mark_notification_read(user.id, unread_note.id)
    repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.FOLLOW_UP_DRAFT,
        notification_type=NotificationSeverity.WARN,
        payload=NotificationPayload(id="a3", message="Needs review"),
    )

    response = client.get("/api/v1/notifications/unread-count", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"count": 2}


def test_notifications_summary_returns_count_and_bounded_newest_unread_rows() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    user = repo.get_user_by_email("test@example.com")
    assert user is not None

    first = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a1", message="Older"),
    )
    second = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.FOLLOW_UP_DRAFT,
        notification_type=NotificationSeverity.WARN,
        payload=NotificationPayload(id="a2", message="Newest"),
    )
    newest = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.SYSTEM_ERROR,
        notification_type=NotificationSeverity.FAILED,
        payload=NotificationPayload(id="a3", message="Read"),
    )
    repo.mark_notification_read(user.id, first.id)

    response = client.get(
        "/api/v1/notifications/summary",
        params={"latest_limit": 1},
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["unread_count"] == 2
    assert [n["id"] for n in body["newest_unread"]] == [newest.id]


def test_notifications_summary_zero_limit_skips_notification_list_lookup() -> None:
    class SummaryRepo(InMemoryRepository):
        def list_notifications(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            raise AssertionError("latest_limit=0 must not fetch notification rows")

    repo = SummaryRepo()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    user = repo.get_user_by_email("test@example.com")
    assert user is not None
    repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a1", message="Unread"),
    )

    response = client.get(
        "/api/v1/notifications/summary",
        params={"latest_limit": 0},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == {"unread_count": 1, "newest_unread": []}


def test_notifications_bulk_read_marks_only_selected_unread_rows() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    user = repo.get_user_by_email("test@example.com")
    assert user is not None

    first = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a1", message="One"),
    )
    second = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a2", message="Two"),
    )
    other_user_token = _create_user_and_login(
        client,
        name="Other",
        email="other-bulk-read@example.com",
        role="user",
    )
    other_user = repo.get_user_by_email("other-bulk-read@example.com")
    assert other_user is not None
    other = repo.create_notification(
        user_id=other_user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a3", message="Other"),
    )
    repo.mark_notification_read(user.id, second.id)

    response = client.post(
        "/api/v1/notifications/read",
        json={"ids": [first.id, first.id, second.id, other.id]},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == {"updated": 1}
    assert repo.notifications[first.id].read_at is not None
    assert repo.notifications[second.id].read_at is not None
    assert repo.notifications[other.id].read_at is None
    other_response = client.post(
        "/api/v1/notifications/read",
        json={"ids": [other.id]},
        headers=_auth_headers(other_user_token),
    )
    assert other_response.json() == {"updated": 1}


def test_notifications_bulk_read_rejects_oversized_payload() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    response = client.post(
        "/api/v1/notifications/read",
        json={"ids": [f"n-{idx}" for idx in range(201)]},
        headers=headers,
    )

    assert response.status_code == 422


def test_mongo_dashboard_application_counts_uses_count_queries() -> None:
    class FakeApplications:
        def __init__(self) -> None:
            self.filters: list[dict] = []

        def count_documents(self, query: dict) -> int:
            self.filters.append(query)
            return len(self.filters)

    class FakeDb:
        def __init__(self) -> None:
            self.applications = FakeApplications()

    repo = object.__new__(MongoRepository)
    repo.db = FakeDb()

    result = repo.dashboard_application_counts(created_by_user_id="u1")

    assert result == {
        "company_research_pipeline": 1,
        "application_ready": 2,
        "actions_need_review": 3,
    }
    assert repo.db.applications.filters == [
        {
            "status": {
                "$in": ["company_research_pending", "company_researching"],
            },
            "created_by_user_id": "u1",
        },
        {
            "status": "application_ready",
            "created_by_user_id": "u1",
        },
        {
            "status": "application_ready",
            "created_by_user_id": "u1",
            "applied": False,
        },
    ]


def _mongo_doc(item) -> dict:
    payload = item.model_dump(mode="json")
    payload["_id"] = payload.pop("id")
    return payload


def _matches_mongo_query(row: dict, query: dict) -> bool:
    for key, expected in query.items():
        if key == "$and":
            if not all(_matches_mongo_query(row, part) for part in expected):
                return False
            continue
        if key == "$or":
            if not any(_matches_mongo_query(row, part) for part in expected):
                return False
            continue
        actual = row.get(key)
        if isinstance(expected, dict):
            if "$exists" in expected and (key in row) is not bool(expected["$exists"]):
                return False
            if "$ne" in expected and actual == expected["$ne"]:
                return False
            if "$in" in expected and actual not in expected["$in"]:
                return False
            if "$nin" in expected and actual in expected["$nin"]:
                return False
            if "$gte" in expected and actual < expected["$gte"]:
                return False
            if "$lte" in expected and actual > expected["$lte"]:
                return False
            if "$regex" in expected:
                import re

                flags = re.IGNORECASE if "i" in expected.get("$options", "") else 0
                if not re.search(expected["$regex"], str(actual or ""), flags):
                    return False
            continue
        if actual != expected:
            return False
    return True


class _FakeMongoCursor:
    def __init__(self, collection: "_FakeMongoCollection", rows: list[dict]) -> None:
        self.collection = collection
        self.rows = rows
        self.sort_spec: list[tuple[str, int]] = []
        self.skip_count = 0
        self.limit_count: int | None = None
        self.collation_value: dict | None = None

    def collation(self, value: dict):
        self.collation_value = value
        self.collection.collations.append(value)
        return self

    def sort(self, spec: list[tuple[str, int]]):
        self.sort_spec = spec
        self.collection.sorts.append(spec)
        return self

    def skip(self, count: int):
        self.skip_count = count
        self.collection.skips.append(count)
        return self

    def limit(self, count: int):
        self.limit_count = count
        self.collection.limits.append(count)
        return self

    def __iter__(self):
        rows = list(self.rows)
        for key, direction in reversed(self.sort_spec):
            rows.sort(
                key=lambda row: (
                    str(row.get(key)).lower()
                    if self.collation_value and isinstance(row.get(key), str)
                    else row.get(key)
                ),
                reverse=direction < 0,
            )
        if self.skip_count:
            rows = rows[self.skip_count :]
        if self.limit_count is not None:
            rows = rows[: self.limit_count]
        return iter(rows)


class _FakeMongoCollection:
    def __init__(self, docs: list[dict] | None = None) -> None:
        self.docs = docs or []
        self.replacements: list[tuple[dict, dict, bool]] = []
        self.deletes: list[dict] = []
        self.full_rewrites: list[dict] = []
        self.inserts: list[list[dict]] = []
        self.find_queries: list[dict] = []
        self.count_queries: list[dict] = []
        self.sorts: list[list[tuple[str, int]]] = []
        self.skips: list[int] = []
        self.limits: list[int] = []
        self.collations: list[dict] = []
        self.distinct_calls: list[tuple[str, dict]] = []
        self.indexes: list[tuple[list[tuple[str, int]], dict]] = []
        self.projections: list[dict[str, int] | None] = []

    def replace_one(self, query: dict, payload: dict, upsert: bool = False) -> None:
        self.replacements.append((query, payload, upsert))

    def delete_one(self, query: dict) -> None:
        self.deletes.append(query)

    def delete_many(self, query: dict) -> None:
        if query == {}:
            self.full_rewrites.append(query)
        self.deletes.append(query)

    def insert_many(self, docs: list[dict]) -> None:
        self.inserts.append(docs)

    def find(self, query: dict | None = None, projection: dict[str, int] | None = None):
        query = query or {}
        self.find_queries.append(query)
        self.projections.append(projection)
        rows = [row for row in self.docs if _matches_mongo_query(row, query)]
        if projection:
            include_keys = {key for key, value in projection.items() if value and key != "_id"}
            include_id = projection.get("_id", 1) != 0
            projected_rows = []
            for row in rows:
                projected = {"_id": row["_id"]} if include_id and "_id" in row else {}
                for key in include_keys:
                    if "." not in key:
                        if key in row:
                            projected[key] = row[key]
                        continue
                    parent, child = key.split(".", 1)
                    parent_value = row.get(parent)
                    if isinstance(parent_value, dict) and child in parent_value:
                        projected.setdefault(parent, {})[child] = parent_value[child]
                projected_rows.append(projected)
            rows = projected_rows
        return _FakeMongoCursor(
            self,
            rows,
        )

    def find_one(self, query: dict) -> dict | None:
        return next(iter(self.find(query)), None)

    def distinct(self, field: str, query: dict | None = None) -> list:
        query = query or {}
        self.distinct_calls.append((field, query))
        return list(
            {
                row.get(field)
                for row in self.docs
                if field in row and _matches_mongo_query(row, query)
            }
        )

    def count_documents(self, query: dict) -> int:
        self.count_queries.append(query)
        return sum(1 for row in self.docs if _matches_mongo_query(row, query))

    def create_index(self, keys: list[tuple[str, int]], **kwargs) -> None:
        self.indexes.append((keys, kwargs))


class _FakeMongoDb:
    def __init__(self) -> None:
        self._collections: dict[str, _FakeMongoCollection] = {}

    def __getitem__(self, name: str) -> _FakeMongoCollection:
        return self._collections.setdefault(name, _FakeMongoCollection())

    def __getattr__(self, name: str) -> _FakeMongoCollection:
        return self[name]

    def clear_ops(self) -> None:
        for collection in self._collections.values():
            collection.replacements.clear()
            collection.deletes.clear()
            collection.full_rewrites.clear()
            collection.inserts.clear()
            collection.find_queries.clear()
            collection.count_queries.clear()
            collection.sorts.clear()
            collection.skips.clear()
            collection.limits.clear()
            collection.collations.clear()
            collection.distinct_calls.clear()
            collection.indexes.clear()
            collection.projections.clear()

    def assert_no_full_rewrites(self) -> None:
        rewritten = {
            name: collection.full_rewrites
            for name, collection in self._collections.items()
            if collection.full_rewrites
        }
        assert rewritten == {}


def _mongo_repo_for_write_tests() -> tuple[MongoRepository, _FakeMongoDb]:
    repo = object.__new__(MongoRepository)
    InMemoryRepository.__init__(repo)
    db = _FakeMongoDb()
    repo.db = db
    return repo, db


def _sync_fake_mongo_docs_from_repo(
    repo: InMemoryRepository, db: _FakeMongoDb, *collection_names: str
) -> None:
    for collection_name in collection_names:
        values = getattr(repo, collection_name)
        db[collection_name].docs = [_mongo_doc(item) for item in values.values()]


def _mongo_repo_for_query_tests() -> tuple[MongoRepository, _FakeMongoDb]:
    repo = object.__new__(MongoRepository)
    db = _FakeMongoDb()
    repo.db = db
    return repo, db


def test_mongo_repository_ensures_indexes_for_query_backed_lists() -> None:
    repo, db = _mongo_repo_for_query_tests()

    repo._ensure_indexes()

    assert (("archived", 1), ("updated_at", -1)) in [
        tuple(keys) for keys, _ in db.companies.indexes
    ]
    assert (
        [("name", 1)],
        {"collation": {"locale": "en", "strength": 2}},
    ) in db.companies.indexes
    assert (
        [("name", 1)],
        {"collation": {"locale": "en", "strength": 2}},
    ) in db.industries.indexes
    assert (
        [("name", 1)],
        {"collation": {"locale": "en", "strength": 2}},
    ) in db.profiles.indexes
    assert ([("status", 1), ("updated_at", -1)], {}) in db.applications.indexes
    assert ([("status", 1), ("created_at", 1)], {}) in db.applications.indexes
    assert ([("company_id", 1), ("updated_at", -1)], {}) in db.applications.indexes
    assert ([("user_id", 1), ("read_at", 1), ("timestamp", -1)], {}) in db.notifications.indexes
    assert (
        [("archived", 1), ("research_status", 1), ("created_at", 1)],
        {},
    ) in db.companies.indexes
    assert (
        [("actor_type", 1), ("entity_type", 1), ("created_at", -1)],
        {},
    ) in db.audit_events.indexes
    assert (
        [("application_id", 1), ("order_index", 1), ("created_at", 1)],
        {},
    ) in db.per_profile_applications.indexes
    assert ([("per_profile_application_id", 1), ("created_at", 1)], {}) in db.emails.indexes


class _FakeBulkMongoCollection(_FakeMongoCollection):
    def __init__(self) -> None:
        super().__init__()
        self.bulk_writes: list[tuple[list[object], bool]] = []

    def bulk_write(self, operations: list[object], ordered: bool = True) -> None:
        self.bulk_writes.append((operations, ordered))


class _FakeBulkMongoDb(_FakeMongoDb):
    def __getitem__(self, name: str) -> _FakeBulkMongoCollection:
        collection = self._collections.get(name)
        if collection is None:
            collection = _FakeBulkMongoCollection()
            self._collections[name] = collection
        return collection


def test_mongo_repository_list_companies_uses_query_pagination_and_distinct_annotation() -> None:
    seed = InMemoryRepository()
    acme = seed.create_company(
        CompanyCreate(name="Ac.me Labs", research_status=CompanyResearchStatus.pending)
    )
    other = seed.create_company(
        CompanyCreate(name="Other", research_status=CompanyResearchStatus.indexed)
    )
    archived = seed.create_company(CompanyCreate(name="Ac.me Archived"))
    seed.archive_company(archived.id, "old")
    app = seed.create_application(
        ApplicationCreate(company_id=acme.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id="u1",
    )
    repo, db = _mongo_repo_for_query_tests()
    db.companies.docs = [_mongo_doc(other), _mongo_doc(acme), _mongo_doc(archived)]
    db.applications.docs = [_mongo_doc(app)]

    rows = repo.list_companies(
        skip=0,
        limit=10,
        search="Ac.",
        sort="name_asc",
        research_status=CompanyResearchStatus.pending,
        has_application=True,
    )

    assert [row.id for row in rows] == [acme.id]
    assert rows[0].has_application is True
    assert db.companies.find_queries[-1] == {
        "$and": [
            {
                "archived": {"$ne": True},
                "name": {"$regex": "Ac\\.", "$options": "i"},
            },
            {
                "$or": [
                    {"research_status": "pending"},
                    {"research_status": {"$exists": False}, "indexed": {"$ne": True}},
                ]
            },
        ],
        "_id": {"$in": [acme.id]},
    }
    assert db.companies.sorts[-1] == [("name", 1)]
    assert db.companies.limits[-1] == 10
    assert db.companies.collations[-1] == {"locale": "en", "strength": 2}
    assert db.applications.distinct_calls == [
        ("company_id", {}),
        ("company_id", {"company_id": {"$in": [acme.id]}}),
    ]


def test_mongo_repository_list_company_summaries_uses_projection_and_distinct_annotation() -> None:
    seed = InMemoryRepository()
    acme = seed.create_company(
        CompanyCreate(
            name="Ac.me Labs",
            website="https://acme.example",
            overview="heavy overview",
            full_product_detail="heavy product detail",
            full_hiring_detail="heavy hiring detail",
            full_organization_detail="heavy org detail",
            enrichment_source_links=["https://source.example/acme"],
        )
    )
    other = seed.create_company(
        CompanyCreate(name="Other", research_status=CompanyResearchStatus.indexed)
    )
    archived = seed.create_company(CompanyCreate(name="Ac.me Archived"))
    seed.archive_company(archived.id, "old")
    app = seed.create_application(
        ApplicationCreate(company_id=acme.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id="u1",
    )
    repo, db = _mongo_repo_for_query_tests()
    db.companies.docs = [_mongo_doc(other), _mongo_doc(acme), _mongo_doc(seed.companies[archived.id])]
    db.applications.docs = [_mongo_doc(app)]

    rows = repo.list_company_summaries(
        skip=0,
        limit=10,
        search="Ac.",
        sort="name_asc",
        research_status=CompanyResearchStatus.pending,
        has_application=True,
    )

    assert [row.id for row in rows] == [acme.id]
    assert rows[0].name == acme.name
    assert rows[0].website == acme.website
    assert rows[0].has_application is True
    assert not hasattr(rows[0], "overview")
    assert db.companies.find_queries[-1] == {
        "$and": [
            {
                "archived": {"$ne": True},
                "name": {"$regex": "Ac\\.", "$options": "i"},
            },
            {
                "$or": [
                    {"research_status": "pending"},
                    {"research_status": {"$exists": False}, "indexed": {"$ne": True}},
                ]
            },
        ],
        "_id": {"$in": [acme.id]},
    }
    assert db.companies.projections[-1] == {
        "_id": 1,
        "name": 1,
        "website": 1,
        "research_status": 1,
        "indexed": 1,
        "created_at": 1,
        "updated_at": 1,
    }
    assert db.companies.sorts[-1] == [("name", 1)]
    assert db.companies.limits[-1] == 10
    assert db.companies.collations[-1] == {"locale": "en", "strength": 2}
    assert db.applications.distinct_calls == [
        ("company_id", {}),
        ("company_id", {"company_id": {"$in": [acme.id]}}),
    ]


def test_mongo_repository_list_profiles_uses_query_pagination() -> None:
    seed = InMemoryRepository()
    active = seed.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    frozen = seed.create_profile(
        ProfileCreate.model_validate(
            {
                **_valid_profile_create_payload(),
                "email": "frozen@example.com",
                "name": "Frozen",
                "location": "Berlin",
            }
        )
    )
    seed.profiles[frozen.id] = seed.profiles[frozen.id].model_copy(update={"frozen": True})
    repo, db = _mongo_repo_for_query_tests()
    db.profiles.docs = [_mongo_doc(seed.profiles[frozen.id]), _mongo_doc(active)]

    rows = repo.list_profiles(skip=0, limit=5, search="berlin", frozen=True)
    profile_query = db.profiles.find_queries[-1]
    profile_sort = db.profiles.sorts[-1]
    profile_limit = db.profiles.limits[-1]
    profile_collation = db.profiles.collations[-1]
    ids = repo.list_profile_ids(skip=0, limit=5, include_frozen=False)

    assert [row.id for row in rows] == [frozen.id]
    assert ids == [active.id]
    assert profile_query == {
        "frozen": True,
        "$or": [
            {"name": {"$regex": "berlin", "$options": "i"}},
            {"email": {"$regex": "berlin", "$options": "i"}},
            {"location": {"$regex": "berlin", "$options": "i"}},
            {"niche_info_md": {"$regex": "berlin", "$options": "i"}},
        ],
    }
    assert profile_sort == [("name", 1)]
    assert profile_limit == 5
    assert profile_collation == {"locale": "en", "strength": 2}
    assert db.profiles.find_queries[-1] == {"frozen": {"$ne": True}}

    summary_rows = repo.list_profile_summaries(skip=0, limit=5, search="berlin", frozen=True)
    assert [row.id for row in summary_rows] == [frozen.id]
    assert db.profiles.find_queries[-1] == {
        "frozen": True,
        "$or": [
            {"name": {"$regex": "berlin", "$options": "i"}},
            {"email": {"$regex": "berlin", "$options": "i"}},
            {"location": {"$regex": "berlin", "$options": "i"}},
            {"niche_info_md": {"$regex": "berlin", "$options": "i"}},
        ],
    }
    assert db.profiles.projections[-1] == {
        "_id": 1,
        "name": 1,
        "frozen": 1,
        "location": 1,
        "email": 1,
        "phone": 1,
        "created_at": 1,
        "updated_at": 1,
    }
    assert db.profiles.sorts[-1] == [("name", 1)]
    assert db.profiles.limits[-1] == 5
    assert db.profiles.collations[-1] == {"locale": "en", "strength": 2}


def test_mongo_repository_industry_picker_helpers_use_query_paths() -> None:
    seed = InMemoryRepository()
    agriculture = seed.create_industry(IndustryCreate(name="Agriculture"))
    analytics = seed.create_industry(IndustryCreate(name="Analytics"))
    retail = seed.create_industry(IndustryCreate(name="Retail"))
    repo, db = _mongo_repo_for_query_tests()
    db.industries.docs = [_mongo_doc(retail), _mongo_doc(agriculture), _mongo_doc(analytics)]

    listed = repo.list_industries(skip=1, limit=1, search="a")
    total = repo.count_industries("a")
    selected = repo.get_industries_by_ids([retail.id, analytics.id, "missing-id"])
    options = repo.list_industry_options(limit=1, search="a", exclude_ids=[analytics.id])

    assert [row.id for row in listed] == [analytics.id]
    assert total == 3
    assert [row.id for row in selected] == [retail.id, analytics.id]
    assert [row.id for row in options] == [agriculture.id]
    assert db.industries.count_queries[-1] == {"name": {"$regex": "a", "$options": "i"}}
    assert db.industries.find_queries[-3] == {"name": {"$regex": "a", "$options": "i"}}
    assert db.industries.find_queries[-2] == {
        "_id": {"$in": [retail.id, analytics.id, "missing-id"]}
    }
    assert db.industries.find_queries[-1] == {
        "name": {"$regex": "a", "$options": "i"},
        "_id": {"$nin": [analytics.id]},
    }
    assert db.industries.skips[-1] == 1
    assert db.industries.sorts[-1] == [("name", 1)]
    assert db.industries.limits[-1] == 1
    assert db.industries.collations[-1] == {"locale": "en", "strength": 2}


def test_mongo_repository_list_applications_uses_query_page_and_bounded_enrichment() -> None:
    seed = InMemoryRepository()
    company = seed.create_company(CompanyCreate(name="Acme"))
    profile = seed.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    first = seed.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id="u1",
    )
    second = seed.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id="u1",
    )
    ppa = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=second.id, profile_id=profile.id)
    )
    repo, db = _mongo_repo_for_query_tests()
    db.applications.docs = [_mongo_doc(first), _mongo_doc(second)]
    db.companies.docs = [_mongo_doc(company)]
    db.per_profile_applications.docs = [_mongo_doc(ppa)]
    db.profiles.docs = [_mongo_doc(profile)]

    rows = repo.list_applications(
        skip=0,
        limit=20,
        status=ApplicationStatus.ppa_pending,
        company_id=company.id,
        applied=False,
        email_sent=False,
        sort="updated_at_asc",
        exclude_status=None,
        created_by_user_id="u1",
    )

    assert [row.id for row in rows] == [second.id]
    assert rows[0].company_name == company.name
    assert rows[0].applied_profiles[0].profile_name == profile.name
    assert db.applications.find_queries[-1] == {
        "$and": [
            {
                "status": {"$in": ["analysis_ready", "ppa_pending"]},
                "company_id": company.id,
                "created_by_user_id": "u1",
            },
            {"applied": {"$ne": True}},
            {"status": {"$ne": "applied"}},
        ],
        "email_sent": False,
    }
    assert db.applications.sorts[-1] == [("updated_at", 1)]
    assert db.applications.limits[-1] == 20
    assert db.companies.find_queries[-1] == {"_id": {"$in": [company.id]}}
    assert db.per_profile_applications.find_queries[-1] == {
        "application_id": {"$in": [second.id]}
    }
    assert db.profiles.find_queries[-1] == {"_id": {"$in": [profile.id]}}

    combined_rows = repo.list_applications(
        skip=0,
        limit=20,
        status=ApplicationStatus.ppa_pending,
        sort="updated_at_desc",
        exclude_status=ApplicationStatus.archived,
    )

    assert [row.id for row in combined_rows] == [second.id]
    assert db.applications.find_queries[-1] == {
        "$and": [
            {"status": {"$in": ["analysis_ready", "ppa_pending"]}},
            {"status": {"$nin": ["archived"]}},
        ]
    }


def test_mongo_repository_list_applications_supports_company_search_and_profile_name_filters() -> None:
    seed = InMemoryRepository()
    acme_company = seed.create_company(CompanyCreate(name="Acme Platform"))
    other_company = seed.create_company(CompanyCreate(name="Other Co"))
    alex_profile = seed.create_profile(
        ProfileCreate.model_validate({**_valid_profile_create_payload(), "name": "Alex Dev"})
    )
    blair_profile = seed.create_profile(
        ProfileCreate.model_validate(
            {**_valid_profile_create_payload(), "name": "Blair Ops", "email": "blair-mongo@example.com"}
        )
    )
    acme_application = seed.create_application(
        ApplicationCreate(company_id=acme_company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    other_application = seed.create_application(
        ApplicationCreate(company_id=other_company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    acme_ppa = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=acme_application.id, profile_id=alex_profile.id)
    )
    other_ppa = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=other_application.id, profile_id=blair_profile.id)
    )
    repo, db = _mongo_repo_for_query_tests()
    db.applications.docs = [_mongo_doc(acme_application), _mongo_doc(other_application)]
    db.companies.docs = [_mongo_doc(acme_company), _mongo_doc(other_company)]
    db.per_profile_applications.docs = [_mongo_doc(acme_ppa), _mongo_doc(other_ppa)]
    db.profiles.docs = [_mongo_doc(alex_profile), _mongo_doc(blair_profile)]

    rows = repo.list_applications(
        skip=0,
        limit=20,
        status=ApplicationStatus.ppa_pending,
        company_search="acme",
        applied_profile_names=["Alex Dev"],
    )

    assert [row.id for row in rows] == [acme_application.id]
    assert db.companies.find_queries[0] == {"name": {"$regex": "acme", "$options": "i"}}
    assert db.companies.projections[0] == {"_id": 1}
    assert db.applications.distinct_calls == [
        (
            "_id",
            {
                "status": {"$in": ["analysis_ready", "ppa_pending"]},
                "company_id": {"$in": [acme_company.id]},
            },
        )
    ]
    assert db.per_profile_applications.find_queries[-1] == {
        "application_id": {"$in": [acme_application.id]}
    }
    assert db.per_profile_applications.projections[-1] == {
        "_id": 1,
        "application_id": 1,
        "profile_id": 1,
        "order_index": 1,
        "created_at": 1,
    }
    assert db.profiles.find_queries[-1] == {"_id": {"$in": [alex_profile.id]}}
    assert db.profiles.projections[-1] == {"_id": 1, "name": 1}
    assert db.applications.find_queries[-1] == {
        "$and": [
            {
                "status": {"$in": ["analysis_ready", "ppa_pending"]},
                "company_id": {"$in": [acme_company.id]},
            },
            {"_id": {"$in": [acme_application.id]}},
        ]
    }


def test_mongo_repository_applied_profile_facets_use_base_filters_and_projection() -> None:
    seed = InMemoryRepository()
    acme_company = seed.create_company(CompanyCreate(name="Acme Platform"))
    other_company = seed.create_company(CompanyCreate(name="Other Co"))
    alex_profile = seed.create_profile(
        ProfileCreate.model_validate({**_valid_profile_create_payload(), "name": "Alex Dev"})
    )
    blair_profile = seed.create_profile(
        ProfileCreate.model_validate(
            {**_valid_profile_create_payload(), "name": "Blair Ops", "email": "blair-facets-mongo@example.com"}
        )
    )
    first_acme_application = seed.create_application(
        ApplicationCreate(company_id=acme_company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    second_acme_application = seed.create_application(
        ApplicationCreate(company_id=acme_company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    other_application = seed.create_application(
        ApplicationCreate(company_id=other_company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    first_acme_ppa = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=first_acme_application.id, profile_id=blair_profile.id)
    )
    second_acme_ppa = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=second_acme_application.id, profile_id=alex_profile.id)
    )
    other_ppa = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=other_application.id, profile_id=blair_profile.id)
    )
    repo, db = _mongo_repo_for_query_tests()
    db.applications.docs = [
        _mongo_doc(first_acme_application),
        _mongo_doc(second_acme_application),
        _mongo_doc(other_application),
    ]
    db.companies.docs = [_mongo_doc(acme_company), _mongo_doc(other_company)]
    db.per_profile_applications.docs = [
        _mongo_doc(first_acme_ppa),
        _mongo_doc(second_acme_ppa),
        _mongo_doc(other_ppa),
    ]
    db.profiles.docs = [_mongo_doc(alex_profile), _mongo_doc(blair_profile)]

    names = repo.list_application_applied_profile_facets(
        status=ApplicationStatus.ppa_pending,
        exclude_status=ApplicationStatus.archived,
        company_search="Acme",
        limit=10,
    )

    assert names == ["Alex Dev", "Blair Ops"]
    assert db.companies.find_queries[0] == {"name": {"$regex": "Acme", "$options": "i"}}
    assert db.companies.projections[0] == {"_id": 1}
    assert db.applications.distinct_calls == [
        (
            "_id",
            {
                "$and": [
                    {"status": {"$in": ["analysis_ready", "ppa_pending"]}},
                    {"status": {"$nin": ["archived"]}},
                ],
                "company_id": {"$in": [acme_company.id]},
            },
        )
    ]
    assert set(db.per_profile_applications.find_queries[-1]["application_id"]["$in"]) == {
        first_acme_application.id,
        second_acme_application.id,
    }
    assert db.per_profile_applications.projections[-1] == {
        "_id": 1,
        "application_id": 1,
        "profile_id": 1,
        "order_index": 1,
        "created_at": 1,
    }
    assert set(db.profiles.find_queries[-1]["_id"]["$in"]) == {
        blair_profile.id,
        alex_profile.id,
    }
    assert db.profiles.projections[-1] == {"_id": 1, "name": 1}


def test_mongo_repository_application_profile_filter_uses_aggregation_when_available() -> None:
    seed = InMemoryRepository()
    company = seed.create_company(CompanyCreate(name="Acme Platform"))
    profile = seed.create_profile(
        ProfileCreate.model_validate({**_valid_profile_create_payload(), "name": "Alex Dev"})
    )
    application = seed.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    repo, db = _mongo_repo_for_query_tests()
    db.applications.docs = [_mongo_doc(application)]
    db.companies.docs = [_mongo_doc(company)]
    db.profiles.docs = [_mongo_doc(profile)]
    aggregate_pipelines: list[list[dict]] = []

    def aggregate(pipeline: list[dict]) -> list[dict]:
        aggregate_pipelines.append(pipeline)
        return [_mongo_doc(application)]

    db.applications.aggregate = aggregate  # type: ignore[attr-defined]

    rows = repo.list_applications(
        skip=5,
        limit=10,
        status=ApplicationStatus.ppa_pending,
        applied_profile_names=["Alex Dev"],
    )

    assert [row.id for row in rows] == [application.id]
    pipeline = aggregate_pipelines[-1]
    assert pipeline[0] == {"$match": {"status": {"$in": ["analysis_ready", "ppa_pending"]}}}
    assert any(stage.get("$lookup", {}).get("from") == "per_profile_applications" for stage in pipeline)
    assert any(stage.get("$lookup", {}).get("from") == "profiles" for stage in pipeline)
    assert {"$match": {"first_profile.name": {"$in": ["Alex Dev"]}}} in pipeline
    assert {"$skip": 5} in pipeline
    assert {"$limit": 10} in pipeline
    assert db.applications.distinct_calls == []


def test_mongo_repository_application_profile_facets_use_aggregation_when_available() -> None:
    repo, db = _mongo_repo_for_query_tests()
    aggregate_pipelines: list[list[dict]] = []

    def aggregate(pipeline: list[dict]) -> list[dict]:
        aggregate_pipelines.append(pipeline)
        return [{"_id": "Alex Dev"}, {"_id": "Blair Ops"}]

    db.applications.aggregate = aggregate  # type: ignore[attr-defined]

    names = repo.list_application_applied_profile_facets(
        status=ApplicationStatus.ppa_pending,
        exclude_status=ApplicationStatus.archived,
    )

    assert names == ["Alex Dev", "Blair Ops"]
    pipeline = aggregate_pipelines[-1]
    assert pipeline[0] == {
        "$match": {
            "$and": [
                {"status": {"$in": ["analysis_ready", "ppa_pending"]}},
                {"status": {"$nin": ["archived"]}},
            ]
        }
    }
    assert any(stage.get("$lookup", {}).get("from") == "per_profile_applications" for stage in pipeline)
    assert any(stage.get("$lookup", {}).get("from") == "profiles" for stage in pipeline)
    assert {"$group": {"_id": "$first_profile.name"}} in pipeline
    assert {"$limit": 500} in pipeline
    assert db.applications.distinct_calls == []


def test_mongo_repository_agent_queue_tasks_use_indexed_compact_queries() -> None:
    seed = InMemoryRepository()
    first_company = seed.create_company(
        CompanyCreate(name="First Co", website="https://first.example")
    )
    second_company = seed.create_company(CompanyCreate(name="Second Co"))
    first = seed.create_application(
        ApplicationCreate(
            company_id=first_company.id,
            status=ApplicationStatus.company_research_pending,
            job_post={"job_link": "https://jobs.example/first"},
            notes="large internal note",
        ),
        created_by_user_id="u1",
    )
    second = seed.create_application(
        ApplicationCreate(
            company_id=second_company.id,
            status=ApplicationStatus.company_research_pending,
        ),
        created_by_user_id="u1",
    )
    repo, db = _mongo_repo_for_query_tests()
    db.applications.docs = [_mongo_doc(second), _mongo_doc(first)]
    db.companies.docs = [_mongo_doc(first_company), _mongo_doc(second_company)]

    rows = repo.list_agent_application_tasks(ApplicationStatus.company_research_pending, limit=1)

    assert len(rows) == 1
    assert rows[0].id == first.id
    assert rows[0].company_name == first_company.name
    assert rows[0].company_website == first_company.website
    assert rows[0].job_link == "https://jobs.example/first"
    assert not hasattr(rows[0], "notes")
    assert db.applications.find_queries[-1] == {
        "status": {"$in": ["company_research_pending", "draft", "pending_preparation"]}
    }
    assert db.applications.sorts[-1] == [("created_at", 1)]
    assert db.applications.limits[-1] == 1
    assert db.applications.projections[-1] == {
        "_id": 1,
        "status": 1,
        "company_id": 1,
        "job_post.job_link": 1,
        "created_at": 1,
        "updated_at": 1,
    }
    assert db.companies.find_queries[-1] == {"_id": {"$in": [first_company.id]}}
    assert db.companies.projections[-1] == {"_id": 1, "name": 1, "website": 1}


def test_mongo_repository_company_research_tasks_use_compact_query_and_annotation() -> None:
    seed = InMemoryRepository()
    pending = seed.create_company(CompanyCreate(name="Pending Co"))
    indexed = seed.create_company(CompanyCreate(name="Indexed Co", research_status=CompanyResearchStatus.indexed))
    archived = seed.create_company(CompanyCreate(name="Archived Co"))
    seed.archive_company(archived.id, "done")
    app_row = seed.create_application(
        ApplicationCreate(company_id=pending.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id=None,
    )
    repo, db = _mongo_repo_for_query_tests()
    db.companies.docs = [_mongo_doc(indexed), _mongo_doc(pending), _mongo_doc(seed.companies[archived.id])]
    db.applications.docs = [_mongo_doc(app_row)]

    rows = repo.list_company_research_tasks(limit=5)

    assert [row.id for row in rows] == [pending.id]
    assert rows[0].name == pending.name
    assert rows[0].research_status == CompanyResearchStatus.pending
    assert rows[0].has_application is True
    assert db.companies.find_queries[-1] == {
        "$and": [
            {"archived": {"$ne": True}},
            {
                "$or": [
                    {"research_status": "pending"},
                    {"research_status": {"$exists": False}, "indexed": {"$ne": True}},
                ]
            },
        ]
    }
    assert db.companies.projections[-1] == {
        "_id": 1,
        "name": 1,
        "website": 1,
        "research_status": 1,
        "created_at": 1,
        "updated_at": 1,
    }
    assert db.companies.sorts[-1] == [("created_at", 1)]
    assert db.applications.distinct_calls == [("company_id", {"company_id": {"$in": [pending.id]}})]


def test_mongo_repository_batch_loads_emails_for_ppas_with_one_query() -> None:
    seed = InMemoryRepository()
    company = seed.create_company(CompanyCreate(name="Acme"))
    profile = seed.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    application = seed.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    ppa_one = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=application.id, profile_id=profile.id)
    )
    ppa_two = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=application.id, profile_id=profile.id)
    )
    first = seed.create_email(
        EmailCreate(per_profile_application_id=ppa_one.id, kind=EmailKind.cold, content="First")
    )
    second = seed.create_email(
        EmailCreate(per_profile_application_id=ppa_one.id, kind=EmailKind.follow_up, content="Second")
    )
    repo, db = _mongo_repo_for_query_tests()
    db.emails.docs = [_mongo_doc(second), _mongo_doc(first)]

    grouped = repo.list_emails_for_ppas([ppa_one.id, ppa_two.id, ppa_one.id])

    assert {email.id for email in grouped[ppa_one.id]} == {first.id, second.id}
    assert grouped[ppa_two.id] == []
    assert list(grouped) == [ppa_one.id, ppa_two.id]
    assert db.emails.find_queries == [
        {"per_profile_application_id": {"$in": [ppa_one.id, ppa_two.id]}}
    ]
    assert db.emails.sorts[-1] == [("per_profile_application_id", 1), ("created_at", 1)]


def test_mongo_repository_lists_per_profile_rows_for_application_with_query_sort() -> None:
    seed = InMemoryRepository()
    company = seed.create_company(CompanyCreate(name="Acme"))
    profile = seed.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    application = seed.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    second = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=application.id, profile_id=profile.id, order_index=2)
    )
    first = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=application.id, profile_id=profile.id, order_index=1)
    )
    other_application = seed.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    other = seed.create_per_profile_application(
        PerProfileApplicationCreate(application_id=other_application.id, profile_id=profile.id, order_index=0)
    )
    repo, db = _mongo_repo_for_query_tests()
    db.per_profile_applications.docs = [_mongo_doc(second), _mongo_doc(other), _mongo_doc(first)]

    rows = repo.list_per_profile_for_application(application.id)

    assert [row.id for row in rows] == [first.id, second.id]
    assert db.per_profile_applications.find_queries[-1] == {"application_id": application.id}
    assert db.per_profile_applications.sorts[-1] == [("order_index", 1), ("created_at", 1)]


def test_mongo_repository_batch_loads_profile_names_with_projection() -> None:
    seed = InMemoryRepository()
    profile = seed.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    other = seed.create_profile(
        ProfileCreate.model_validate(
            {**_valid_profile_create_payload(), "name": "Other", "email": "other@example.com"}
        )
    )
    repo, db = _mongo_repo_for_query_tests()
    db.profiles.docs = [_mongo_doc(profile), _mongo_doc(other)]

    names = repo.list_profile_names_by_ids([profile.id, "missing-id", profile.id])

    assert names == {profile.id: profile.name}
    assert db.profiles.find_queries == [{"_id": {"$in": [profile.id, "missing-id"]}}]
    assert db.profiles.projections == [{"_id": 1, "name": 1}]


def test_mongo_repository_list_queries_include_legacy_normalized_records() -> None:
    seed = InMemoryRepository()
    legacy_company = seed.create_company(CompanyCreate(name="Legacy Indexed"))
    legacy_company_doc = _mongo_doc(legacy_company)
    legacy_company_doc.pop("research_status", None)
    legacy_company_doc["indexed"] = True
    legacy_company_doc["archived"] = False
    legacy_app = seed.create_application(
        ApplicationCreate(company_id=legacy_company.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id=None,
    )
    legacy_app_doc = _mongo_doc(legacy_app)
    legacy_app_doc["status"] = "draft"
    repo, db = _mongo_repo_for_query_tests()
    db.companies.docs = [legacy_company_doc]
    db.applications.docs = [legacy_app_doc]

    companies = repo.list_companies(
        skip=0,
        limit=10,
        search=None,
        research_status=CompanyResearchStatus.indexed,
    )
    applications = repo.list_applications(
        skip=0,
        limit=10,
        status=ApplicationStatus.company_research_pending,
    )

    assert [company.id for company in companies] == [legacy_company.id]
    assert companies[0].research_status == CompanyResearchStatus.indexed
    assert [application.id for application in applications] == [legacy_app.id]
    assert applications[0].status == ApplicationStatus.company_research_pending
    assert db.companies.find_queries[0]["$and"][1] == {
        "$or": [
            {"research_status": "indexed"},
            {"research_status": {"$exists": False}, "indexed": True},
        ]
    }
    assert db.applications.find_queries[-1] == {
        "status": {"$in": ["company_research_pending", "draft", "pending_preparation"]}
    }


def test_mongo_repository_audit_and_notification_lists_use_query_pagination() -> None:
    seed = InMemoryRepository()
    event = seed.create_audit_event(
        actor_type=ActorType.user.value,
        actor_id="u1",
        action="create",
        entity_type="company",
        entity_id="c1",
    )
    note = seed.create_notification(
        user_id="u1",
        notification=NotificationKind.COMPANY_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(message="Ready"),
    )
    repo, db = _mongo_repo_for_query_tests()
    db.audit_events.docs = [_mongo_doc(event)]
    db.notifications.docs = [_mongo_doc(note)]

    audit_rows = repo.list_audit_events(
        AuditListQuery(
            skip=0,
            limit=5,
            actor_type=ActorType.user,
            entity_type="company",
            from_ts=event.created_at,
            to_ts=event.created_at,
        )
    )
    notification_rows = repo.list_notifications(
        "u1", NotificationListQuery(skip=1, limit=3, unread_only=True)
    )

    assert [row.id for row in audit_rows] == [event.id]
    assert db.audit_events.find_queries[-1] == {
        "actor_type": "user",
        "entity_type": "company",
        "created_at": {
            "$gte": event.created_at.isoformat().replace("+00:00", "Z"),
            "$lte": event.created_at.isoformat().replace("+00:00", "Z"),
        },
    }
    assert db.audit_events.sorts[-1] == [("created_at", -1)]
    assert db.audit_events.skips == []
    assert db.audit_events.limits[-1] == 5
    assert notification_rows == []
    assert db.notifications.find_queries[-1] == {"user_id": "u1", "read_at": None}
    assert db.notifications.sorts[-1] == [("timestamp", -1)]
    assert db.notifications.skips[-1] == 1
    assert db.notifications.limits[-1] == 3


def test_mongo_repository_updates_company_and_related_apps_without_full_sync() -> None:
    repo, db = _mongo_repo_for_write_tests()
    company = repo.create_company(CompanyCreate(name="Acme"))
    application = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id=None,
    )
    db.clear_ops()

    overview_only = repo.update_company(company.id, CompanyUpdate(overview="Ready"))

    assert overview_only is not None
    assert db.companies.replacements[-1][0] == {"_id": company.id}
    assert db.applications.replacements == []
    db.assert_no_full_rewrites()
    db.clear_ops()

    updated = repo.update_company(
        company.id,
        CompanyUpdate(research_status=CompanyResearchStatus.indexed),
    )

    assert updated is not None
    assert db.companies.replacements[-1][0] == {"_id": company.id}
    assert db.companies.replacements[-1][2] is True
    assert db.applications.replacements[-1][0] == {"_id": application.id}
    assert db.applications.replacements[-1][1]["status"] == ApplicationStatus.ppa_pending.value
    db.assert_no_full_rewrites()


def test_mongo_bulk_persistence_uses_collection_bulk_write_when_available() -> None:
    repo = object.__new__(MongoRepository)
    InMemoryRepository.__init__(repo)
    db = _FakeBulkMongoDb()
    repo.db = db

    with repo.bulk_persistence():
        first = repo.create_company(CompanyCreate(name="First"))
        second = repo.create_company(CompanyCreate(name="Second"))

    assert len(db.companies.bulk_writes) == 1
    operations, ordered = db.companies.bulk_writes[0]
    assert ordered is False
    assert len(operations) == 2
    assert db.companies.replacements == []
    assert db.companies.deletes == []
    assert {op._filter["_id"] for op in operations} == {first.id, second.id}
    db.assert_no_full_rewrites()


def test_mongo_repository_clears_application_with_targeted_related_deletes() -> None:
    repo, db = _mongo_repo_for_write_tests()
    company = repo.create_company(CompanyCreate(name="Acme"))
    profile = repo.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    application = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    ppa = repo.create_per_profile_application(
        PerProfileApplicationCreate(application_id=application.id, profile_id=profile.id)
    )
    email = repo.create_email(
        EmailCreate(per_profile_application_id=ppa.id, kind=EmailKind.cold, content="Hello")
    )
    db.clear_ops()

    reset = repo.clear_application_to_company_research_pending(application.id)

    assert reset is not None
    assert db.applications.replacements[-1][0] == {"_id": application.id}
    assert {"_id": ppa.id} in db.per_profile_applications.deletes
    assert {"_id": email.id} in db.emails.deletes
    db.assert_no_full_rewrites()


def test_mongo_repository_count_applications_for_company_uses_count_query() -> None:
    repo, db = _mongo_repo_for_write_tests()
    company = repo.create_company(CompanyCreate(name="Acme"))
    other_company = repo.create_company(CompanyCreate(name="Other"))
    repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id=None,
    )
    archived = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id=None,
    )
    repo.create_application(
        ApplicationCreate(company_id=other_company.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id=None,
    )
    repo.applications[archived.id] = archived.model_copy(update={"status": ApplicationStatus.archived})
    _sync_fake_mongo_docs_from_repo(repo, db, "applications")
    db.clear_ops()

    count = repo.count_applications_for_company(company.id)

    assert count == 2
    assert db.applications.count_queries == [{"company_id": company.id}]
    assert db.applications.find_queries == []


def test_mongo_repository_clear_company_none_touches_only_company() -> None:
    repo, db = _mongo_repo_for_write_tests()
    company = repo.create_company(CompanyCreate(name="Acme", overview="Old"))
    profile = repo.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    application = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    ppa = repo.create_per_profile_application(
        PerProfileApplicationCreate(application_id=application.id, profile_id=profile.id)
    )
    email = repo.create_email(
        EmailCreate(per_profile_application_id=ppa.id, kind=EmailKind.cold, content="Hello")
    )
    _sync_fake_mongo_docs_from_repo(
        repo,
        db,
        "companies",
        "applications",
        "per_profile_applications",
        "emails",
    )
    db.clear_ops()

    cleared = repo.clear_company_research_detail(company.id, related_applications="none")

    assert cleared is not None
    assert db.companies.replacements[-1][0] == {"_id": company.id}
    assert db.applications.replacements == []
    assert db.per_profile_applications.deletes == []
    assert db.emails.deletes == []
    assert db.applications.distinct_calls == []
    assert repo.per_profile_applications[ppa.id].id == ppa.id
    assert repo.emails[email.id].id == email.id
    db.assert_no_full_rewrites()


def test_mongo_repository_clear_company_reset_persists_targeted_cascade() -> None:
    repo, db = _mongo_repo_for_write_tests()
    company = repo.create_company(CompanyCreate(name="Acme", overview="Old"))
    other_company = repo.create_company(CompanyCreate(name="Other"))
    profile = repo.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    application = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    archived_application = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.archived),
        created_by_user_id=None,
    )
    other_application = repo.create_application(
        ApplicationCreate(company_id=other_company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    ppa = repo.create_per_profile_application(
        PerProfileApplicationCreate(application_id=application.id, profile_id=profile.id)
    )
    archived_ppa = repo.create_per_profile_application(
        PerProfileApplicationCreate(application_id=archived_application.id, profile_id=profile.id)
    )
    other_ppa = repo.create_per_profile_application(
        PerProfileApplicationCreate(application_id=other_application.id, profile_id=profile.id)
    )
    email = repo.create_email(
        EmailCreate(per_profile_application_id=ppa.id, kind=EmailKind.cold, content="Hello")
    )
    archived_email = repo.create_email(
        EmailCreate(per_profile_application_id=archived_ppa.id, kind=EmailKind.cold, content="Keep")
    )
    other_email = repo.create_email(
        EmailCreate(per_profile_application_id=other_ppa.id, kind=EmailKind.cold, content="Other")
    )
    _sync_fake_mongo_docs_from_repo(
        repo,
        db,
        "companies",
        "applications",
        "per_profile_applications",
        "emails",
    )
    db.clear_ops()

    cleared = repo.clear_company_research_detail(company.id, related_applications="reset")

    assert cleared is not None
    assert db.companies.replacements[-1][0] == {"_id": company.id}
    assert [row[0] for row in db.applications.replacements] == [{"_id": application.id}]
    assert db.applications.replacements[-1][1]["status"] == ApplicationStatus.company_research_pending.value
    assert db.per_profile_applications.deletes == [{"_id": ppa.id}]
    assert db.emails.deletes == [{"_id": email.id}]
    assert db.applications.distinct_calls == [
        ("_id", {"company_id": company.id, "status": {"$ne": ApplicationStatus.archived.value}})
    ]
    assert db.per_profile_applications.distinct_calls == [
        ("_id", {"application_id": {"$in": [application.id]}})
    ]
    assert db.emails.distinct_calls == [
        ("_id", {"per_profile_application_id": {"$in": [ppa.id]}})
    ]
    assert repo.applications[archived_application.id].status == ApplicationStatus.archived
    assert repo.per_profile_applications[archived_ppa.id].id == archived_ppa.id
    assert repo.emails[archived_email.id].id == archived_email.id
    assert repo.applications[other_application.id].status == ApplicationStatus.ppa_pending
    assert repo.per_profile_applications[other_ppa.id].id == other_ppa.id
    assert repo.emails[other_email.id].id == other_email.id
    db.assert_no_full_rewrites()


def test_mongo_repository_clear_company_archive_persists_targeted_apps_only() -> None:
    repo, db = _mongo_repo_for_write_tests()
    company = repo.create_company(CompanyCreate(name="Acme", overview="Old"))
    other_company = repo.create_company(CompanyCreate(name="Other"))
    application = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id=None,
    )
    archived_application = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.archived),
        created_by_user_id=None,
    )
    other_application = repo.create_application(
        ApplicationCreate(company_id=other_company.id, status=ApplicationStatus.ppa_pending),
        created_by_user_id=None,
    )
    _sync_fake_mongo_docs_from_repo(repo, db, "companies", "applications")
    db.clear_ops()

    cleared = repo.clear_company_research_detail(company.id, related_applications="archive")

    assert cleared is not None
    assert db.companies.replacements[-1][0] == {"_id": company.id}
    assert {row[0]["_id"] for row in db.applications.replacements} == {
        application.id,
        archived_application.id,
    }
    assert all(
        row[1]["status"] == ApplicationStatus.archived.value for row in db.applications.replacements
    )
    assert all(
        row[1]["archive_reason"] == RELATED_COMPANY_RESEARCH_CLEARED_ARCHIVE_REASON
        for row in db.applications.replacements
    )
    assert db.applications.distinct_calls == [("_id", {"company_id": company.id})]
    assert repo.applications[other_application.id].status == ApplicationStatus.ppa_pending
    assert db.per_profile_applications.deletes == []
    assert db.emails.deletes == []
    db.assert_no_full_rewrites()


def test_mongo_repository_bulk_notifications_touch_only_changed_owned_rows() -> None:
    repo, db = _mongo_repo_for_write_tests()
    own = repo.create_notification(
        user_id="u1",
        notification=NotificationKind.COMPANY_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(message="Own"),
    )
    other = repo.create_notification(
        user_id="u2",
        notification=NotificationKind.COMPANY_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(message="Other"),
    )
    db.clear_ops()

    marked = repo.mark_notifications_read_bulk("u1", [own.id, own.id, other.id, "missing"])

    assert marked == 1
    assert [row[0] for row in db.notifications.replacements] == [{"_id": own.id}]
    assert db.notifications.deletes == []
    db.assert_no_full_rewrites()
    db.clear_ops()

    marked_again = repo.mark_notifications_read_bulk("u1", [own.id, own.id])

    assert marked_again == 0
    assert db.notifications.replacements == []
    assert db.notifications.deletes == []
    db.assert_no_full_rewrites()
    db.clear_ops()

    deleted = repo.delete_notifications_bulk("u1", [own.id, other.id, "missing"])

    assert deleted == 1
    assert db.notifications.replacements == []
    assert db.notifications.deletes == [{"_id": own.id}]
    db.assert_no_full_rewrites()


def test_mongo_bulk_persistence_uses_request_local_state_and_flushes_on_exception() -> None:
    repo, db = _mongo_repo_for_write_tests()
    first_context = copy_context()
    second_context = copy_context()

    def enter_batch():
        manager = repo.bulk_persistence()
        manager.__enter__()
        return manager

    first_manager = first_context.run(enter_batch)
    first = first_context.run(lambda: repo.create_company(CompanyCreate(name="First")))
    assert db.companies.replacements == []

    second_manager = second_context.run(enter_batch)
    second = second_context.run(lambda: repo.create_company(CompanyCreate(name="Second")))
    second_context.run(second_manager.__exit__, None, None, None)

    assert [row[0] for row in db.companies.replacements] == [{"_id": second.id}]
    first_context.run(first_manager.__exit__, None, None, None)
    assert [row[0] for row in db.companies.replacements] == [
        {"_id": second.id},
        {"_id": first.id},
    ]

    db.clear_ops()
    with pytest.raises(RuntimeError):
        with repo.bulk_persistence():
            failed = repo.create_company(CompanyCreate(name="Partial"))
            raise RuntimeError("after first queued write")

    assert [row[0] for row in db.companies.replacements] == [{"_id": failed.id}]
    db.assert_no_full_rewrites()


def test_dashboard_metrics_counts_only_own_applications_for_regular_user() -> None:
    """Non-admin dashboard pipeline/ready/action metrics use applications created_by_user_id == user."""
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    token_admin = _register_and_login(client)
    headers_admin = _auth_headers(token_admin)

    token_user = _create_user_and_login(
        client, name="Jane", email="worker@example.com", password="secret1234", role="user"
    )
    headers_user = _auth_headers(token_user)
    worker = repo.get_user_by_email("worker@example.com")
    assert worker is not None

    company = client.post("/api/v1/companies", json={"name": "Scoped Co"}, headers=headers_admin).json()

    mine = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": ApplicationStatus.company_research_pending.value},
        headers=headers_user,
    ).json()

    admin_app = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": ApplicationStatus.company_research_pending.value},
        headers=headers_admin,
    ).json()

    assert mine["created_by_user_id"] == worker.id

    dash_user = client.get("/api/v1/metrics/dashboard", headers=headers_user).json()
    dash_admin = client.get("/api/v1/metrics/dashboard", headers=headers_admin).json()

    assert dash_user["company_research_pipeline"] == 1
    assert dash_admin["company_research_pipeline"] >= 2


def test_dashboard_metrics_uses_aggregate_counts_without_listing_applications() -> None:
    class DashboardCountingRepo(InMemoryRepository):
        def list_applications(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            raise AssertionError("dashboard must not list application rows")

        def dashboard_application_counts(self, created_by_user_id: str | None = None) -> dict[str, int]:
            return {
                "company_research_pipeline": 4,
                "application_ready": 3,
                "actions_need_review": 2,
            }

    repo = DashboardCountingRepo()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    user = repo.get_user_by_email("test@example.com")
    assert user is not None
    repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a1", message="One"),
    )

    response = client.get("/api/v1/metrics/dashboard", headers=headers)

    assert response.status_code == 200
    assert response.json() == {
        "company_research_pipeline": 4,
        "application_ready": 3,
        "actions_need_review": 2,
        "unread_notifications": 1,
    }


def test_notifications_bulk_delete_returns_deleted_count() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    user = repo.get_user_by_email("test@example.com")
    assert user is not None

    n1 = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a1", message="One"),
    )
    n2 = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(id="a2", message="Two"),
    )

    bulk = client.request(
        "DELETE",
        "/api/v1/notifications",
        json={"ids": [n1.id, n1.id, n2.id, "missing-id"]},
        headers=headers,
    )
    assert bulk.status_code == 200
    assert bulk.json() == {"deleted": 2}

    listed = client.get("/api/v1/notifications", headers=headers).json()
    assert listed == []

    solo = repo.create_notification(
        user_id=user.id,
        notification=NotificationKind.SYSTEM_ERROR,
        notification_type=NotificationSeverity.FAILED,
        payload=NotificationPayload(id=None, message="Err"),
    )
    del_one = client.delete(f"/api/v1/notifications/{solo.id}", headers=headers)
    assert del_one.status_code == 204


def test_notifications_bulk_delete_rejects_oversized_payload() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    response = client.request(
        "DELETE",
        "/api/v1/notifications",
        json={"ids": [f"n-{idx}" for idx in range(201)]},
        headers=headers,
    )

    assert response.status_code == 422


def test_company_update_accepts_legacy_full_overview_field() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Legacy Co"}, headers=headers).json()

    update_company = client.put(
        f"/api/v1/companies/{company['id']}",
        json={"full_overview": "https://legacy.example.com/detail"},
        headers=headers,
    )
    assert update_company.status_code == 200
    assert update_company.json()["full_product_detail"] == "https://legacy.example.com/detail"
    assert "full_overview" not in update_company.json()


def test_profile_create_rejects_incomplete_payload() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    response = client.post("/api/v1/profiles", json={"name": "Only name"}, headers=headers)
    assert response.status_code == 422


def test_cors_preflight_login() -> None:
    app.dependency_overrides[get_repository] = lambda: InMemoryRepository()
    client = TestClient(app)
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_industry_count_and_options_support_bounded_picker_flows() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    agriculture = client.post("/api/v1/industries", json={"name": "Agriculture"}, headers=headers).json()
    analytics = client.post("/api/v1/industries", json={"name": "Analytics"}, headers=headers).json()
    retail = client.post("/api/v1/industries", json={"name": "Retail"}, headers=headers).json()
    space = client.post("/api/v1/industries", json={"name": "Space"}, headers=headers).json()

    count_all = client.get("/api/v1/industries/count", headers=headers)
    assert count_all.status_code == 200
    assert count_all.json() == {"total": 4}

    count_filtered = client.get(
        "/api/v1/industries/count",
        headers=headers,
        params={"search": "an"},
    )
    assert count_filtered.status_code == 200
    assert count_filtered.json() == {"total": 1}

    options = client.get(
        "/api/v1/industries/options",
        headers=headers,
        params=[
            ("ids", retail["id"]),
            ("ids", analytics["id"]),
            ("ids", "missing-id"),
            ("search", "a"),
            ("limit", "1"),
        ],
    )
    assert options.status_code == 200
    assert options.json() == {
        "selected": [retail, analytics],
        "options": [agriculture],
    }

    no_search = client.get(
        "/api/v1/industries/options",
        headers=headers,
        params=[("ids", space["id"]), ("limit", "2")],
    )
    assert no_search.status_code == 200
    assert no_search.json() == {
        "selected": [space],
        "options": [agriculture, analytics],
    }

    too_many_ids = client.get(
        "/api/v1/industries/options",
        headers=headers,
        params=[("ids", f"ind-{index}") for index in range(101)],
    )
    assert too_many_ids.status_code == 422


def test_bulk_create_industries_and_duplicate_validation() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    created = client.post(
        "/api/v1/industries/bulk",
        json={
            "industries": [
                {"name": "FinTech", "description": "Finance and technology"},
                {"name": "HealthTech", "description": "Healthcare"},
            ]
        },
        headers=headers,
    )
    assert created.status_code == 201
    assert len(created.json()) == 2
    assert {row["name"] for row in created.json()} == {"FinTech", "HealthTech"}

    duplicate = client.post(
        "/api/v1/industries/bulk",
        json={"industries": [{"name": "Retail"}, {"name": "retail"}]},
        headers=headers,
    )
    assert duplicate.status_code == 400
    assert duplicate.json()["detail"] == "Duplicate industry names in request: retail"


def test_delete_email_route_removes_email() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "EmailDeleteCo"}, headers=headers).json()
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 1,
            "analysis": "ready",
        },
        headers=headers,
    ).json()
    email = client.post(
        f"/api/v1/per-profile-applications/{ppa['id']}/emails",
        json={
            "per_profile_application_id": ppa["id"],
            "kind": "follow_up",
            "content": "to delete",
        },
        headers=headers,
    ).json()

    deleted = client.delete(f"/api/v1/emails/{email['id']}", headers=headers)
    assert deleted.status_code == 204
    assert repo.get_email(email["id"]) is None

    missing = client.delete(f"/api/v1/emails/{email['id']}", headers=headers)
    assert missing.status_code == 404


def test_profile_freeze_and_unfreeze_visible_in_user_list() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    assert profile["frozen"] is False

    frozen = client.put(
        f"/api/v1/profiles/{profile['id']}",
        json={"frozen": True},
        headers=headers,
    )
    assert frozen.status_code == 200
    assert frozen.json()["frozen"] is True

    listed = client.get("/api/v1/profiles", headers=headers)
    assert listed.status_code == 200
    row = next((r for r in listed.json() if r["id"] == profile["id"]), None)
    assert row is not None
    assert row["frozen"] is True

    unfrozen = client.put(
        f"/api/v1/profiles/{profile['id']}",
        json={"frozen": False},
        headers=headers,
    )
    assert unfrozen.status_code == 200
    assert unfrozen.json()["frozen"] is False


def test_delete_email_and_freeze_profile_hides_agent_profile_fetches() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _create_user_and_login(
        client,
        name="Admin",
        email="admin-freeze@example.com",
        role="admin",
    )
    headers = _auth_headers(token)

    # Create profile and application with one per-profile email.
    profile = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers).json()
    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "application_ready"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "analysis": "Good fit",
        },
        headers=headers,
    ).json()
    email = client.post(
        f"/api/v1/per-profile-applications/{ppa['id']}/emails",
        json={
            "per_profile_application_id": ppa["id"],
            "kind": "cold",
            "content": "Hello",
        },
        headers=headers,
    ).json()

    # Delete email endpoint.
    deleted = client.delete(f"/api/v1/emails/{email['id']}", headers=headers)
    assert deleted.status_code == 204
    emails_after = client.get(f"/api/v1/per-profile-applications/{ppa['id']}/emails", headers=headers)
    assert emails_after.status_code == 200
    assert emails_after.json() == []

    # Freeze profile and verify user list still includes it.
    frozen = client.put(
        f"/api/v1/profiles/{profile['id']}",
        json={"frozen": True},
        headers=headers,
    )
    assert frozen.status_code == 200
    assert frozen.json()["frozen"] is True
    all_profiles = client.get("/api/v1/profiles", headers=headers).json()
    assert any(p["id"] == profile["id"] and p["frozen"] is True for p in all_profiles)

    # Agent endpoints should exclude frozen profile.
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "agent-freeze-check"}, headers=headers)
    assert key_resp.status_code == 201
    agent_headers = {"X-API-Key": key_resp.json()["raw_key"]}

    ids = client.get("/api/v1/agent/profiles/ids", headers=agent_headers)
    assert ids.status_code == 200
    assert profile["id"] not in ids.json()["profile_ids"]

    listed = client.get("/api/v1/agent/profiles", headers=agent_headers)
    assert listed.status_code == 200
    assert all(p["id"] != profile["id"] for p in listed.json())

    one = client.get(f"/api/v1/agent/profiles/{profile['id']}", headers=agent_headers)
    assert one.status_code == 404
    assert one.json()["detail"] == "Profile not found"


def test_agent_key_list_omits_hash_and_raw_key_fields() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _create_user_and_login(
        client,
        name="Admin",
        email="agent-key-list-admin@example.com",
        role="admin",
    )
    headers = _auth_headers(token)

    created = client.post("/api/v1/admin/agent-keys", json={"name": "list-check"}, headers=headers)
    assert created.status_code == 201
    created_body = created.json()
    assert "raw_key" in created_body

    listed = client.get("/api/v1/admin/agent-keys", headers=headers)
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert rows[0]["id"] == created_body["id"]
    assert rows[0]["name"] == "list-check"
    assert rows[0]["scopes"] == ["read", "write"]
    assert "raw_key" not in rows[0]
    assert "key_hash" not in rows[0]


def test_revoke_agent_key_removes_it_and_blocks_future_agent_access() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _create_user_and_login(
        client,
        name="Admin",
        email="agent-key-revoke-admin@example.com",
        role="admin",
    )
    headers = _auth_headers(token)
    created = client.post("/api/v1/admin/agent-keys", json={"name": "revoke-check"}, headers=headers)
    assert created.status_code == 201
    key_id = created.json()["id"]
    raw_key = created.json()["raw_key"]

    before_revoke = client.get("/api/v1/admin/agent-keys", headers=headers)
    assert before_revoke.status_code == 200
    assert [row["id"] for row in before_revoke.json()] == [key_id]

    revoke = client.delete(f"/api/v1/admin/agent-keys/{key_id}", headers=headers)
    assert revoke.status_code == 204

    after_revoke = client.get("/api/v1/admin/agent-keys", headers=headers)
    assert after_revoke.status_code == 200
    assert after_revoke.json() == []

    agent_auth = client.get("/api/v1/agent/health", headers={"X-API-Key": raw_key})
    assert agent_auth.status_code == 401
    assert agent_auth.json()["detail"] == "Invalid API key"

    missing = client.delete(f"/api/v1/admin/agent-keys/{key_id}", headers=headers)
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Agent API key not found"


def test_user_role_cannot_list_or_revoke_agent_keys() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _create_user_and_login(
        client,
        name="User",
        email="agent-key-user@example.com",
        role="user",
    )
    headers = _auth_headers(token)

    listed = client.get("/api/v1/admin/agent-keys", headers=headers)
    assert listed.status_code == 403
    revoked = client.delete("/api/v1/admin/agent-keys/key-id", headers=headers)
    assert revoked.status_code == 403


def test_revoke_agent_key_releases_owned_worker_leases() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _create_user_and_login(
        client,
        name="Admin",
        email="agent-key-lease-admin@example.com",
        role="admin",
    )
    headers = _auth_headers(token)
    first = client.post("/api/v1/admin/agent-keys", json={"name": "first-worker-key"}, headers=headers)
    second = client.post("/api/v1/admin/agent-keys", json={"name": "second-worker-key"}, headers=headers)
    assert first.status_code == 201
    assert second.status_code == 201
    first_raw = first.json()["raw_key"]
    first_id = first.json()["id"]
    second_raw = second.json()["raw_key"]

    first_agent_headers = {"X-API-Key": first_raw}
    assigned = client.post(
        "/api/v1/agent/workers/assign/company-researcher",
        headers=first_agent_headers,
    )
    assert assigned.status_code == 200
    blocked = client.post(
        "/api/v1/agent/workers/assign/company-researcher",
        headers={"X-API-Key": second_raw},
    )
    assert blocked.status_code == 409

    revoked = client.delete(f"/api/v1/admin/agent-keys/{first_id}", headers=headers)
    assert revoked.status_code == 204

    reassigned = client.post(
        "/api/v1/agent/workers/assign/company-researcher",
        headers={"X-API-Key": second_raw},
    )
    assert reassigned.status_code == 200


def test_agent_worker_path_assign_release_and_count() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _create_user_and_login(
        client,
        name="Admin",
        email="worker-path-admin@example.com",
        role="admin",
    )
    headers = _auth_headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "worker-path-test"}, headers=headers)
    assert key_resp.status_code == 201
    ak = {"X-API-Key": key_resp.json()["raw_key"]}

    count0 = client.get("/api/v1/agent/workers/count/company-researcher", headers=ak)
    assert count0.status_code == 200
    assert count0.json() == {"active": 0, "max": 1}

    bad_path = client.post("/api/v1/agent/workers/assign/not-a-kind", headers=ak)
    assert bad_path.status_code == 404

    assign = client.post("/api/v1/agent/workers/assign/company-researcher", headers=ak)
    assert assign.status_code == 200
    lease_id = assign.json()["lease_id"]

    count1 = client.get("/api/v1/agent/workers/count/company-researcher", headers=ak)
    assert count1.json() == {"active": 1, "max": 1}

    conflict = client.post("/api/v1/agent/workers/assign/company-researcher", headers=ak)
    assert conflict.status_code == 409

    wrong_kind = client.post(
        "/api/v1/agent/workers/release/ppa-analyser",
        json={"lease_id": lease_id},
        headers=ak,
    )
    assert wrong_kind.status_code == 400

    ok = client.post(
        "/api/v1/agent/workers/release/company-researcher",
        json={"lease_id": lease_id},
        headers=ak,
    )
    assert ok.status_code == 200
    assert ok.json() == {"released": True}

    count2 = client.get("/api/v1/agent/workers/count/company-researcher", headers=ak)
    assert count2.json() == {"active": 0, "max": 1}

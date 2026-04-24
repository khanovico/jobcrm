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


def test_human_list_endpoints_reject_unbounded_limits() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    endpoints = [
        "/api/v1/industries",
        "/api/v1/companies",
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

    settings_response = client.get("/api/v1/settings/workers", headers=headers)
    assert settings_response.status_code == 403

    audit_response = client.get("/api/v1/audit-events", headers=headers)
    assert audit_response.status_code == 403


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
    repo = InMemoryRepository()
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

    detail = client.get(f"/api/v1/applications/{application['id']}/detail", headers=headers)
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["application"]["id"] == application["id"]
    assert payload["company"]["id"] == company["id"]
    assert len(payload["per_profile_applications"]) == 1
    assert payload["per_profile_applications"][0]["id"] == ppa["id"]
    assert payload["per_profile_applications"][0]["profile_name"] == profile["name"]
    assert payload["per_profile_applications"][0]["emails"] == [email]


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

    c = client.post("/api/v1/companies", json={"name": "Once Co"}, headers=headers).json()
    client.post(f"/api/v1/companies/{c['id']}/archive", json={"archive_reason": "gone"}, headers=headers)
    hit = client.post("/api/v1/companies", json={"name": "Once Co"}, headers=headers)
    assert hit.status_code == 409
    d = hit.json()["detail"]
    assert d["code"] == "archived_company_name_exists"
    assert d["archive_reason"] == "gone"


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
        self.sorts: list[list[tuple[str, int]]] = []
        self.skips: list[int] = []
        self.limits: list[int] = []
        self.collations: list[dict] = []
        self.distinct_calls: list[tuple[str, dict]] = []
        self.indexes: list[tuple[list[tuple[str, int]], dict]] = []

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

    def find(self, query: dict | None = None):
        query = query or {}
        self.find_queries.append(query)
        return _FakeMongoCursor(
            self,
            [row for row in self.docs if _matches_mongo_query(row, query)],
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
        return 0

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
            collection.sorts.clear()
            collection.skips.clear()
            collection.limits.clear()
            collection.collations.clear()
            collection.distinct_calls.clear()
            collection.indexes.clear()

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
    ) in db.profiles.indexes
    assert ([("status", 1), ("updated_at", -1)], {}) in db.applications.indexes
    assert ([("company_id", 1), ("updated_at", -1)], {}) in db.applications.indexes
    assert ([("user_id", 1), ("read_at", 1), ("timestamp", -1)], {}) in db.notifications.indexes
    assert (
        [("actor_type", 1), ("entity_type", 1), ("created_at", -1)],
        {},
    ) in db.audit_events.indexes
    assert (
        [("application_id", 1), ("order_index", 1), ("created_at", 1)],
        {},
    ) in db.per_profile_applications.indexes


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


def test_mongo_repository_list_profiles_uses_query_pagination() -> None:
    seed = InMemoryRepository()
    active = seed.create_profile(ProfileCreate.model_validate(_valid_profile_create_payload()))
    frozen = seed.create_profile(
        ProfileCreate.model_validate(
            {**_valid_profile_create_payload(), "email": "frozen@example.com", "name": "Frozen"}
        )
    )
    seed.profiles[frozen.id] = seed.profiles[frozen.id].model_copy(update={"frozen": True})
    repo, db = _mongo_repo_for_query_tests()
    db.profiles.docs = [_mongo_doc(seed.profiles[frozen.id]), _mongo_doc(active)]

    rows = repo.list_profiles(skip=0, limit=5, search="general", include_frozen=False)
    profile_query = db.profiles.find_queries[-1]
    profile_sort = db.profiles.sorts[-1]
    profile_limit = db.profiles.limits[-1]
    profile_collation = db.profiles.collations[-1]
    ids = repo.list_profile_ids(skip=0, limit=5, include_frozen=False)

    assert [row.id for row in rows] == [active.id]
    assert ids == [active.id]
    assert profile_query == {
        "frozen": {"$ne": True},
        "name": {"$regex": "general", "$options": "i"},
    }
    assert profile_sort == [("name", 1)]
    assert profile_limit == 5
    assert profile_collation == {"locale": "en", "strength": 2}
    assert db.profiles.find_queries[-1] == {"frozen": {"$ne": True}}


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


def test_mongo_repository_clear_company_reset_persists_targeted_cascade() -> None:
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
    db.clear_ops()

    cleared = repo.clear_company_research_detail(company.id, related_applications="reset")

    assert cleared is not None
    assert db.companies.replacements[-1][0] == {"_id": company.id}
    assert db.applications.replacements[-1][0] == {"_id": application.id}
    assert db.applications.replacements[-1][1]["status"] == ApplicationStatus.company_research_pending.value
    assert {"_id": ppa.id} in db.per_profile_applications.deletes
    assert {"_id": email.id} in db.emails.deletes
    db.assert_no_full_rewrites()


def test_mongo_repository_clear_company_archive_persists_targeted_apps_only() -> None:
    repo, db = _mongo_repo_for_write_tests()
    company = repo.create_company(CompanyCreate(name="Acme", overview="Old"))
    application = repo.create_application(
        ApplicationCreate(company_id=company.id, status=ApplicationStatus.company_research_pending),
        created_by_user_id=None,
    )
    db.clear_ops()

    cleared = repo.clear_company_research_detail(company.id, related_applications="archive")

    assert cleared is not None
    assert db.companies.replacements[-1][0] == {"_id": company.id}
    assert db.applications.replacements[-1][0] == {"_id": application.id}
    assert db.applications.replacements[-1][1]["status"] == ApplicationStatus.archived.value
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

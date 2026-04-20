from fastapi.testclient import TestClient

from app.auth import hash_password
from app.deps import get_repository
from app.main import app
from app.models import PerProfileApplication, UserCreate
from app.repository import (
    InMemoryRepository,
    RELATED_COMPANY_DELETED_ARCHIVE_REASON,
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
    assert rows[0]["applied_profiles"][0]["profile_name"] == profile["name"]


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


def test_delete_company_archives_all_tied_applications_then_removes_company() -> None:
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

    r = client.delete(f"/api/v1/companies/{company['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["applications_archived"] == 2

    assert client.get(f"/api/v1/companies/{company['id']}", headers=headers).status_code == 404

    got1 = client.get(f"/api/v1/applications/{a1['id']}", headers=headers).json()
    assert got1["status"] == "archived"
    assert got1["archive_reason"] == RELATED_COMPANY_DELETED_ARCHIVE_REASON

    got2 = client.get(f"/api/v1/applications/{a2['id']}", headers=headers).json()
    assert got2["status"] == "archived"
    assert got2["archive_reason"] == RELATED_COMPANY_DELETED_ARCHIVE_REASON


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

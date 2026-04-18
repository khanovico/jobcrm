from fastapi.testclient import TestClient

from app.deps import get_repository
from app.main import app
from app.repository import InMemoryRepository


def _register_and_login(client: TestClient) -> str:
    payload = {"name": "Test", "email": "test@example.com", "password": "secret1234"}
    register_response = client.post("/api/v1/auth/register", json=payload)
    assert register_response.status_code == 201

    login_response = client.post(
        "/api/v1/auth/login", json={"email": payload["email"], "password": payload["password"]}
    )
    assert login_response.status_code == 200
    return login_response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


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


def test_registration_status_changes_after_first_user() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    before = client.get("/api/v1/auth/registration-status")
    assert before.status_code == 200
    assert before.json() == {"registration_open": True}

    payload = {"name": "Owner", "email": "owner@example.com", "password": "secret1234"}
    created = client.post("/api/v1/auth/register", json=payload)
    assert created.status_code == 201

    after = client.get("/api/v1/auth/registration-status")
    assert after.status_code == 200
    assert after.json() == {"registration_open": False}


def test_register_rejected_when_user_already_exists() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    first = {"name": "Owner", "email": "owner@example.com", "password": "secret1234"}
    second = {"name": "Second", "email": "second@example.com", "password": "secret1234"}

    created = client.post("/api/v1/auth/register", json=first)
    assert created.status_code == 201

    blocked = client.post("/api/v1/auth/register", json=second)
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Registration disabled: user already exists"


def test_auth_required_for_companies() -> None:
    app.dependency_overrides[get_repository] = lambda: InMemoryRepository()
    client = TestClient(app)
    response = client.get("/api/v1/companies")
    assert response.status_code == 401


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
            "full_overview": "https://drive.google.com/file/d/company-overview",
        },
        headers=headers,
    )
    assert update_company.status_code == 200
    assert update_company.json()["overview"] == "Hiring fast"
    assert (
        update_company.json()["full_overview"]
        == "https://drive.google.com/file/d/company-overview"
    )

    profile_res = client.post("/api/v1/profiles", json=_valid_profile_create_payload(), headers=headers)
    assert profile_res.status_code == 201
    profile = profile_res.json()

    delete_profile = client.delete(f"/api/v1/profiles/{profile['id']}", headers=headers)
    assert delete_profile.status_code == 204


def test_profile_create_rejects_incomplete_payload() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    response = client.post("/api/v1/profiles", json={"name": "Only name"}, headers=headers)
    assert response.status_code == 422


def test_cors_preflight_register() -> None:
    app.dependency_overrides[get_repository] = lambda: InMemoryRepository()
    client = TestClient(app)
    response = client.options(
        "/api/v1/auth/register",
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
    register_payload = {
        "name": "Admin",
        "email": "admin-freeze@example.com",
        "password": "secret1234",
        "admin": True,
    }
    register_response = client.post("/api/v1/auth/register", json=register_payload)
    assert register_response.status_code == 201
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert login_response.status_code == 200
    token = login_response.json()["access_token"]
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

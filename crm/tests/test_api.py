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
        json={"company_id": company["id"], "status": "pending_preparation"},
        headers=headers,
    ).json()
    archived = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "draft"},
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
    assert application.json()["status"] == "pending_preparation"


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
        json={"company_id": company["id"], "status": "draft"},
        headers=headers,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 0,
            "applied": True,
        },
        headers=headers,
    ).json()
    assert ppa["applied"] is True
    assert ppa.get("applied_at")

    listed = client.get("/api/v1/applications", headers=headers).json()
    assert len(listed) == 1
    assert listed[0]["applied_profiles"] == [
        {"profile_id": profile["id"], "profile_name": "Alex Dev"}
    ]


def test_mark_applied_stamps_once() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()

    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "preparation_ready"},
        headers=headers,
    ).json()

    first = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": True},
        headers=headers,
    )
    assert first.status_code == 200
    first_stamp = first.json()["applied_at"]
    assert first.json()["status"] == "applied"

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
        json={"company_id": company["id"], "status": "preparation_ready"},
        headers=headers,
    ).json()

    marked = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": True},
        headers=headers,
    )
    assert marked.status_code == 200
    assert marked.json()["status"] == "applied"
    assert marked.json()["applied_at"] is not None

    unmarked = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": False},
        headers=headers,
    )
    assert unmarked.status_code == 200
    assert unmarked.json()["applied"] is False
    assert unmarked.json()["applied_at"] is None
    assert unmarked.json()["status"] == "preparation_ready"


def test_rejects_invalid_status_transition() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Acme"}, headers=headers).json()

    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "draft"},
        headers=headers,
    ).json()
    response = client.put(
        f"/api/v1/applications/{application['id']}",
        json={"status": "applied"},
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
        json={"overview": "Hiring fast"},
        headers=headers,
    )
    assert update_company.status_code == 200
    assert update_company.json()["overview"] == "Hiring fast"

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

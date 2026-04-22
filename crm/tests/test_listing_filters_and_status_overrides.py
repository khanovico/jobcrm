"""List API filters, LIFO defaults, and admin status / mark-applied overrides."""

from fastapi.testclient import TestClient

from app.auth import hash_password
from app.deps import get_repository
from app.main import app
from app.models import ApplicationStatus, UserCreate
from app.repository import InMemoryRepository


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


def test_list_companies_includes_has_application_and_filter() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    c1 = client.post("/api/v1/companies", json={"name": "Solo Co"}, headers=headers).json()
    c2 = client.post("/api/v1/companies", json={"name": "With App Co"}, headers=headers).json()
    client.post(
        "/api/v1/applications",
        json={"company_id": c2["id"], "status": "company_research_pending"},
        headers=headers,
    )

    r = client.get("/api/v1/companies?limit=50&sort=updated_at_desc", headers=headers)
    assert r.status_code == 200
    body = r.json()
    by_id = {c["id"]: c for c in body}
    assert by_id[c1["id"]]["has_application"] is False
    assert by_id[c2["id"]]["has_application"] is True

    with_app = client.get(
        "/api/v1/companies?has_application=true&sort=updated_at_desc", headers=headers
    ).json()
    assert {c["id"] for c in with_app} == {c2["id"]}

    no_app = client.get(
        "/api/v1/companies?has_application=false&sort=updated_at_desc", headers=headers
    ).json()
    assert {c["id"] for c in no_app} == {c1["id"]}


def test_get_company_includes_has_application() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)
    c = client.post("/api/v1/companies", json={"name": "Co"}, headers=headers).json()
    assert client.get(f"/api/v1/companies/{c['id']}", headers=headers).json()["has_application"] is False

    client.post(
        "/api/v1/applications",
        json={"company_id": c["id"], "status": "company_research_pending"},
        headers=headers,
    )
    assert client.get(f"/api/v1/companies/{c['id']}", headers=headers).json()["has_application"] is True


def test_list_applications_default_sort_is_updated_at_desc_per_company() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    cx = client.post("/api/v1/companies", json={"name": "CX"}, headers=headers).json()

    app_old = client.post(
        "/api/v1/applications",
        json={"company_id": cx["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()

    third = client.post(
        "/api/v1/applications",
        json={"company_id": cx["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()

    ids_order = [
        row["id"]
        for row in client.get("/api/v1/applications?company_id=" + cx["id"], headers=headers).json()
    ]
    assert ids_order == [third["id"], app_old["id"]]


def test_force_transition_and_force_mark_applied() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_and_login(client)
    headers = _auth_headers(token)

    company = client.post("/api/v1/companies", json={"name": "Plain Co"}, headers=headers).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "company_research_pending"},
        headers=headers,
    ).json()

    bad = client.put(
        f"/api/v1/applications/{application['id']}",
        json={"status": "application_ready"},
        headers=headers,
    )
    assert bad.status_code == 400

    ok_force = client.put(
        f"/api/v1/applications/{application['id']}",
        json={"status": "application_ready", "force_transition": True},
        headers=headers,
    )
    assert ok_force.status_code == 200
    assert ok_force.json()["status"] == "application_ready"

    assert (
        client.post(
            f"/api/v1/applications/{application['id']}/mark-applied",
            json={"applied": True},
            headers=headers,
        ).status_code
        == 200
    )

    repo.applications[application["id"]] = repo.applications[application["id"]].model_copy(
        update={"status": ApplicationStatus.company_research_pending, "applied": False, "applied_at": None}
    )

    bad_mark = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": True},
        headers=headers,
    )
    assert bad_mark.status_code == 400

    ok_force_mark = client.post(
        f"/api/v1/applications/{application['id']}/mark-applied",
        json={"applied": True, "force": True},
        headers=headers,
    )
    assert ok_force_mark.status_code == 200
    assert ok_force_mark.json()["applied"] is True


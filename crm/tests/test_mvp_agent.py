from fastapi.testclient import TestClient

from app.deps import get_repository
from app.main import app
from app.models import ApplicationStatus
from app.repository import InMemoryRepository


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_admin(client: TestClient) -> str:
    client.post(
        "/api/v1/auth/register",
        json={
            "name": "Admin",
            "email": "admin@example.com",
            "password": "secret1234",
            "admin": True,
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "secret1234"},
    )
    assert login.status_code == 200
    return login.json()["access_token"]


def test_agent_requires_api_key() -> None:
    app.dependency_overrides[get_repository] = lambda: InMemoryRepository()
    client = TestClient(app)
    response = client.get("/api/v1/agent/applications/pending")
    assert response.status_code == 422 or response.status_code == 401


def test_agent_pending_and_company_update() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    token = _register_admin(client)
    h = _headers(token)

    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa"}, headers=h)
    assert key_resp.status_code == 201
    raw_key = key_resp.json()["raw_key"]

    boot = client.post(
        "/api/v1/applications/bootstrap",
        json={"company_name": "Acme Co", "company_website": "https://acme.example"},
        headers=h,
    )
    assert boot.status_code == 201
    assert boot.json()["status"] == ApplicationStatus.pending_preparation.value

    pending = client.get(
        "/api/v1/agent/applications/pending",
        headers={"X-API-Key": raw_key},
    )
    assert pending.status_code == 200
    assert len(pending.json()) == 1
    pending_application_id = pending.json()[0]["id"]

    by_id = client.get(
        f"/api/v1/agent/applications/{pending_application_id}",
        headers={"X-API-Key": raw_key},
    )
    assert by_id.status_code == 200
    assert by_id.json()["id"] == pending_application_id

    company_list = client.get("/api/v1/companies", headers=h).json()
    company_id = company_list[0]["id"]

    upd = client.put(
        f"/api/v1/agent/companies/{company_id}",
        json={"overview": "Enriched by JAA"},
        headers={"X-API-Key": raw_key},
    )
    assert upd.status_code == 200
    assert upd.json()["overview"] == "Enriched by JAA"

    audit = client.get("/api/v1/audit-events", headers=h)
    assert audit.status_code == 200
    assert any(e["actor_type"] == "agent" for e in audit.json())


def test_preparation_ready_notification() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)

    boot = client.post(
        "/api/v1/applications/bootstrap",
        json={"company_name": "Beta"},
        headers=h,
    )
    app_id = boot.json()["id"]

    client.put(
        f"/api/v1/applications/{app_id}",
        json={"status": "preparation_ready"},
        headers=h,
    )
    notes = client.get("/api/v1/notifications", headers=h)
    assert notes.status_code == 200
    body = notes.json()
    assert len(body) >= 1
    assert body[0]["kind"] == "preparation_ready"


def test_per_profile_and_email_mark_sent() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)

    company = client.post("/api/v1/companies", json={"name": "Co"}, headers=h).json()
    profile = client.post("/api/v1/profiles", json={"name": "Me"}, headers=h).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "preparation_ready"},
        headers=h,
    ).json()

    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 1,
            "analysis": "Strong fit",
            "fit_score": 88,
        },
        headers=h,
    )
    assert ppa.status_code == 201
    ppa_id = ppa.json()["id"]

    em = client.post(
        f"/api/v1/per-profile-applications/{ppa_id}/emails",
        json={
            "per_profile_application_id": ppa_id,
            "kind": "cold",
            "content": "Hello",
        },
        headers=h,
    )
    assert em.status_code == 201
    email_id = em.json()["id"]

    marked = client.post(f"/api/v1/emails/{email_id}/mark-sent", headers=h)
    assert marked.status_code == 200
    assert marked.json()["sent"] is True
    assert marked.json()["sent_at"] is not None

from fastapi.testclient import TestClient

from app.deps import get_repository
from app.main import app
from app.models import ApplicationCreate, ApplicationStatus
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
    assert body[0]["notification"] == "APPLICATION_UPDATE"
    assert body[0]["type"] == "SUCCESS"
    assert body[0]["payload"]["id"] == app_id


def test_per_profile_and_email_mark_sent() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)

    company = client.post("/api/v1/companies", json={"name": "Co"}, headers=h).json()
    profile = client.post(
        "/api/v1/profiles",
        json={
            "name": "Me",
            "location": "Remote",
            "email": "me@example.com",
            "phone": "+10000000000",
            "educations": [{"university_name": "U", "from_year": 2020, "to_year": 2024}],
            "bio_md": "Bio.",
            "niche_info_md": "Niche.",
        },
        headers=h,
    ).json()
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


def test_agent_get_per_profile_applications_by_application_id() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa-ppa-read"}, headers=h)
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}

    company = client.post("/api/v1/companies", json={"name": "PPA Co"}, headers=h).json()
    profile = client.post(
        "/api/v1/profiles",
        json={
            "name": "PPA Profile",
            "location": "Remote",
            "email": "ppa@example.com",
            "phone": "+10000000010",
            "educations": [{"university_name": "U", "from_year": 2020, "to_year": 2024}],
            "bio_md": "Bio",
            "niche_info_md": "Niche",
        },
        headers=h,
    ).json()
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
            "analysis": "Great fit",
            "fit_score": 91,
        },
        headers=h,
    )
    assert ppa.status_code == 201

    response = client.get(
        f"/api/v1/agent/applications/{application['id']}/per-profile-applications",
        headers=ak,
    )
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["application_id"] == application["id"]
    assert rows[0]["profile_id"] == profile["id"]

    missing = client.get(
        "/api/v1/agent/applications/does-not-exist/per-profile-applications",
        headers=ak,
    )
    assert missing.status_code == 404
    assert missing.json()["detail"] == "Application not found"


def test_agent_health_unindexed_bulk_profiles_notifications() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)

    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa2"}, headers=h)
    assert key_resp.status_code == 201
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}

    health = client.get("/api/v1/agent/health", headers=ak)
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["database"] == "ok"

    c_old = client.post("/api/v1/companies", json={"name": "Old Co", "indexed": False}, headers=h).json()
    client.post("/api/v1/companies", json={"name": "Mid Co", "indexed": False}, headers=h)
    client.post("/api/v1/companies", json={"name": "Indexed Co", "indexed": True}, headers=h)

    unindexed = client.get("/api/v1/agent/companies/unindexed", headers=ak)
    assert unindexed.status_code == 200
    uj = unindexed.json()
    assert len(uj) == 2
    assert uj[0]["id"] == c_old["id"]
    assert uj[0]["indexed"] is False

    bulk = client.patch(
        "/api/v1/agent/companies/bulk",
        json={
            "updates": [
                {"company_id": c_old["id"], "payload": {"indexed": True, "overview": "Done"}},
            ]
        },
        headers=ak,
    )
    assert bulk.status_code == 200
    assert bulk.json()[0]["indexed"] is True
    assert bulk.json()[0]["overview"] == "Done"

    prof = client.post(
        "/api/v1/profiles",
        json={
            "name": "AgentProf",
            "location": "X",
            "email": "ap@example.com",
            "phone": "+10000000001",
            "educations": [{"university_name": "U", "from_year": 2020, "to_year": 2024}],
            "bio_md": "B",
            "niche_info_md": "N",
        },
        headers=h,
    ).json()

    ids = client.get("/api/v1/agent/profiles/ids", headers=ak)
    assert ids.status_code == 200
    assert prof["id"] in ids.json()["profile_ids"]

    one = client.get(f"/api/v1/agent/profiles/{prof['id']}", headers=ak)
    assert one.status_code == 200
    assert one.json()["name"] == "AgentProf"

    n = client.post(
        "/api/v1/agent/notifications",
        json={
            "user_id": client.get("/api/v1/auth/me", headers=h).json()["id"],
            "notification": "SYSTEM_ERROR",
            "type": "SUCCESS",
            "payload": {"message": "Hi — from agent"},
        },
        headers=ak,
    )
    assert n.status_code == 201
    notes = client.get("/api/v1/notifications", headers=h)
    assert notes.status_code == 200
    assert any(x["payload"]["message"] == "Hi — from agent" for x in notes.json())


def test_agent_list_applications_filters() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa3"}, headers=h)
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}

    company = client.post("/api/v1/companies", json={"name": "Co"}, headers=h).json()
    app_sent = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "preparation_ready"},
        headers=h,
    ).json()
    client.post(
        f"/api/v1/applications/{app_sent['id']}/mark-email-sent",
        json={"sent": True},
        headers=h,
    )

    r = client.get(
        "/api/v1/agent/applications?email_sent=true&status_filter=preparation_ready",
        headers=ak,
    )
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["email_sent"] is True


def test_agent_archive_application_with_reason() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa-arch"}, headers=h)
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}

    company = client.post("/api/v1/companies", json={"name": "Z"}, headers=h).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "pending_preparation"},
        headers=h,
    ).json()

    upd = client.put(
        f"/api/v1/agent/applications/{application['id']}",
        json={"status": "archived", "archive_reason": "Role filled"},
        headers=ak,
    )
    assert upd.status_code == 200
    assert upd.json()["status"] == "archived"
    assert upd.json()["archive_reason"] == "Role filled"


def test_agent_notification_requires_payload_id_for_application_update() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa-notif-1"}, headers=h)
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}
    uid = client.get("/api/v1/auth/me", headers=h).json()["id"]

    n = client.post(
        "/api/v1/agent/notifications",
        json={
            "user_id": uid,
            "notification": "APPLICATION_UPDATE",
            "type": "SUCCESS",
            "payload": {"message": "Missing id should fail"},
        },
        headers=ak,
    )
    assert n.status_code == 422


def test_notifications_resolve_links_by_notification_and_payload_id() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa-notif-2"}, headers=h)
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}
    uid = client.get("/api/v1/auth/me", headers=h).json()["id"]

    company = client.post("/api/v1/companies", json={"name": "Link Co"}, headers=h).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": company["id"], "status": "preparation_ready"},
        headers=h,
    ).json()
    profile = client.post(
        "/api/v1/profiles",
        json={
            "name": "Link Prof",
            "location": "Remote",
            "email": "link-prof@example.com",
            "phone": "+10000000002",
            "educations": [{"university_name": "U", "from_year": 2020, "to_year": 2024}],
            "bio_md": "B",
            "niche_info_md": "N",
        },
        headers=h,
    ).json()
    ppa = client.post(
        f"/api/v1/applications/{application['id']}/per-profile-applications",
        json={
            "application_id": application["id"],
            "profile_id": profile["id"],
            "order_index": 1,
            "analysis": "Strong fit",
        },
        headers=h,
    ).json()
    email = client.post(
        f"/api/v1/per-profile-applications/{ppa['id']}/emails",
        json={
            "per_profile_application_id": ppa["id"],
            "kind": "follow_up",
            "content": "Draft follow-up",
        },
        headers=h,
    ).json()

    create_payloads = [
        {
            "notification": "APPLICATION_UPDATE",
            "type": "SUCCESS",
            "payload": {"id": application["id"], "message": "Application updated"},
        },
        {
            "notification": "COMPANY_UPDATE",
            "type": "WARN",
            "payload": {"id": company["id"], "message": "Company update available"},
        },
        {
            "notification": "FOLLOW_UP_DRAFT",
            "type": "SUCCESS",
            "payload": {"id": email["id"], "message": "Follow-up draft ready"},
        },
    ]
    for body in create_payloads:
        n = client.post(
            "/api/v1/agent/notifications",
            json={"user_id": uid, **body},
            headers=ak,
        )
        assert n.status_code == 201

    notes = client.get("/api/v1/notifications", headers=h)
    assert notes.status_code == 200
    rows = notes.json()
    by_kind = {n["notification"]: n for n in rows}
    assert by_kind["APPLICATION_UPDATE"]["link"] == f"/applications/{application['id']}"
    assert by_kind["COMPANY_UPDATE"]["link"] == f"/companies/{company['id']}"
    assert by_kind["FOLLOW_UP_DRAFT"]["link"] == f"/applications/{application['id']}?emailId={email['id']}"


def test_application_link_hidden_when_application_has_no_owner() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token_owner = _register_admin(client)
    h_owner = _headers(token_owner)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa-notif-3"}, headers=h_owner)
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}

    uid = client.get("/api/v1/auth/me", headers=h_owner).json()["id"]
    company = client.post("/api/v1/companies", json={"name": "Hidden Link Co"}, headers=h_owner).json()
    application = repo.create_application(
        ApplicationCreate(company_id=company["id"], status=ApplicationStatus.preparation_ready),
        created_by_user_id=None,
    )

    n = client.post(
        "/api/v1/agent/notifications",
        json={
            "user_id": uid,
            "notification": "APPLICATION_UPDATE",
            "type": "SUCCESS",
            "payload": {"id": application.id, "message": "Should not expose link"},
        },
        headers=ak,
    )
    assert n.status_code == 201

    notes = client.get("/api/v1/notifications", headers=h_owner)
    assert notes.status_code == 200
    rows = notes.json()
    assert len(rows) >= 1
    target = next(x for x in rows if x["payload"]["message"] == "Should not expose link")
    assert target["link"] is None

from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.auth import hash_password
from app.deps import get_repository
from app.main import app
from app.models import ApplicationCreate, ApplicationStatus, UserCreate
from app.repository import InMemoryRepository


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_admin(client: TestClient) -> str:
    repo = app.dependency_overrides[get_repository]()
    repo.create_user(
        UserCreate(
            name="Admin",
            email="admin@example.com",
            password="secret1234",
            role="admin",
        ),
        hash_password("secret1234"),
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
    response = client.get("/api/v1/agent/applications/company-research-pending")
    assert response.status_code == 422 or response.status_code == 401


def test_agent_bulk_company_update_uses_single_persistence_batch() -> None:
    class BulkTrackingRepository(InMemoryRepository):
        def __init__(self) -> None:
            super().__init__()
            self.bulk_entries = 0
            self.bulk_exits = 0

        @contextmanager
        def bulk_persistence(self):
            self.bulk_entries += 1
            try:
                yield
            finally:
                self.bulk_exits += 1

    repo = BulkTrackingRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)

    token = _register_admin(client)
    headers = _headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "batch"}, headers=headers)
    assert key_resp.status_code == 201
    agent_headers = {"X-API-Key": key_resp.json()["raw_key"]}
    first = client.post("/api/v1/companies", json={"name": "First"}, headers=headers).json()
    second = client.post("/api/v1/companies", json={"name": "Second"}, headers=headers).json()

    response = client.patch(
        "/api/v1/agent/companies/bulk",
        json={
            "updates": [
                {"company_id": first["id"], "payload": {"indexed": True}},
                {"company_id": second["id"], "payload": {"overview": "Done"}},
            ]
        },
        headers=agent_headers,
    )

    assert response.status_code == 200
    assert repo.bulk_entries == 1
    assert repo.bulk_exits == 1


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
    assert boot.json()["status"] == ApplicationStatus.company_research_pending.value

    pending = client.get(
        "/api/v1/agent/applications/company-research-pending",
        headers={"X-API-Key": raw_key},
    )
    assert pending.status_code == 200
    assert len(pending.json()) == 1
    pending_application_id = pending.json()[0]["id"]
    assert pending.json()[0]["company_name"] == "Acme Co"
    assert pending.json()[0]["company_website"] == "https://acme.example"
    assert "notes" not in pending.json()[0]
    assert "job_post" not in pending.json()[0]

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
        json={
            "overview": "Enriched by JAA",
            "full_product_detail": "https://drive.google.com/file/d/acme-full-product",
            "full_hiring_detail": "https://drive.google.com/file/d/acme-full-hiring",
            "full_organization_detail": "https://drive.google.com/file/d/acme-full-organization",
        },
        headers={"X-API-Key": raw_key},
    )
    assert upd.status_code == 200
    assert upd.json()["overview"] == "Enriched by JAA"
    assert (
        upd.json()["full_product_detail"] == "https://drive.google.com/file/d/acme-full-product"
    )
    assert (
        upd.json()["full_hiring_detail"] == "https://drive.google.com/file/d/acme-full-hiring"
    )
    assert (
        upd.json()["full_organization_detail"]
        == "https://drive.google.com/file/d/acme-full-organization"
    )

    audit = client.get("/api/v1/audit-events", headers=h)
    assert audit.status_code == 200
    assert any(e["actor_type"] == "agent" for e in audit.json())


def test_preparation_ready_notification() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)

    co = client.post(
        "/api/v1/companies",
        json={"name": "Beta", "indexed": True},
        headers=h,
    ).json()
    application = client.post(
        "/api/v1/applications",
        json={"company_id": co["id"]},
        headers=h,
    ).json()
    assert application["status"] == "ppa_pending"
    app_id = application["id"]

    client.put(
        f"/api/v1/applications/{app_id}",
        json={"status": "application_ready"},
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
        json={"company_id": company["id"], "status": "application_ready"},
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

    marked = client.post(
        f"/api/v1/emails/{email_id}/mark-sent",
        json={"sent": True},
        headers=h,
    )
    assert marked.status_code == 200
    assert marked.json()["sent"] is True
    assert marked.json()["sent_at"] is not None

    unmarked = client.post(
        f"/api/v1/emails/{email_id}/mark-sent",
        json={"sent": False},
        headers=h,
    )
    assert unmarked.status_code == 200
    assert unmarked.json()["sent"] is False
    assert unmarked.json()["sent_at"] is None


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
        json={"company_id": company["id"], "status": "application_ready"},
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
    assert uj[0]["research_status"] == "pending"
    assert set(uj[0]) == {
        "id",
        "name",
        "website",
        "research_status",
        "has_application",
        "created_at",
        "updated_at",
    }
    full_company = client.get(f"/api/v1/agent/companies/{uj[0]['id']}", headers=ak)
    assert full_company.status_code == 200
    assert full_company.json()["id"] == c_old["id"]
    assert full_company.json()["name"] == "Old Co"
    assert full_company.json()["has_application"] is False

    missing_company = client.get("/api/v1/agent/companies/missing-company", headers=ak)
    assert missing_company.status_code == 404

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
    assert bulk.json()[0]["research_status"] == "indexed"
    assert bulk.json()[0]["overview"] == "Done"
    assert bulk.json()[0]["full_product_detail"] is None
    assert bulk.json()[0]["full_hiring_detail"] is None
    assert bulk.json()[0]["full_organization_detail"] is None

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
        json={"company_id": company["id"], "status": "application_ready"},
        headers=h,
    ).json()
    client.post(
        f"/api/v1/applications/{app_sent['id']}/mark-email-sent",
        json={"sent": True},
        headers=h,
    )

    r = client.get(
        "/api/v1/agent/applications?email_sent=true&status_filter=application_ready",
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
        json={"company_id": company["id"], "status": "company_research_pending"},
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
        json={"company_id": company["id"], "status": "application_ready"},
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
        ApplicationCreate(company_id=company["id"], status=ApplicationStatus.application_ready),
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


def test_agent_industries_create_update_bulk_and_search() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa-industries"}, headers=h)
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}

    created = client.post(
        "/api/v1/agent/industries",
        json={"name": "FinTech", "description": "Finance and technology"},
        headers=ak,
    )
    assert created.status_code == 201
    industry_id = created.json()["id"]

    updated = client.put(
        f"/api/v1/agent/industries/{industry_id}",
        json={"description": "Updated desc"},
        headers=ak,
    )
    assert updated.status_code == 200
    assert updated.json()["description"] == "Updated desc"

    bulk = client.post(
        "/api/v1/agent/industries/bulk",
        json={
            "industries": [
                {"name": "HealthTech", "description": "Healthcare"},
                {"name": "EdTech", "description": "Education"},
            ]
        },
        headers=ak,
    )
    assert bulk.status_code == 201
    assert {row["name"] for row in bulk.json()} == {"HealthTech", "EdTech"}

    listed = client.get("/api/v1/agent/industries?search=tech&limit=2&skip=0", headers=ak)
    assert listed.status_code == 200
    assert len(listed.json()) == 2
    assert all("tech" in row["name"].lower() for row in listed.json())

    duplicate_in_bulk = client.post(
        "/api/v1/agent/industries/bulk",
        json={"industries": [{"name": "Retail"}, {"name": "retail"}]},
        headers=ak,
    )
    assert duplicate_in_bulk.status_code == 400
    assert duplicate_in_bulk.json()["detail"] == "Duplicate industry names in request: retail"

    duplicate_existing = client.post(
        "/api/v1/agent/industries/bulk",
        json={"industries": [{"name": "fintech"}]},
        headers=ak,
    )
    assert duplicate_existing.status_code == 400
    assert duplicate_existing.json()["detail"] == "Industry names already exist: fintech"


def test_agent_profile_endpoints_exclude_frozen_profiles() -> None:
    repo = InMemoryRepository()
    app.dependency_overrides[get_repository] = lambda: repo
    client = TestClient(app)
    token = _register_admin(client)
    h = _headers(token)
    key_resp = client.post("/api/v1/admin/agent-keys", json={"name": "jaa-freeze-filter"}, headers=h)
    raw_key = key_resp.json()["raw_key"]
    ak = {"X-API-Key": raw_key}

    active = client.post(
        "/api/v1/profiles",
        json={
            "name": "Active Profile",
            "location": "Remote",
            "email": "active@example.com",
            "phone": "+10000000011",
            "educations": [{"university_name": "U", "from_year": 2020, "to_year": 2024}],
            "bio_md": "Active",
            "niche_info_md": "Active niche",
        },
        headers=h,
    ).json()
    frozen = client.post(
        "/api/v1/profiles",
        json={
            "name": "Frozen Profile",
            "location": "Remote",
            "email": "frozen@example.com",
            "phone": "+10000000012",
            "educations": [{"university_name": "U", "from_year": 2020, "to_year": 2024}],
            "bio_md": "Frozen",
            "niche_info_md": "Frozen niche",
        },
        headers=h,
    ).json()
    freeze_resp = client.put(
        f"/api/v1/profiles/{frozen['id']}",
        json={"frozen": True},
        headers=h,
    )
    assert freeze_resp.status_code == 200
    assert freeze_resp.json()["frozen"] is True

    ids = client.get("/api/v1/agent/profiles/ids", headers=ak)
    assert ids.status_code == 200
    assert active["id"] in ids.json()["profile_ids"]
    assert frozen["id"] not in ids.json()["profile_ids"]

    all_profiles = client.get("/api/v1/agent/profiles", headers=ak)
    assert all_profiles.status_code == 200
    rows = all_profiles.json()
    assert any(row["id"] == active["id"] for row in rows)
    assert not any(row["id"] == frozen["id"] for row in rows)

    frozen_lookup = client.get(f"/api/v1/agent/profiles/{frozen['id']}", headers=ak)
    assert frozen_lookup.status_code == 404
    assert frozen_lookup.json()["detail"] == "Profile not found"

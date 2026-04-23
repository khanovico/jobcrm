from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from app.auth import hash_password
from app.models import (
    ApplicationCreate,
    ApplicationStatus,
    ApplicationUpdate,
    ColdEmailPlan,
    ColdEmailPlanStatus,
    ColdEmailRecipient,
    CompanyCreate,
    CompanyResearchStatus,
    EmailCreate,
    EmailKind,
    EmailLifecycleStatus,
    IndustryCreate,
    JobPost,
    NotificationKind,
    NotificationPayload,
    NotificationSeverity,
    PerProfileApplicationCreate,
    ProfileCreate,
    ProfileUpdate,
    UserCreate,
    UserNotification,
    UserRole,
    WorkMode,
)
from app.repository import BaseRepository


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _maybe_sync(repo: BaseRepository) -> None:
    sync = getattr(repo, "_sync", None)
    if callable(sync):
        sync()


def _set_notification_link(
    repo: BaseRepository,
    *,
    notification_id: str,
    link: str | None,
) -> UserNotification | None:
    notifications = getattr(repo, "notifications", None)
    if not isinstance(notifications, dict):
        return None
    note = notifications.get(notification_id)
    if note is None:
        return None
    updated = note.model_copy(update={"link": link})
    notifications[notification_id] = updated
    _maybe_sync(repo)
    return updated


def _create_notification(
    repo: BaseRepository,
    *,
    user_id: str,
    notification: NotificationKind,
    notification_type: NotificationSeverity,
    message: str,
    entity_id: str | None = None,
    link: str | None = None,
    mark_read: bool = False,
    check: bool = False,
) -> UserNotification:
    note = repo.create_notification(
        user_id=user_id,
        notification=notification,
        notification_type=notification_type,
        payload=NotificationPayload(id=entity_id, message=message),
        timestamp=_now(),
        check=check,
    )
    if link:
        linked = _set_notification_link(repo, notification_id=note.id, link=link)
        if linked is not None:
            note = linked
    if mark_read:
        marked = repo.mark_notification_read(user_id, note.id)
        if marked is not None:
            note = marked
    return note


def _ensure_user(
    repo: BaseRepository,
    *,
    email: str,
    password: str,
    name: str,
    role: UserRole = UserRole.admin,
) -> tuple[str, bool]:
    existing = repo.get_user_by_email(email)
    if existing is not None:
        return existing.id, False
    created = repo.create_user(
        UserCreate(
            name=name,
            email=email,
            password=password,
            role=role,
        ),
        hash_password(password),
    )
    return created.id, True


def _ensure_industry(
    repo: BaseRepository,
    *,
    name: str,
    description: str,
) -> str:
    existing = next((row for row in repo.list_industries(0, 500, None) if row.name == name), None)
    if existing is not None:
        return existing.id
    created = repo.create_industry(IndustryCreate(name=name, description=description))
    return created.id


def _status_counts(repo: BaseRepository) -> dict[str, int]:
    applications = getattr(repo, "applications", {})
    return dict(sorted(Counter(app.status.value for app in applications.values()).items()))


def _email_counts(repo: BaseRepository) -> dict[str, int]:
    emails = getattr(repo, "emails", {})
    return dict(sorted(Counter(email.lifecycle_status.value for email in emails.values()).items()))


@dataclass(frozen=True)
class SeedRichDummyResult:
    company_id: str
    application_id: str
    profile_ids: list[str]
    per_profile_application_ids: list[str]
    email_ids: list[str]
    company_name: str


@dataclass(frozen=True)
class SeedMultiPpaSingleReadyResult:
    """One application with 3 PPAs; only `ready_profile_name` should appear in `applied_profiles` on the list API."""

    company_id: str
    application_id: str
    company_name: str
    not_ready_profile_names: tuple[str, ...]
    ready_profile_name: str
    ready_artifact: Literal["resume", "email"]
    per_profile_application_ids: tuple[str, ...]
    email_id_if_any: str | None


@dataclass(frozen=True)
class SeedLocalDevDatasetResult:
    user_id: str
    user_email: str
    user_password: str | None
    user_created: bool
    industry_ids: list[str]
    company_ids: list[str]
    profile_ids: list[str]
    frozen_profile_ids: list[str]
    application_ids: list[str]
    per_profile_application_ids: list[str]
    email_ids: list[str]
    notification_ids: list[str]
    highlight_company_id: str
    highlight_application_id: str
    application_status_counts: dict[str, int]
    email_lifecycle_counts: dict[str, int]


def seed_multi_ppa_single_ready_profile_demo(
    repo: BaseRepository,
    *,
    label: str = "applied-col-demo",
    ready_artifact: Literal["resume", "email"] = "resume",
) -> SeedMultiPpaSingleReadyResult:
    """
    For manual QA of the Applications table **Applied profiles** column.

    Inserts one company, one application, three profiles, and three PPAs. Two PPAs are
    analysis-only (not listable). Exactly one PPA has either a tailored resume link or a
    substantive email draft—so the list API should return a single `applied_profiles` chip.
    """
    ts = _now().strftime("%Y%m%d-%H%M%S")
    suffix = f"[{label}] {ts}"
    company_name = f"Applied col demo {suffix}"
    company = repo.create_company(
        CompanyCreate(name=company_name, research_status=CompanyResearchStatus.indexed)
    )

    application = repo.create_application(
        ApplicationCreate(
            company_id=company.id,
            status=ApplicationStatus.application_ready,
            notes="QA: 3 PPAs; only the third has resume or email prep.",
        ),
        created_by_user_id=None,
    )

    names = (
        f"Alpha Stub Only {suffix}",
        f"Beta Stub Only {suffix}",
        f"Gamma Ready {suffix}",
    )
    profile_payloads = [
        ProfileCreate(
            name=names[0],
            location="Austin, TX",
            email="alpha.stub@example.com",
            phone="+1-512-555-0001",
            educations=[{"university_name": "UT", "from_year": 2015, "to_year": 2019}],
            bio_md="Stub profile for QA.",
            niche_info_md="N/A",
        ),
        ProfileCreate(
            name=names[1],
            location="Austin, TX",
            email="beta.stub@example.com",
            phone="+1-512-555-0002",
            educations=[{"university_name": "UT", "from_year": 2015, "to_year": 2019}],
            bio_md="Stub profile for QA.",
            niche_info_md="N/A",
        ),
        ProfileCreate(
            name=names[2],
            location="Austin, TX",
            email="gamma.ready@example.com",
            phone="+1-512-555-0003",
            educations=[{"university_name": "UT", "from_year": 2015, "to_year": 2019}],
            bio_md="This row should be the only applied-profile chip.",
            niche_info_md="N/A",
        ),
    ]
    profiles = [repo.create_profile(p) for p in profile_payloads]

    ppa0 = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=application.id,
            profile_id=profiles[0].id,
            order_index=0,
            fit_score=70.0,
            analysis="PPA 0: analysis only (no resume, no email plan, no email draft).",
        )
    )
    ppa1 = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=application.id,
            profile_id=profiles[1].id,
            order_index=1,
            fit_score=72.0,
            analysis="PPA 1: analysis only (not listable on applications table).",
        )
    )

    if ready_artifact == "resume":
        ppa2 = repo.create_per_profile_application(
            PerProfileApplicationCreate(
                application_id=application.id,
                profile_id=profiles[2].id,
                order_index=2,
                fit_score=90.0,
                analysis="PPA 2: the only PPA with a tailored resume link.",
                tailored_resume_link="https://files.example.com/demo/gamma-ready-resume.pdf",
            )
        )
        email_id: str | None = None
    else:
        ppa2 = repo.create_per_profile_application(
            PerProfileApplicationCreate(
                application_id=application.id,
                profile_id=profiles[2].id,
                order_index=2,
                fit_score=90.0,
                analysis="PPA 2: the only PPA with an email draft (no tailored resume).",
            )
        )
        em = repo.create_email(
            EmailCreate(
                per_profile_application_id=ppa2.id,
                kind=EmailKind.cold,
                content="<p>Hi — this is the only substantive email draft for this application.</p>",
                lifecycle_status=EmailLifecycleStatus.drafted,
                sent=False,
            )
        )
        email_id = em.id

    fin = repo.get_application(application.id)
    if fin:
        n = (fin.notes or "").rstrip()
        _ = repo.update_application(application.id, ApplicationUpdate(notes=(n + " ") if n else "QA row"))

    return SeedMultiPpaSingleReadyResult(
        company_id=company.id,
        application_id=application.id,
        company_name=company_name,
        not_ready_profile_names=(names[0], names[1]),
        ready_profile_name=names[2],
        ready_artifact=ready_artifact,
        per_profile_application_ids=(ppa0.id, ppa1.id, ppa2.id),
        email_id_if_any=email_id,
    )


def seed_rich_dummy_application(
    repo: BaseRepository,
    *,
    label: str = "manual",
) -> SeedRichDummyResult:
    suffix = f"[{label}]"
    timestamp = _now().strftime("%Y%m%d-%H%M%S")
    company_name = f"Nebula Systems {suffix} {timestamp}"

    company = repo.create_company(
        CompanyCreate(
            name=company_name,
            research_status=CompanyResearchStatus.indexed,
            website="https://nebula-systems.example.com",
            linkedin="https://www.linkedin.com/company/nebula-systems",
            hq_locations=["San Francisco, CA", "Remote (US)"],
            employee_count_text="201-500 employees",
            actively_hiring=True,
            work_mode=WorkMode.hybrid,
            work_mode_description="Hybrid: 2 days onsite, flexible async collaboration",
            overview="Developer infrastructure platform for AI-native products.",
            full_product_detail=(
                "Nebula Systems builds developer productivity tooling for enterprise AI teams, "
                "including observability, release automation, and secure data workflows."
            ),
            analysis_links=[
                {
                    "topic": "Engineering Blog",
                    "link": "https://nebula-systems.example.com/blog",
                },
                {
                    "topic": "Recent Funding Note",
                    "link": "https://news.example.com/nebula-series-b",
                },
            ],
            enrichment_source_links=[
                "https://nebula-systems.example.com/about",
                "https://www.linkedin.com/company/nebula-systems",
            ],
        )
    )

    application = repo.create_application(
        ApplicationCreate(
            company_id=company.id,
            status=ApplicationStatus.application_ready,
            notes=(
                "Strong fit for full-stack/productivity role. "
                "Prepared multi-profile outreach with tailored collateral."
            ),
            job_post=JobPost(
                job_link="https://jobs.example.com/nebula/staff-fullstack-engineer",
                job_description=(
                    "Own full-stack features across React, APIs, and data pipeline integrations."
                ),
            ),
        ),
        created_by_user_id=None,
    )
    repo.mark_application_email_sent(application.id, True)

    profile_payloads = [
        ProfileCreate(
            name=f"Alex Product Engineer {suffix}",
            location="San Francisco, CA",
            email="alex.product@example.com",
            phone="+1-415-555-0101",
            educations=[{"university_name": "Stanford University", "from_year": 2014, "to_year": 2018}],
            bio_md="Product-minded full-stack engineer focused on shipping customer value.",
            niche_info_md="B2B SaaS onboarding, analytics, and experimentation systems.",
            resume_md="Experience building React/FastAPI systems and scaling API reliability.",
        ),
        ProfileCreate(
            name=f"Jordan Platform Engineer {suffix}",
            location="Seattle, WA",
            email="jordan.platform@example.com",
            phone="+1-206-555-0129",
            educations=[{"university_name": "University of Washington", "from_year": 2012, "to_year": 2016}],
            bio_md="Platform and reliability engineer with strong backend ownership.",
            niche_info_md="Distributed systems, CI/CD modernization, and incident response.",
            resume_md="Led migration from monolith deployment to progressive delivery pipelines.",
        ),
        ProfileCreate(
            name=f"Riley AI Integrations Engineer {suffix}",
            location="Austin, TX",
            email="riley.ai@example.com",
            phone="+1-512-555-0188",
            educations=[{"university_name": "UT Austin", "from_year": 2015, "to_year": 2019}],
            bio_md="Engineer focused on AI features, evaluation, and production safety.",
            niche_info_md="LLM prompt pipelines, grounding, and quality evaluation loops.",
            resume_md="Built internal AI copilot and retrieval pipelines for support tooling.",
        ),
    ]
    profiles = [repo.create_profile(payload) for payload in profile_payloads]

    ppa_payloads = [
        PerProfileApplicationCreate(
            application_id=application.id,
            profile_id=profiles[0].id,
            order_index=1,
            fit_score=92,
            analysis=(
                "Best overall fit for user-facing product velocity and cross-team collaboration. "
                "Most aligned with role ownership expectations."
            ),
            tailored_resume_link="https://files.example.com/resumes/alex-nebula-tailored.pdf",
            cold_email_plan=ColdEmailPlan(
                subjects=[
                    "Helping Nebula ship developer experience faster",
                    "Ideas for onboarding + activation at Nebula",
                    "Quick intro: full-stack partner for your roadmap",
                ],
                selected_subject_index=1,
                to=ColdEmailRecipient(
                    title="Hiring Manager",
                    name="Casey Nguyen",
                    email="casey.nguyen@nebula-systems.example.com",
                    timezone="America/Los_Angeles",
                ),
                status=ColdEmailPlanStatus.received,
            ),
            applied=False,
        ),
        PerProfileApplicationCreate(
            application_id=application.id,
            profile_id=profiles[1].id,
            order_index=2,
            fit_score=87,
            analysis=(
                "Strong platform and reliability perspective; useful as an alternate angle for "
                "backend-heavy parts of the role."
            ),
            tailored_resume_link="https://files.example.com/resumes/jordan-nebula-tailored.pdf",
            cold_email_plan=ColdEmailPlan(
                subjects=[
                    "Platform reliability wins I can bring to Nebula",
                    "Improving deployment confidence for your engineering org",
                ],
                selected_subject_index=0,
                to=ColdEmailRecipient(
                    title="Director of Engineering",
                    name="Morgan Lee",
                    email="morgan.lee@nebula-systems.example.com",
                    timezone="America/New_York",
                ),
                status=ColdEmailPlanStatus.received,
            ),
            applied=False,
        ),
        PerProfileApplicationCreate(
            application_id=application.id,
            profile_id=profiles[2].id,
            order_index=3,
            fit_score=84,
            analysis=(
                "Great option for AI-feature strategy and technical discovery conversations. "
                "Good complement for experimentation-heavy roadmap themes."
            ),
            tailored_resume_link="https://files.example.com/resumes/riley-nebula-tailored.pdf",
            cold_email_plan=ColdEmailPlan(
                subjects=[
                    "Shipping AI features with measurable quality",
                    "How I operationalize LLM evaluations in production",
                ],
                selected_subject_index=0,
                to=ColdEmailRecipient(
                    title="AI Product Lead",
                    name="Taylor Brooks",
                    email="taylor.brooks@nebula-systems.example.com",
                    timezone="Europe/London",
                ),
                status=ColdEmailPlanStatus.received,
            ),
            applied=False,
        ),
    ]
    ppas = [repo.create_per_profile_application(payload) for payload in ppa_payloads]

    email_payloads = [
        EmailCreate(
            per_profile_application_id=ppas[0].id,
            kind=EmailKind.cold,
            content=(
                "<p>Hi Casey,</p>"
                "<p>I loved the Nebula posting and your focus on fast developer workflows.</p>"
                "<p>Over the last 4 years I shipped React + FastAPI features that cut onboarding "
                "friction by 31% and improved trial-to-paid conversion.</p>"
                "<p>If useful, I can share a short 30-60-90 outline tailored to this role.</p>"
                "<p>Best,<br/>Alex</p>"
            ),
            lifecycle_status=EmailLifecycleStatus.sent,
            sent=True,
            sent_at=_now(),
        ),
        EmailCreate(
            per_profile_application_id=ppas[0].id,
            kind=EmailKind.follow_up,
            content=(
                "<p>Hi Casey, just following up with a concise idea:</p>"
                "<ul><li>Map first-run developer pain points</li>"
                "<li>Ship guided templates for the top 2 personas</li>"
                "<li>Instrument activation events with weekly review</li></ul>"
                "<p>Happy to discuss if this is aligned.</p>"
            ),
            lifecycle_status=EmailLifecycleStatus.drafted,
            sent=False,
        ),
        EmailCreate(
            per_profile_application_id=ppas[1].id,
            kind=EmailKind.cold,
            content=(
                "<p>Hi Morgan,</p>"
                "<p>I’m reaching out because Nebula’s stack and reliability goals are a strong match "
                "for my platform background.</p>"
                "<p>I recently led release safety improvements that reduced rollback incidents by 45%.</p>"
                "<p>Would love to connect for a quick intro.</p>"
            ),
            lifecycle_status=EmailLifecycleStatus.sent,
            sent=True,
            sent_at=_now(),
        ),
        EmailCreate(
            per_profile_application_id=ppas[2].id,
            kind=EmailKind.cold,
            content=(
                "<p>Hi Taylor,</p>"
                "<p>I help teams ship LLM features with practical eval loops and guardrails.</p>"
                "<p>At my current role, we introduced retrieval quality checks and reduced "
                "hallucination-related tickets by 38%.</p>"
                "<p>If helpful, I can send an eval rubric template.</p>"
            ),
            lifecycle_status=EmailLifecycleStatus.drafted,
            sent=False,
        ),
    ]
    emails = [repo.create_email(payload) for payload in email_payloads]

    return SeedRichDummyResult(
        company_id=company.id,
        application_id=application.id,
        profile_ids=[p.id for p in profiles],
        per_profile_application_ids=[p.id for p in ppas],
        email_ids=[e.id for e in emails],
        company_name=company.name,
    )


def seed_local_dev_dataset(
    repo: BaseRepository,
    *,
    label: str = "local-dev",
    user_email: str = "local-dev-admin@example.com",
    user_password: str = "local-dev-pass123",
) -> SeedLocalDevDatasetResult:
    timestamp = _now().strftime("%Y%m%d-%H%M%S")
    suffix = f"[{label}] {timestamp}"

    user_id, user_created = _ensure_user(
        repo,
        email=user_email,
        password=user_password,
        name="Local Dev Admin",
        role=UserRole.admin,
    )

    industry_ids = [
        _ensure_industry(repo, name="AI Infrastructure", description="Inference, evals, and model operations."),
        _ensure_industry(repo, name="Developer Tools", description="Tooling for engineers and platform teams."),
        _ensure_industry(repo, name="Fintech", description="Payments, risk, and internal finance systems."),
        _ensure_industry(repo, name="Healthtech", description="Clinical operations and patient workflow software."),
    ]

    shared_profiles = [
        repo.create_profile(
            ProfileCreate(
                name=f"Avery Full Stack {suffix}",
                location="San Francisco, CA",
                email="avery.fullstack@example.com",
                phone="+1-415-555-0150",
                educations=[{"university_name": "UCLA", "from_year": 2013, "to_year": 2017}],
                bio_md="Ships across product, frontend, and API layers.",
                niche_info_md="Activation, onboarding, and internal tooling.",
                resume_md="Built React and Python systems for operations-heavy SaaS teams.",
            )
        ),
        repo.create_profile(
            ProfileCreate(
                name=f"Priya Platform {suffix}",
                location="Seattle, WA",
                email="priya.platform@example.com",
                phone="+1-206-555-0177",
                educations=[{"university_name": "Georgia Tech", "from_year": 2011, "to_year": 2015}],
                bio_md="Platform-minded engineer focused on reliability and delivery speed.",
                niche_info_md="CI/CD, observability, and backend modernization.",
                resume_md="Led release automation, observability, and incident reduction programs.",
            )
        ),
        repo.create_profile(
            ProfileCreate(
                name=f"Noah AI Ops {suffix}",
                location="Austin, TX",
                email="noah.aiops@example.com",
                phone="+1-512-555-0118",
                educations=[{"university_name": "Rice University", "from_year": 2014, "to_year": 2018}],
                bio_md="Works on AI productization, eval loops, and operational guardrails.",
                niche_info_md="LLM quality, prompt pipelines, and knowledge systems.",
                resume_md="Delivered retrieval + eval tooling for internal AI assistants.",
            )
        ),
        repo.create_profile(
            ProfileCreate(
                name=f"Lee Frozen {suffix}",
                location="Denver, CO",
                email="lee.frozen@example.com",
                phone="+1-303-555-0199",
                educations=[{"university_name": "CU Boulder", "from_year": 2010, "to_year": 2014}],
                bio_md="Older resume snapshot kept for regression checks.",
                niche_info_md="Legacy enterprise support and reporting flows.",
                resume_md="Previous generation profile retained for comparison.",
            )
        ),
    ]
    frozen_profile = repo.update_profile(
        shared_profiles[3].id,
        ProfileUpdate(frozen=True),
    ) or shared_profiles[3]

    company_pending = repo.create_company(
        CompanyCreate(
            name=f"Northstar Robotics {suffix}",
            research_status=CompanyResearchStatus.pending,
            website="https://northstar-robotics.example.com",
            industry_ids=[industry_ids[1]],
            hq_locations=["Chicago, IL"],
            actively_hiring=True,
            work_mode=WorkMode.onsite,
            work_mode_description="Hardware lab collaboration 4 days onsite.",
        )
    )
    company_indexing = repo.create_company(
        CompanyCreate(
            name=f"Harbor Health Cloud {suffix}",
            research_status=CompanyResearchStatus.indexing,
            website="https://harbor-health.example.com",
            linkedin="https://www.linkedin.com/company/harbor-health-cloud",
            industry_ids=[industry_ids[3]],
            hq_locations=["Boston, MA", "Remote (US)"],
            actively_hiring=True,
            work_mode=WorkMode.hybrid,
            work_mode_description="Hybrid product and data teams.",
            overview="Care operations platform with ongoing market research.",
        )
    )
    company_portfolio = repo.create_company(
        CompanyCreate(
            name=f"Orbit Ledger {suffix}",
            research_status=CompanyResearchStatus.indexed,
            website="https://orbit-ledger.example.com",
            linkedin="https://www.linkedin.com/company/orbit-ledger",
            industry_ids=[industry_ids[0], industry_ids[2]],
            hq_locations=["New York, NY", "Remote (US)"],
            employee_count_text="51-200 employees",
            actively_hiring=True,
            work_mode=WorkMode.remote_us,
            work_mode_description="Remote-first in US time zones.",
            overview="Finance operations platform for AI-native companies.",
            full_product_detail="Combines ledger workflows, approvals, and audit-safe automation.",
            full_hiring_detail="Hiring across product engineering, platform, and internal AI tooling.",
            full_organization_detail="Small engineering org with product squads and platform shared services.",
            analysis_links=[
                {"topic": "Product Overview", "link": "https://orbit-ledger.example.com/product"},
                {"topic": "Security Note", "link": "https://orbit-ledger.example.com/security"},
            ],
            enrichment_source_links=[
                "https://orbit-ledger.example.com/about",
                "https://www.linkedin.com/company/orbit-ledger",
            ],
        )
    )
    company_applied = repo.create_company(
        CompanyCreate(
            name=f"Signal Forge {suffix}",
            research_status=CompanyResearchStatus.indexed,
            website="https://signal-forge.example.com",
            industry_ids=[industry_ids[1]],
            hq_locations=["Remote (Global)"],
            actively_hiring=True,
            work_mode=WorkMode.remote_global,
            work_mode_description="Distributed engineering org with async communication.",
            overview="Developer productivity studio for technical teams.",
            full_product_detail="Builds workflow tooling, docs automation, and release visibility products.",
        )
    )
    company_invalid = repo.create_company(
        CompanyCreate(
            name=f"Closed Loop Careers {suffix}",
            research_status=CompanyResearchStatus.invalid,
            website="https://closed-loop-careers.example.com",
            industry_ids=[industry_ids[2]],
            hq_locations=["Miami, FL"],
            overview="Role is no longer viable for outreach; kept for invalid-state QA.",
        )
    )
    company_archived = repo.create_company(
        CompanyCreate(
            name=f"Archive Works {suffix}",
            research_status=CompanyResearchStatus.indexed,
            website="https://archive-works.example.com",
            industry_ids=[industry_ids[1]],
            hq_locations=["Portland, OR"],
            actively_hiring=False,
            work_mode=WorkMode.other,
            work_mode_description="Former target; archived for historical visibility.",
        )
    )

    app_pending = repo.create_application(
        ApplicationCreate(
            company_id=company_pending.id,
            status=ApplicationStatus.company_research_pending,
            notes="Minimal input row for quick-create and pending research checks.",
        ),
        created_by_user_id=user_id,
    )
    app_researching = repo.create_application(
        ApplicationCreate(
            company_id=company_indexing.id,
            status=ApplicationStatus.company_researching,
            notes="Research is underway; company enrichment still incomplete.",
            job_post=JobPost(
                job_link="https://jobs.example.com/harbor/senior-product-engineer",
                job_description="Own patient-ops workflow UI and backend integrations.",
            ),
        ),
        created_by_user_id=user_id,
    )
    app_ppa_pending = repo.create_application(
        ApplicationCreate(
            company_id=company_portfolio.id,
            status=ApplicationStatus.company_research_pending,
            notes="Company is indexed, so new app starts in PPA pending.",
        ),
        created_by_user_id=user_id,
    )
    ppa_pending_row = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=app_ppa_pending.id,
            profile_id=shared_profiles[1].id,
            order_index=0,
            fit_score=76,
            analysis="Platform profile looks promising; waiting on deeper analysis.",
        )
    )

    app_ppa_analyzing = repo.create_application(
        ApplicationCreate(
            company_id=company_portfolio.id,
            status=ApplicationStatus.ppa_analyzing,
            notes="Multiple profiles being scored.",
            job_post=JobPost(
                job_link="https://jobs.example.com/orbit/staff-platform-engineer",
                job_description="Lead reliability and engineering systems work.",
            ),
        ),
        created_by_user_id=user_id,
    )
    ppa_analyzing_row = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=app_ppa_analyzing.id,
            profile_id=shared_profiles[2].id,
            order_index=0,
            fit_score=64,
            analysis="AI ops profile is viable but still under comparison against platform-heavy resumes.",
            cold_email_plan=ColdEmailPlan(
                subjects=["Orbit Ledger research in progress"],
                selected_subject_index=0,
                status=ColdEmailPlanStatus.down,
            ),
        )
    )

    app_application_pending = repo.create_application(
        ApplicationCreate(
            company_id=company_portfolio.id,
            status=ApplicationStatus.application_pending,
            notes="Profile selected; artifacts not started yet.",
            job_post=JobPost(
                job_link="https://jobs.example.com/orbit/product-engineer",
                job_description="Drive dashboard and operations features end to end.",
            ),
        ),
        created_by_user_id=user_id,
    )
    ppa_application_pending_row = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=app_application_pending.id,
            profile_id=shared_profiles[0].id,
            order_index=0,
            fit_score=89,
            analysis="Best fit for product-leaning engineering work.",
            cold_email_plan=ColdEmailPlan(
                subjects=["Ready when drafting opens"],
                selected_subject_index=0,
                to=ColdEmailRecipient(
                    title="Engineering Manager",
                    name="Dana Sato",
                    email=None,
                    timezone="America/Los_Angeles",
                ),
                status=ColdEmailPlanStatus.none,
            ),
        )
    )

    app_application_drafting = repo.create_application(
        ApplicationCreate(
            company_id=company_portfolio.id,
            status=ApplicationStatus.application_drafting,
            notes="Drafting in progress with a failed outreach attempt captured below.",
        ),
        created_by_user_id=user_id,
    )
    ppa_application_drafting_row = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=app_application_drafting.id,
            profile_id=shared_profiles[2].id,
            order_index=0,
            fit_score=81,
            analysis="AI ops background useful for internal copilots and workflow automation.",
            cold_email_plan=ColdEmailPlan(
                subjects=["Follow-up once drafting service recovers"],
                selected_subject_index=0,
                to=ColdEmailRecipient(
                    title="VP Product",
                    name="Robin Fields",
                    email="robin.fields@orbit-ledger.example.com",
                    timezone=None,
                ),
                status=ColdEmailPlanStatus.timed_out,
            ),
        )
    )
    drafting_failed_email = repo.create_email(
        EmailCreate(
            per_profile_application_id=ppa_application_drafting_row.id,
            kind=EmailKind.cold,
            content="<p>Draft generation failed after partial enrichment.</p>",
            lifecycle_status=EmailLifecycleStatus.failed,
            sent=False,
        )
    )

    rich = seed_rich_dummy_application(repo, label=f"{label}-rich")
    multi = seed_multi_ppa_single_ready_profile_demo(
        repo,
        label=f"{label}-list-filter",
        ready_artifact="email",
    )

    applied_app = repo.create_application(
        ApplicationCreate(
            company_id=company_applied.id,
            status=ApplicationStatus.application_ready,
            notes="Applied scenario with sent outreach and reply trail.",
            job_post=JobPost(
                job_link="https://jobs.example.com/signal-forge/staff-full-stack",
                job_description="Ship workflow tooling and internal platform features.",
            ),
        ),
        created_by_user_id=user_id,
    )
    applied_ppa_primary = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=applied_app.id,
            profile_id=shared_profiles[0].id,
            order_index=0,
            fit_score=94,
            analysis="Primary match with strong product + execution depth.",
            tailored_resume_link="https://files.example.com/resumes/avery-signal-forge-tailored.pdf",
            cold_email_plan=ColdEmailPlan(
                subjects=[
                    "Helping Signal Forge speed up engineering workflows",
                    "Full-stack partner for docs and release tooling",
                ],
                selected_subject_index=0,
                to=ColdEmailRecipient(
                    title="Founder",
                    name="Jamie Ortiz",
                    email="jamie.ortiz@signal-forge.example.com",
                    timezone="America/Chicago",
                ),
                status=ColdEmailPlanStatus.received,
            ),
        )
    )
    applied_ppa_secondary = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=applied_app.id,
            profile_id=shared_profiles[1].id,
            order_index=1,
            fit_score=83,
            analysis="Strong alternate angle for reliability-heavy discussion.",
        )
    )
    applied_emails = [
        repo.create_email(
            EmailCreate(
                per_profile_application_id=applied_ppa_primary.id,
                kind=EmailKind.cold,
                content="<p>Hi Jamie, sharing a quick intro and tailored background.</p>",
                lifecycle_status=EmailLifecycleStatus.sent,
                sent=True,
                sent_at=_now(),
            )
        ),
        repo.create_email(
            EmailCreate(
                per_profile_application_id=applied_ppa_primary.id,
                kind=EmailKind.follow_up,
                content="<p>Thanks for the reply. Happy to send a 30-60-90 outline.</p>",
                lifecycle_status=EmailLifecycleStatus.received,
                sent=False,
            )
        ),
        repo.create_email(
            EmailCreate(
                per_profile_application_id=applied_ppa_primary.id,
                kind=EmailKind.follow_up,
                content="<p>Holding this follow-up as timed out after one week.</p>",
                lifecycle_status=EmailLifecycleStatus.timed_out,
                sent=False,
            )
        ),
    ]
    repo.mark_application_email_sent(applied_app.id, True)
    repo.mark_application_applied(applied_app.id, True)

    invalid_app = repo.create_application(
        ApplicationCreate(
            company_id=company_invalid.id,
            status=ApplicationStatus.company_research_pending,
            notes="Invalid-state scenario for closed or misfit opportunities.",
        ),
        created_by_user_id=user_id,
    )

    archived_app = repo.create_application(
        ApplicationCreate(
            company_id=company_archived.id,
            status=ApplicationStatus.application_ready,
            notes="Archive path scenario.",
        ),
        created_by_user_id=user_id,
    )
    archived_ppa = repo.create_per_profile_application(
        PerProfileApplicationCreate(
            application_id=archived_app.id,
            profile_id=frozen_profile.id,
            order_index=0,
            fit_score=58,
            analysis="Legacy profile attached for archive and frozen-profile QA.",
            cold_email_plan=ColdEmailPlan(
                subjects=["Archived historical outreach"],
                selected_subject_index=0,
                status=ColdEmailPlanStatus.none,
            ),
        )
    )
    repo.archive_company(company_archived.id, "Local dummy archive scenario")

    notifications = [
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.APPLICATION_UPDATE,
            notification_type=NotificationSeverity.SUCCESS,
            entity_id=rich.application_id,
            link=f"/applications/{rich.application_id}",
            message="Preparation ready: rich dummy application is ready for review.",
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.FOLLOW_UP_DRAFT,
            notification_type=NotificationSeverity.WARN,
            entity_id=applied_app.id,
            link=f"/applications/{applied_app.id}",
            message="Follow-up draft available for the applied Signal Forge scenario.",
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.COMPANY_UPDATE,
            notification_type=NotificationSeverity.SUCCESS,
            entity_id=company_portfolio.id,
            link=f"/companies/{company_portfolio.id}",
            message="Orbit Ledger enrichment refreshed with hiring and product notes.",
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.SYSTEM_ERROR,
            notification_type=NotificationSeverity.FAILED,
            message="Drafting worker hit a transient error for one application draft.",
            mark_read=True,
            check=True,
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.APPLICATION_UPDATE,
            notification_type=NotificationSeverity.SUCCESS,
            entity_id=multi.application_id,
            link=f"/applications/{multi.application_id}",
            message="Applied-profile list demo created with multi-PPA coverage.",
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.COMPANY_UPDATE,
            notification_type=NotificationSeverity.WARN,
            entity_id=company_invalid.id,
            link=f"/companies/{company_invalid.id}",
            message="Closed Loop Careers marked invalid for further work.",
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.APPLICATION_UPDATE,
            notification_type=NotificationSeverity.WARN,
            entity_id=app_researching.id,
            link=f"/applications/{app_researching.id}",
            message="Company research still running for Harbor Health Cloud.",
            mark_read=True,
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.FOLLOW_UP_DRAFT,
            notification_type=NotificationSeverity.SUCCESS,
            entity_id=rich.application_id,
            link=f"/applications/{rich.application_id}",
            message="Nebula follow-up draft staged for detail-page review.",
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.COMPANY_UPDATE,
            notification_type=NotificationSeverity.SUCCESS,
            entity_id=company_pending.id,
            link=f"/companies/{company_pending.id}",
            message="Northstar Robotics company shell created from quick-add flow.",
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.SYSTEM_ERROR,
            notification_type=NotificationSeverity.WARN,
            message="One external lookup timed out; retry later if needed.",
        ),
        _create_notification(
            repo,
            user_id=user_id,
            notification=NotificationKind.APPLICATION_UPDATE,
            notification_type=NotificationSeverity.SUCCESS,
            entity_id=applied_app.id,
            link=f"/applications/{applied_app.id}",
            message="Applied scenario includes sent outreach and reply trail.",
        ),
    ]

    application_ids = [
        app_pending.id,
        app_researching.id,
        app_ppa_pending.id,
        app_ppa_analyzing.id,
        app_application_pending.id,
        app_application_drafting.id,
        rich.application_id,
        multi.application_id,
        applied_app.id,
        invalid_app.id,
        archived_app.id,
    ]
    per_profile_application_ids = [
        ppa_pending_row.id,
        ppa_analyzing_row.id,
        ppa_application_pending_row.id,
        ppa_application_drafting_row.id,
        *rich.per_profile_application_ids,
        *multi.per_profile_application_ids,
        applied_ppa_primary.id,
        applied_ppa_secondary.id,
        archived_ppa.id,
    ]
    multi_profile_ids = [
        repo.per_profile_applications[ppa_id].profile_id for ppa_id in multi.per_profile_application_ids
    ]
    email_ids = [
        drafting_failed_email.id,
        *rich.email_ids,
        *([multi.email_id_if_any] if multi.email_id_if_any else []),
        *(email.id for email in applied_emails),
    ]

    password_for_result = user_password if user_created else None

    return SeedLocalDevDatasetResult(
        user_id=user_id,
        user_email=user_email,
        user_password=password_for_result,
        user_created=user_created,
        industry_ids=industry_ids,
        company_ids=[
            company_pending.id,
            company_indexing.id,
            company_portfolio.id,
            company_applied.id,
            company_invalid.id,
            company_archived.id,
            rich.company_id,
            multi.company_id,
        ],
        profile_ids=[profile.id for profile in shared_profiles] + rich.profile_ids + multi_profile_ids,
        frozen_profile_ids=[frozen_profile.id],
        application_ids=application_ids,
        per_profile_application_ids=per_profile_application_ids,
        email_ids=email_ids,
        notification_ids=[note.id for note in notifications],
        highlight_company_id=company_portfolio.id,
        highlight_application_id=rich.application_id,
        application_status_counts=_status_counts(repo),
        email_lifecycle_counts=_email_counts(repo),
    )

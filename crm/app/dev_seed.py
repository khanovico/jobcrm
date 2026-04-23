from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from app.models import (
    ApplicationCreate,
    ApplicationStatus,
    CompanyResearchStatus,
    ColdEmailPlan,
    ColdEmailPlanStatus,
    ColdEmailRecipient,
    CompanyCreate,
    EmailCreate,
    EmailKind,
    EmailLifecycleStatus,
    JobPost,
    PerProfileApplicationCreate,
    ProfileCreate,
)
from app.repository import BaseRepository


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
    company = repo.create_company(CompanyCreate(name=company_name, research_status=CompanyResearchStatus.indexed))

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
            work_mode="hybrid",
            work_mode_description="Hybrid: 2 days onsite, flexible async collaboration",
            overview="Developer infrastructure platform for AI-native products.",
            full_product_detail=(
                "Nebula Systems builds developer productivity tooling for enterprise AI teams, "
                "including observability, release automation, and secure data workflows."
            ),
            analysis_links=[
                {
                    "topic": "Engineering Blog",
                    "link": "https://nebula-systems.example.com/blog"
                },
                {
                    "topic": "Recent Funding Note",
                    "link": "https://news.example.com/nebula-series-b"
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

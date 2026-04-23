from app.dev_seed import (
    seed_local_dev_dataset,
    seed_multi_ppa_single_ready_profile_demo,
    seed_rich_dummy_application,
)
from app.models import ApplicationStatus, EmailLifecycleStatus, NotificationKind
from app.repository import InMemoryRepository


def test_seed_rich_dummy_application_creates_full_dataset() -> None:
    repo = InMemoryRepository()

    result = seed_rich_dummy_application(repo, label="test")

    assert result.company_id in repo.companies
    assert result.application_id in repo.applications
    assert len(result.profile_ids) == 3
    assert len(result.per_profile_application_ids) == 3
    assert len(result.email_ids) == 4

    app = repo.applications[result.application_id]
    assert app.company_id == result.company_id
    assert app.job_post is not None
    assert app.job_post.job_link is not None
    assert app.email_sent is True
    assert app.email_sent_at is not None

    for ppa_id in result.per_profile_application_ids:
        ppa = repo.per_profile_applications[ppa_id]
        assert ppa.tailored_resume_link is not None
        assert ppa.cold_email_plan is not None
        assert ppa.cold_email_plan.subjects
        assert ppa.cold_email_plan.to is not None

    sent_count = 0
    for email_id in result.email_ids:
        email = repo.emails[email_id]
        assert email.content
        if email.sent:
            sent_count += 1
            assert email.sent_at is not None
    assert sent_count >= 2


def _find_list_item_for_app(repo: InMemoryRepository, application_id: str):
    for row in repo.list_applications(0, 200, None, applied=False, exclude_status=ApplicationStatus.archived):
        if row.id == application_id:
            return row
    return None


def test_seed_multi_ppa_applied_profiles_demo_uses_first_profile_for_resume_case() -> None:
    repo = InMemoryRepository()
    result = seed_multi_ppa_single_ready_profile_demo(repo, label="test", ready_artifact="resume")
    item = _find_list_item_for_app(repo, result.application_id)
    assert item is not None
    assert [p.profile_name for p in item.applied_profiles] == [result.not_ready_profile_names[0]]


def test_seed_multi_ppa_applied_profiles_demo_uses_first_profile_for_email_case() -> None:
    repo = InMemoryRepository()
    result = seed_multi_ppa_single_ready_profile_demo(repo, label="test2", ready_artifact="email")
    assert result.email_id_if_any is not None
    item = _find_list_item_for_app(repo, result.application_id)
    assert item is not None
    assert [p.profile_name for p in item.applied_profiles] == [result.not_ready_profile_names[0]]


def test_seed_local_dev_dataset_creates_broad_local_qa_matrix() -> None:
    repo = InMemoryRepository()

    result = seed_local_dev_dataset(repo, label="test-local")

    assert result.user_created is True
    assert result.user_password == "local-dev-pass123"
    assert len(result.industry_ids) == 4
    assert len(result.company_ids) == 8
    assert len(result.frozen_profile_ids) == 1
    assert len(result.application_ids) == 11
    assert len(result.notification_ids) == 11

    statuses = {app.status for app in repo.applications.values()}
    assert statuses == {
        ApplicationStatus.company_research_pending,
        ApplicationStatus.company_researching,
        ApplicationStatus.ppa_pending,
        ApplicationStatus.ppa_analyzing,
        ApplicationStatus.application_pending,
        ApplicationStatus.application_drafting,
        ApplicationStatus.application_ready,
        ApplicationStatus.invalid,
        ApplicationStatus.archived,
    }

    lifecycle_states = {email.lifecycle_status for email in repo.emails.values()}
    assert lifecycle_states == {
        EmailLifecycleStatus.drafted,
        EmailLifecycleStatus.sent,
        EmailLifecycleStatus.received,
        EmailLifecycleStatus.timed_out,
        EmailLifecycleStatus.failed,
    }

    frozen_profile = repo.get_profile(result.frozen_profile_ids[0])
    assert frozen_profile is not None
    assert frozen_profile.frozen is True

    archived_companies = [company for company in repo.companies.values() if company.archived]
    assert len(archived_companies) == 1
    archived_applications = [app for app in repo.applications.values() if app.status == ApplicationStatus.archived]
    assert len(archived_applications) == 1
    assert archived_applications[0].archive_reason == "Local dummy archive scenario"

    applied_ready = [
        app for app in repo.applications.values() if app.status == ApplicationStatus.application_ready and app.applied
    ]
    assert len(applied_ready) == 1
    assert applied_ready[0].email_sent is True
    assert applied_ready[0].applied_at is not None

    expected_status_counts = {
        "application_drafting": 1,
        "application_pending": 1,
        "application_ready": 3,
        "archived": 1,
        "company_research_pending": 1,
        "company_researching": 1,
        "invalid": 1,
        "ppa_analyzing": 1,
        "ppa_pending": 1,
    }
    assert result.application_status_counts == expected_status_counts
    assert result.email_lifecycle_counts == {
        "drafted": 3,
        "failed": 1,
        "received": 1,
        "sent": 3,
        "timed_out": 1,
    }


def test_seed_local_dev_dataset_supports_dashboard_and_notifications_views() -> None:
    repo = InMemoryRepository()

    result = seed_local_dev_dataset(repo, label="test-dashboard")

    scoped_apps = repo.list_applications(
        0,
        200,
        None,
        exclude_status=ApplicationStatus.archived,
        created_by_user_id=None,
    )
    pipeline = sum(
        1
        for app in scoped_apps
        if app.status in (ApplicationStatus.company_research_pending, ApplicationStatus.company_researching)
    )
    ready = sum(1 for app in scoped_apps if app.status == ApplicationStatus.application_ready)
    actions = sum(1 for app in scoped_apps if app.status == ApplicationStatus.application_ready and not app.applied)
    assert pipeline == 2
    assert ready == 3
    assert actions == 2

    notifications = list(repo.notifications.values())
    assert len(notifications) == 11
    assert {note.notification for note in notifications} == {
        NotificationKind.APPLICATION_UPDATE,
        NotificationKind.COMPANY_UPDATE,
        NotificationKind.SYSTEM_ERROR,
        NotificationKind.FOLLOW_UP_DRAFT,
    }
    assert sum(1 for note in notifications if note.read_at is not None) >= 2
    assert sum(1 for note in notifications if note.link) >= 8
    unread_count = repo.count_unread_notifications(result.user_id)
    assert unread_count == 9

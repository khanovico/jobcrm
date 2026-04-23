from app.dev_seed import seed_multi_ppa_single_ready_profile_demo, seed_rich_dummy_application
from app.models import ApplicationStatus
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


def test_seed_multi_ppa_applied_profiles_demo_only_third_ppa_listable_resume() -> None:
    repo = InMemoryRepository()
    result = seed_multi_ppa_single_ready_profile_demo(repo, label="test", ready_artifact="resume")
    item = _find_list_item_for_app(repo, result.application_id)
    assert item is not None
    assert [p.profile_name for p in item.applied_profiles] == [result.ready_profile_name]


def test_seed_multi_ppa_applied_profiles_demo_only_third_ppa_listable_email() -> None:
    repo = InMemoryRepository()
    result = seed_multi_ppa_single_ready_profile_demo(repo, label="test2", ready_artifact="email")
    assert result.email_id_if_any is not None
    item = _find_list_item_for_app(repo, result.application_id)
    assert item is not None
    assert [p.profile_name for p in item.applied_profiles] == [result.ready_profile_name]

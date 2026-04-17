from app.dev_seed import seed_rich_dummy_application
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

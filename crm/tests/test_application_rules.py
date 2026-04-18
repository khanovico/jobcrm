from app.models import ApplicationStatus, validate_application_transition


def test_transition_allows_progression() -> None:
    assert validate_application_transition(
        ApplicationStatus.company_research_pending, ApplicationStatus.company_researching
    )


def test_transition_rejects_invalid_jump() -> None:
    assert not validate_application_transition(
        ApplicationStatus.company_research_pending, ApplicationStatus.application_pending
    )


def test_transition_is_idempotent() -> None:
    assert validate_application_transition(
        ApplicationStatus.company_research_pending, ApplicationStatus.company_research_pending
    )


def test_transition_allows_invalid_from_pipeline() -> None:
    assert validate_application_transition(
        ApplicationStatus.company_research_pending, ApplicationStatus.invalid
    )
    assert validate_application_transition(ApplicationStatus.application_ready, ApplicationStatus.invalid)


def test_transition_allows_archive_from_invalid() -> None:
    assert validate_application_transition(ApplicationStatus.invalid, ApplicationStatus.archived)

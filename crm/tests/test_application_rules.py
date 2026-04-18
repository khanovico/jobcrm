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


def test_transition_allows_ppa_analyzing_and_application_drafting_steps() -> None:
    assert validate_application_transition(
        ApplicationStatus.ppa_pending, ApplicationStatus.ppa_analyzing
    )
    assert validate_application_transition(
        ApplicationStatus.ppa_analyzing, ApplicationStatus.application_pending
    )
    assert validate_application_transition(
        ApplicationStatus.application_pending, ApplicationStatus.application_drafting
    )
    assert validate_application_transition(
        ApplicationStatus.application_drafting, ApplicationStatus.application_ready
    )

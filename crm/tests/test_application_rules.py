from app.models import ApplicationStatus, validate_application_transition


def test_transition_allows_progression() -> None:
    assert validate_application_transition(
        ApplicationStatus.pending_preparation, ApplicationStatus.researching
    )


def test_transition_rejects_invalid_jump() -> None:
    assert not validate_application_transition(
        ApplicationStatus.draft, ApplicationStatus.applied
    )


def test_transition_is_idempotent() -> None:
    assert validate_application_transition(ApplicationStatus.draft, ApplicationStatus.draft)

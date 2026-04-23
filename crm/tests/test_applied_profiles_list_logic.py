"""Unit tests for application list `applied_profiles` readiness helpers."""

from app.models import ColdEmailPlan, ColdEmailPlanStatus, ColdEmailRecipient
from app.repository import _cold_email_plan_ready_for_applied_list, _tailored_resume_link_ready


def test_tailored_resume_rejects_non_string_and_placeholders() -> None:
    assert _tailored_resume_link_ready({}) is False
    assert _tailored_resume_link_ready("  ") is False
    assert _tailored_resume_link_ready("TBD") is False
    assert _tailored_resume_link_ready("n/a") is False
    assert _tailored_resume_link_ready("https://x.example/r.pdf") is True


def test_cold_email_plan_ready_for_dict_or_model() -> None:
    assert _cold_email_plan_ready_for_applied_list(None) is False
    assert _cold_email_plan_ready_for_applied_list({}) is False
    assert _cold_email_plan_ready_for_applied_list({"subjects": [""]}) is False
    assert _cold_email_plan_ready_for_applied_list(
        {
            "subjects": ["Hi there"],
            "selected_subject_index": 0,
            "to": None,
        }
    ) is True
    plan = ColdEmailPlan(
        subjects=[],
        selected_subject_index=0,
        to=ColdEmailRecipient(title="H", name="A", email="a@b.co", timezone=None),
        status=ColdEmailPlanStatus.none,
    )
    assert _cold_email_plan_ready_for_applied_list(plan) is True

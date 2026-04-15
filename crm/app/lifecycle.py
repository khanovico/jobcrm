from __future__ import annotations

from app.models import Application, ApplicationStatus
from app.repository import BaseRepository


def notify_if_preparation_ready(
    repo: BaseRepository, before: Application | None, after: Application
) -> None:
    if before and before.status == after.status:
        return
    if after.status != ApplicationStatus.preparation_ready:
        return
    uid = after.created_by_user_id
    if not uid:
        return
    repo.create_notification(
        user_id=uid,
        kind="preparation_ready",
        title="Application preparation ready",
        body="Review profile matches, resume link, and email plan.",
        link=f"/applications/{after.id}",
    )

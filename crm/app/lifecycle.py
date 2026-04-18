from __future__ import annotations

from app.models import (
    Application,
    ApplicationStatus,
    NotificationKind,
    NotificationPayload,
    NotificationSeverity,
)
from app.repository import BaseRepository


def notify_if_preparation_ready(
    repo: BaseRepository, before: Application | None, after: Application
) -> None:
    if before and before.status == after.status:
        return
    if after.status != ApplicationStatus.application_ready:
        return
    uid = after.created_by_user_id
    if not uid:
        return
    repo.create_notification(
        user_id=uid,
        notification=NotificationKind.APPLICATION_UPDATE,
        notification_type=NotificationSeverity.SUCCESS,
        payload=NotificationPayload(
            id=after.id,
            message="Application preparation ready — review profile matches, resume link, and email plan.",
        ),
    )

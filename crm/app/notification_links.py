"""Resolve optional deep links for in-app notifications from kind + payload."""

from __future__ import annotations

from app.models import NotificationKind, UserNotification
from app.repository import BaseRepository


def enrich_notification_link(
    repo: BaseRepository, user_id: str, note: UserNotification
) -> UserNotification:
    computed = compute_notification_link(repo, user_id, note)
    if computed == note.link:
        return note
    return note.model_copy(update={"link": computed})


def compute_notification_link(
    repo: BaseRepository, user_id: str, note: UserNotification
) -> str | None:
    pid = note.payload.id
    nid = note.notification
    if nid == NotificationKind.APPLICATION_UPDATE:
        if not pid:
            return None
        app = repo.get_application(pid)
        if not app or app.created_by_user_id != user_id:
            return None
        return f"/applications/{pid}"
    if nid == NotificationKind.COMPANY_UPDATE:
        if not pid:
            return None
        if not repo.get_company(pid):
            return None
        return f"/companies/{pid}"
    if nid == NotificationKind.SYSTEM_ERROR:
        return None
    if nid == NotificationKind.FOLLOW_UP_DRAFT:
        if not pid:
            return None
        em = repo.get_email(pid)
        if not em:
            return None
        ppa = repo.get_per_profile_application(em.per_profile_application_id)
        if not ppa:
            return None
        app = repo.get_application(ppa.application_id)
        if not app or app.created_by_user_id != user_id:
            return None
        return f"/applications/{app.id}?emailId={pid}"
    return None

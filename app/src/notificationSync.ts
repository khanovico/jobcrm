/** Fired when inbox mutations may have changed unread count (sidebar badge sync). */
export const NOTIFICATIONS_INBOX_CHANGED = "jobcrm-notifications-inbox-changed";

export function dispatchNotificationsInboxChanged(): void {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_INBOX_CHANGED));
}

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dispatchNotificationsInboxChanged,
  NOTIFICATIONS_INBOX_CHANGED
} from "./notificationSync";

describe("notificationSync", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches a bubbling CustomEvent listeners can observe", () => {
    const listener = vi.fn();
    window.addEventListener(NOTIFICATIONS_INBOX_CHANGED, listener);

    dispatchNotificationsInboxChanged();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTIFICATIONS_INBOX_CHANGED, listener);
  });
});

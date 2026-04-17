import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { NotificationKind, NotificationSeverity, UserNotification } from "../types";

const kindLabel: Record<NotificationKind, string> = {
  APPLICATION_UPDATE: "Application",
  COMPANY_UPDATE: "Company",
  SYSTEM_ERROR: "System",
  FOLLOW_UP_DRAFT: "Follow-up draft"
};

const severityClass = (t: NotificationSeverity) => {
  if (t === "SUCCESS") return "badge-success";
  if (t === "FAILED") return "badge-error";
  return "badge-warning";
};

const PAGE_SIZE = 10;

export const NotificationsPage = () => {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showOnlyActive, setShowOnlyActive] = useState(true);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async (targetPage = page, unreadOnly = showOnlyActive) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listNotifications({
        unreadOnly,
        skip: (targetPage - 1) * PAGE_SIZE,
        limit: PAGE_SIZE
      });
      setItems(response);
      setHasNextPage(response.length === PAGE_SIZE);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(page, showOnlyActive);
  }, [page, showOnlyActive]);

  useEffect(() => {
    if (items.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [items.length, page]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Notifications</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <label className="label cursor-pointer justify-start gap-3 rounded-lg border border-base-300 bg-base-100 px-3 py-2">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={showOnlyActive}
          onChange={(event) => {
            setPage(1);
            setShowOnlyActive(event.target.checked);
          }}
        />
        <span className="label-text">Show only active notifications</span>
      </label>
      <div className="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow">
        <table className="table table-zebra table-sm">
          <thead>
            <tr>
              <th className="py-2">Notification</th>
              <th className="py-2">Type</th>
              <th className="py-2">Time</th>
              <th className="py-2">Message</th>
              <th className="py-2">Open</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id} className={n.read_at ? "opacity-75" : ""}>
                <td className="py-2">
                  <span className="font-medium">{kindLabel[n.notification]}</span>
                  {n.check && (
                    <span className="badge badge-outline badge-xs ml-2" title="Check requested">
                      Check
                    </span>
                  )}
                </td>
                <td className="py-2">
                  <span className={`badge badge-sm ${severityClass(n.type)}`}>{n.type}</span>
                </td>
                <td className="whitespace-nowrap py-2 text-xs opacity-80">
                  {new Date(n.timestamp).toLocaleString()}
                </td>
                <td className="py-2">
                  <div
                    className="max-w-sm truncate text-sm"
                    title={n.payload.message}
                    aria-label={`Notification message: ${n.payload.message}`}
                  >
                    {n.payload.message}
                  </div>
                </td>
                <td className="py-2">
                  {n.link ? (
                    <Link to={n.link} className="link link-primary text-sm">
                      View
                    </Link>
                  ) : (
                    <span className="text-sm opacity-50">—</span>
                  )}
                </td>
                <td className="py-2">
                  {n.read_at ? (
                    <span className="badge badge-ghost badge-sm">Read</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={async () => {
                        await api.markNotificationRead(n.id);
                        await load(page, showOnlyActive);
                      }}
                    >
                      Mark read
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs opacity-70">Page {page}</p>
        <div className="join">
          <button
            type="button"
            className="btn btn-xs join-item"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn-xs join-item"
            onClick={() => setPage((current) => current + 1)}
            disabled={!hasNextPage || loading}
          >
            Next
          </button>
        </div>
      </div>
      {items.length === 0 && !loading && (
        <p className="text-sm opacity-70">
          {showOnlyActive ? "No active notifications." : "No notifications."}
        </p>
      )}
    </div>
  );
};

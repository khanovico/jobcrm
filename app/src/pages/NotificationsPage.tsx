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

export const NotificationsPage = () => {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      setItems(await api.listNotifications(false));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Notifications</h2>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="overflow-x-auto rounded-lg border border-base-300 bg-base-100 shadow">
        <table className="table table-zebra">
          <thead>
            <tr>
              <th>Notification</th>
              <th>Type</th>
              <th>Time</th>
              <th>Message</th>
              <th>Open</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id} className={n.read_at ? "opacity-75" : ""}>
                <td>
                  <span className="font-medium">{kindLabel[n.notification]}</span>
                  {n.check && (
                    <span className="badge badge-outline badge-xs ml-2" title="Check requested">
                      Check
                    </span>
                  )}
                </td>
                <td>
                  <span className={`badge badge-sm ${severityClass(n.type)}`}>{n.type}</span>
                </td>
                <td className="whitespace-nowrap text-sm opacity-80">
                  {new Date(n.timestamp).toLocaleString()}
                </td>
                <td className="max-w-md text-sm">{n.payload.message}</td>
                <td>
                  {n.link ? (
                    <Link to={n.link} className="link link-primary text-sm">
                      View
                    </Link>
                  ) : (
                    <span className="text-sm opacity-50">—</span>
                  )}
                </td>
                <td>
                  {n.read_at ? (
                    <span className="badge badge-ghost badge-sm">Read</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-xs"
                      onClick={async () => {
                        await api.markNotificationRead(n.id);
                        await load();
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
      {items.length === 0 && <p className="text-sm opacity-70">No notifications.</p>}
    </div>
  );
};

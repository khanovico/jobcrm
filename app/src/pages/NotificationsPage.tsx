import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import { UserNotification } from "../types";

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
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id} className="card bg-base-100 p-4 shadow">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium">{n.title}</div>
                <p className="text-sm opacity-80">{n.body}</p>
                {n.link && (
                  <Link to={n.link} className="link link-primary text-sm">
                    Open
                  </Link>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
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
                <span className="text-xs opacity-60">{new Date(n.created_at).toLocaleString()}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="text-sm opacity-70">No notifications.</p>}
    </div>
  );
};

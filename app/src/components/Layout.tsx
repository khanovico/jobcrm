import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { api } from "../api";
import { useAuth } from "../auth";
import { NotificationKind, UserNotification } from "../types";

const TOAST_POLL_MS = 45_000;
const TOAST_AUTO_DISMISS_MS = 10_000;

const SESSION_INITIAL_KEY = "jobcrm-notifications-initial-sync";
const SESSION_SEEN_IDS_KEY = "jobcrm-notifications-seen-ids";

function loadSeenNotificationIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_SEEN_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function saveSeenNotificationIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(SESSION_SEEN_IDS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota / private mode */
  }
}

const kindLabel: Record<NotificationKind, string> = {
  APPLICATION_UPDATE: "Application",
  COMPANY_UPDATE: "Company",
  SYSTEM_ERROR: "System",
  FOLLOW_UP_DRAFT: "Follow-up draft"
};

const links = [
  { to: "/", label: "Dashboard", emoji: "📊" },
  { to: "/companies", label: "Companies", emoji: "🏢" },
  { to: "/profiles", label: "Profiles", emoji: "👤" },
  { to: "/applications", label: "Applications", emoji: "📋" },
  { to: "/industries", label: "Industries", emoji: "🏭" },
  { to: "/audit", label: "Audit", emoji: "📜", adminOnly: true },
  { to: "/notifications", label: "Notifications", emoji: "🔔" },
  { to: "/settings", label: "Settings", emoji: "⚙️", adminOnly: true }
];

type ToastItem = { toastKey: string; note: UserNotification };

export const Layout = () => {
  const { logout, user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenNotificationIdsRef = useRef<Set<string>>(loadSeenNotificationIds());
  const toastDismissTimersRef = useRef<Map<string, number>>(new Map());
  /** Avoid overlapping polls (slow network + tight interval leaves two runs both in the "seed" branch). */
  const pollInFlightRef = useRef(false);
  const visibleLinks = links.filter((link) => !link.adminOnly || user?.role === "admin");

  const dismissToast = useCallback((toastKey: string) => {
    const tid = toastDismissTimersRef.current.get(toastKey);
    if (tid !== undefined) window.clearTimeout(tid);
    toastDismissTimersRef.current.delete(toastKey);
    setToasts((prev) => prev.filter((t) => t.toastKey !== toastKey));
  }, []);

  const showToastForNote = useCallback(
    (note: UserNotification) => {
      const toastKey = `${note.id}-${Date.now()}`;
      setToasts((prev) => {
        if (prev.some((t) => t.note.id === note.id)) return prev;
        return [...prev, { toastKey, note }];
      });
      const timerId = window.setTimeout(() => dismissToast(toastKey), TOAST_AUTO_DISMISS_MS);
      toastDismissTimersRef.current.set(toastKey, timerId);
    },
    [dismissToast]
  );

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute("data-theme");
    document.documentElement.setAttribute("data-theme", current === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const unread = await api.getUnreadNotificationsCount();
        if (!cancelled) setUnreadCount(unread.count);

        const rows = await api.listNotifications({ unreadOnly: true, skip: 0, limit: 25 });
        if (cancelled) return;

        let initialDone = false;
        try {
          initialDone = sessionStorage.getItem(SESSION_INITIAL_KEY) === "1";
        } catch {
          initialDone = false;
        }

        if (!initialDone) {
          rows.forEach((n) => seenNotificationIdsRef.current.add(n.id));
          saveSeenNotificationIds(seenNotificationIdsRef.current);
          try {
            sessionStorage.setItem(SESSION_INITIAL_KEY, "1");
          } catch {
            /* ignore */
          }
        } else {
          for (const n of rows) {
            if (!seenNotificationIdsRef.current.has(n.id)) {
              seenNotificationIdsRef.current.add(n.id);
              saveSeenNotificationIds(seenNotificationIdsRef.current);
              showToastForNote(n);
            }
          }
        }
      } catch {
        if (!cancelled) setUnreadCount(0);
      } finally {
        pollInFlightRef.current = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, TOAST_POLL_MS);

    return () => {
      cancelled = true;
      pollInFlightRef.current = false;
      window.clearInterval(timer);
      toastDismissTimersRef.current.forEach((tid) => window.clearTimeout(tid));
      toastDismissTimersRef.current.clear();
    };
  }, [showToastForNote]);

  return (
    <div className="drawer lg:drawer-open">
      <input id="main-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex min-h-screen flex-col bg-base-200">
        <header className="navbar border-b border-base-300 bg-base-100 shadow-sm lg:z-10 lg:border-l-0">
          <div className="flex-1">
            <label htmlFor="main-drawer" className="btn btn-square btn-ghost lg:hidden" aria-label="Open menu">
              <span className="text-lg" aria-hidden>
                ≡
              </span>
            </label>
            <h1 className="ml-2 text-xl font-semibold tracking-tight">JobCRM</h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={toggleTheme}>
              Toggle Theme
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={logout}>
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-4">
          <Suspense fallback={<div className="p-4 text-sm opacity-70">Loading page...</div>}>
            <Outlet />
          </Suspense>
        </main>
        <div
          className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(100vw-2rem,22rem)] flex-col gap-3"
          aria-live="polite"
          aria-relevant="additions"
        >
          {toasts.map(({ toastKey, note }) => (
            <div
              key={toastKey}
              role="alert"
              className="pointer-events-auto relative overflow-hidden rounded-xl border border-base-300 bg-base-100 p-4 shadow-xl ring-1 ring-black/5 dark:ring-white/10"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-secondary to-accent" />
              <div className="flex gap-3 pt-1">
                <span className="text-2xl leading-none" aria-hidden>
                  🔔
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                    {kindLabel[note.notification]}
                  </p>
                  <p className="text-sm leading-snug text-base-content">{note.payload.message}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {note.link ? (
                      <Link
                        to={note.link}
                        className="btn btn-primary btn-xs"
                        onClick={() => dismissToast(toastKey)}
                      >
                        Open
                      </Link>
                    ) : null}
                    <Link
                      to="/notifications"
                      className="btn btn-ghost btn-xs"
                      onClick={() => dismissToast(toastKey)}
                    >
                      View all
                    </Link>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-circle btn-ghost shrink-0"
                  aria-label="Dismiss notification"
                  onClick={() => dismissToast(toastKey)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="drawer-side z-40">
        <label htmlFor="main-drawer" className="drawer-overlay" />
        <aside className="flex min-h-full w-64 flex-col border-r border-base-300 bg-base-100 lg:shadow-[inset_-1px_0_0_0_hsl(var(--b3))]">
          <div className="border-b border-base-300 px-4 py-4 lg:flex lg:h-[4.25rem] lg:items-center lg:border-b lg:border-base-300">
            <Link to="/" className="text-lg font-semibold tracking-tight">
              JobCRM
            </Link>
          </div>
          <nav className="flex-1 p-3" aria-label="Main">
            <ul className="menu menu-md gap-1 rounded-lg bg-base-200/60 p-2">
              {visibleLinks.map((link) => (
                <li key={link.to}>
                  <NavLink
                    to={link.to}
                    end={link.to === "/"}
                    className={({ isActive }) =>
                      [
                        "flex items-center gap-3 rounded-lg py-3 transition-colors",
                        isActive
                          ? "active bg-primary text-primary-content font-medium shadow-sm"
                          : "hover:bg-base-300/50"
                      ].join(" ")
                    }
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      {link.emoji}
                    </span>
                    <span className="flex items-center gap-2">
                      <span>{link.label}</span>
                      {link.to === "/notifications" && unreadCount > 0 && (
                        <span
                          className="inline-flex h-2.5 w-2.5 rounded-full bg-red-500"
                          aria-label={`Unread notifications: ${unreadCount}`}
                          title={`${unreadCount} unread notifications`}
                        />
                      )}
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
};

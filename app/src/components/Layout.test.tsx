import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { lazy } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../auth";
import { NOTIFICATIONS_INBOX_CHANGED } from "../notificationSync";
import { Layout } from "./Layout";

const { getUnreadNotificationsCount, listNotifications, setUnauthorizedHandler, getMe } = vi.hoisted(
  () => ({
    getUnreadNotificationsCount: vi.fn(),
    listNotifications: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
    getMe: vi.fn()
  })
);

vi.mock("../api", () => ({
  api: {
    getUnreadNotificationsCount,
    listNotifications,
    getMe
  },
  setUnauthorizedHandler
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.setItem("jobcrm-token", "test-token");
  sessionStorage.removeItem("jobcrm-notifications-initial-sync");
  sessionStorage.removeItem("jobcrm-notifications-seen-ids");
  getUnreadNotificationsCount.mockReset();
  listNotifications.mockReset();
  listNotifications.mockResolvedValue([]);
  getMe.mockReset();
  getMe.mockResolvedValue({ id: "u1", name: "Admin", email: "admin@example.com", role: "admin", admin: true });
});

function Placeholder({ title }: { title: string }) {
  return <div>{title}</div>;
}

describe("Layout", () => {
  it("marks the current route in the sidebar", () => {
    getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    render(
      <MemoryRouter initialEntries={["/applications"]}>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/applications" element={<Placeholder title="Applications page" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const nav = screen.getByRole("navigation", { name: "Main" });
    const applicationsLink = within(nav).getByRole("link", { name: /Applications/i });
    expect(applicationsLink).toHaveClass("active");
  });

  it("highlights Dashboard only on the root path", () => {
    getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Placeholder title="Home" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const nav = screen.getByRole("navigation", { name: "Main" });
    const dashboardLink = within(nav).getByRole("link", { name: /Dashboard/i });
    expect(dashboardLink).toHaveClass("active");
  });

  it("shows unread badge for notifications and polls notifications on an interval", async () => {
    getUnreadNotificationsCount.mockResolvedValueOnce({ count: 2 });
    listNotifications.mockResolvedValue([]);
    const intervalSpy = vi.spyOn(window, "setInterval");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Placeholder title="Home" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Unread notifications: 2")).toBeInTheDocument();
    });
    expect(getUnreadNotificationsCount).toHaveBeenCalled();
    expect(listNotifications).toHaveBeenCalledWith({ unreadOnly: true, skip: 0, limit: 25 });
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 45_000);
  });

  it("refreshes sidebar unread badge when inbox changes without waiting for poll", async () => {
    getUnreadNotificationsCount.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 0 });
    listNotifications.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Placeholder title="Home" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Unread notifications: 3")).toBeInTheDocument();
    });

    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_INBOX_CHANGED));

    await waitFor(() => {
      expect(screen.queryByLabelText(/Unread notifications:/)).not.toBeInTheDocument();
    });
    expect(getUnreadNotificationsCount).toHaveBeenCalledTimes(2);
  });

  it("shows a toast when a new unread notification appears after initial load", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    getUnreadNotificationsCount.mockResolvedValue({ count: 1 });
    listNotifications
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "new-note",
          user_id: "u1",
          notification: "APPLICATION_UPDATE",
          type: "SUCCESS",
          timestamp: "2026-01-01T00:00:00Z",
          check: false,
          payload: { id: "a1", message: "Prep complete" },
          created_at: "2026-01-01T00:00:00Z",
          read_at: null,
          link: "/applications/a1"
        }
      ]);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Placeholder title="Home" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(1));

    const pollCallback = intervalSpy.mock.calls.find((c) => c[1] === 45_000)?.[0] as () => void;
    expect(pollCallback).toBeDefined();

    await act(async () => {
      pollCallback();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Prep complete");
    intervalSpy.mockRestore();
  });

  it("hides settings and audit links for user role", async () => {
    getMe.mockResolvedValueOnce({ id: "u2", name: "User", email: "user@example.com", role: "user", admin: false });
    getUnreadNotificationsCount.mockResolvedValue({ count: 0 });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Placeholder title="Home" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: /Settings/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Audit/i })).not.toBeInTheDocument();
  });

  it("keeps the sidebar mounted while a lazy route loads", async () => {
    getUnreadNotificationsCount.mockResolvedValue({ count: 0 });
    let resolveLazyRoute: ((value: { default: () => JSX.Element }) => void) | null = null;
    const LazyRoute = lazy(
      () =>
        new Promise<{ default: () => JSX.Element }>((resolve) => {
          resolveLazyRoute = resolve;
        })
    );

    render(
      <MemoryRouter initialEntries={["/applications"]}>
        <AuthProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/applications" element={<LazyRoute />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByText("Loading page...")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Applications/i })).toBeInTheDocument();

    await act(async () => {
      resolveLazyRoute?.({ default: () => <div>Applications page</div> });
    });

    expect(await screen.findByText("Applications page")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  });
});

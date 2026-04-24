import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { lazy } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../auth";
import { NOTIFICATIONS_INBOX_CHANGED } from "../notificationSync";
import { Layout } from "./Layout";

const { getNotificationsSummary, setUnauthorizedHandler, getMe } = vi.hoisted(
  () => ({
    getNotificationsSummary: vi.fn(),
    setUnauthorizedHandler: vi.fn(),
    getMe: vi.fn()
  })
);

vi.mock("../api", () => ({
  api: {
    getNotificationsSummary,
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
  getNotificationsSummary.mockReset();
  getNotificationsSummary.mockResolvedValue({ unread_count: 0, newest_unread: [] });
  getMe.mockReset();
  getMe.mockResolvedValue({ id: "u1", name: "Admin", email: "admin@example.com", role: "admin", admin: true });
});

function Placeholder({ title }: { title: string }) {
  return <div>{title}</div>;
}

describe("Layout", () => {
  it("marks the current route in the sidebar", () => {
    getNotificationsSummary.mockResolvedValue({ unread_count: 0, newest_unread: [] });
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
    getNotificationsSummary.mockResolvedValue({ unread_count: 0, newest_unread: [] });
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
    getNotificationsSummary.mockResolvedValueOnce({ unread_count: 2, newest_unread: [] });
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
    expect(getNotificationsSummary).toHaveBeenCalledWith(10);
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 45_000);
  });

  it("refreshes sidebar unread badge when inbox changes without waiting for poll", async () => {
    getNotificationsSummary
      .mockResolvedValueOnce({ unread_count: 3, newest_unread: [] })
      .mockResolvedValueOnce({ unread_count: 0, newest_unread: [] });

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
    expect(getNotificationsSummary).toHaveBeenCalledTimes(2);
    expect(getNotificationsSummary).toHaveBeenLastCalledWith(0);
  });

  it("shows a toast when a new unread notification appears after initial load", async () => {
    const intervalSpy = vi.spyOn(window, "setInterval");
    getNotificationsSummary
      .mockResolvedValueOnce({ unread_count: 1, newest_unread: [] })
      .mockResolvedValueOnce({
        unread_count: 1,
        newest_unread: [
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
        ]
      });

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

    await waitFor(() => expect(getNotificationsSummary).toHaveBeenCalledTimes(1));

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
    getNotificationsSummary.mockResolvedValue({ unread_count: 0, newest_unread: [] });

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
    getNotificationsSummary.mockResolvedValue({ unread_count: 0, newest_unread: [] });
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

  it("persists theme preference and exposes current theme state", async () => {
    localStorage.setItem("jobcrm-theme", "dark");
    getNotificationsSummary.mockResolvedValue({ unread_count: 0, newest_unread: [] });

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

    const themeButton = await screen.findByRole("button", { name: /Theme is dark/i });
    expect(themeButton).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    await act(async () => {
      themeButton.click();
    });

    expect(screen.getByRole("button", { name: /Theme is light/i })).toHaveAttribute("aria-pressed", "false");
    expect(localStorage.getItem("jobcrm-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../auth";
import { Layout } from "./Layout";

const { listNotifications, setUnauthorizedHandler, getMe } = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
  getMe: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
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
  listNotifications.mockReset();
  getMe.mockReset();
  getMe.mockResolvedValue({ id: "u1", name: "Admin", email: "admin@example.com", role: "admin", admin: true });
});

function Placeholder({ title }: { title: string }) {
  return <div>{title}</div>;
}

describe("Layout", () => {
  it("marks the current route in the sidebar", () => {
    listNotifications.mockResolvedValue([]);
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

    const nav = screen.getByRole("navigation", { name: "Main" });
    const dashboardLink = within(nav).getByRole("link", { name: /Dashboard/i });
    expect(dashboardLink).toHaveClass("active");
  });

  it("shows unread badge for notifications and polls every five minutes", async () => {
    listNotifications.mockResolvedValueOnce([{ id: "n1" }, { id: "n2" }]);
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
    expect(listNotifications).toHaveBeenCalledWith({ unreadOnly: true, skip: 0, limit: 100 });
    expect(intervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
  });

  it("hides settings and audit links for user role", async () => {
    getMe.mockResolvedValueOnce({ id: "u2", name: "User", email: "user@example.com", role: "user", admin: false });
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

    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).queryByRole("link", { name: /Settings/i })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: /Audit/i })).not.toBeInTheDocument();
  });
});

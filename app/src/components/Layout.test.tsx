import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../auth";
import { Layout } from "./Layout";

const { listNotifications } = vi.hoisted(() => ({
  listNotifications: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    listNotifications
  }
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  localStorage.setItem("jobcrm-token", "test-token");
  listNotifications.mockReset();
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
    vi.useFakeTimers();
    listNotifications
      .mockResolvedValueOnce([{ id: "n1" }, { id: "n2" }])
      .mockResolvedValueOnce([{ id: "n1" }]);

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

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    await waitFor(() => {
      expect(screen.getByLabelText("Unread notifications: 1")).toBeInTheDocument();
    });
  });
});

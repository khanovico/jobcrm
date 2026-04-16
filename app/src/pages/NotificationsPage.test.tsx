import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsPage } from "./NotificationsPage";

const { listNotifications, markNotificationRead } = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    listNotifications,
    markNotificationRead
  }
}));

describe("NotificationsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listNotifications.mockReset();
    markNotificationRead.mockReset();
  });

  it("renders notification rows with labels, severity, message and links", async () => {
    listNotifications.mockResolvedValueOnce([
      {
        id: "n1",
        user_id: "u1",
        notification: "APPLICATION_UPDATE",
        type: "SUCCESS",
        timestamp: "2026-01-01T00:00:00Z",
        check: true,
        payload: { id: "a1", message: "Application is ready" },
        created_at: "2026-01-01T00:00:00Z",
        read_at: null,
        link: "/applications/a1"
      },
      {
        id: "n2",
        user_id: "u1",
        notification: "SYSTEM_ERROR",
        type: "FAILED",
        timestamp: "2026-01-02T00:00:00Z",
        check: false,
        payload: { id: null, message: "Agent failed" },
        created_at: "2026-01-02T00:00:00Z",
        read_at: "2026-01-02T01:00:00Z",
        link: null
      }
    ]);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Application")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByText("SUCCESS")).toBeInTheDocument();
    expect(screen.getByText("FAILED")).toBeInTheDocument();
    expect(screen.getByText("Application is ready")).toBeInTheDocument();
    expect(screen.getByText("Agent failed")).toBeInTheDocument();
    expect(screen.getByText("Check")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "/applications/a1");
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("marks notification as read and reloads list", async () => {
    listNotifications
      .mockResolvedValueOnce([
        {
          id: "n1",
          user_id: "u1",
          notification: "COMPANY_UPDATE",
          type: "WARN",
          timestamp: "2026-01-01T00:00:00Z",
          check: false,
          payload: { id: "c1", message: "Company changed" },
          created_at: "2026-01-01T00:00:00Z",
          read_at: null,
          link: "/companies/c1"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "n1",
          user_id: "u1",
          notification: "COMPANY_UPDATE",
          type: "WARN",
          timestamp: "2026-01-01T00:00:00Z",
          check: false,
          payload: { id: "c1", message: "Company changed" },
          created_at: "2026-01-01T00:00:00Z",
          read_at: "2026-01-01T01:00:00Z",
          link: "/companies/c1"
        }
      ]);
    markNotificationRead.mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText("Company changed");
    await userEvent.click(screen.getAllByRole("button", { name: "Mark read" })[0]);

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith("n1");
      expect(listNotifications).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("Read")).toBeInTheDocument();
  });
});

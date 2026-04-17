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

  it("renders active notifications by default with compact tooltip message", async () => {
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
      }
    ]);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Application")).toBeInTheDocument();
    expect(screen.getByText("SUCCESS")).toBeInTheDocument();
    expect(screen.getByText("Application is ready")).toBeInTheDocument();
    expect(screen.getByText("Check")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "/applications/a1");
    expect(screen.getByRole("checkbox", { name: "Show only active notifications" })).toBeChecked();
    expect(listNotifications).toHaveBeenCalledWith({ unreadOnly: true, skip: 0, limit: 10 });
    expect(screen.getByLabelText("Notification message: Application is ready")).toHaveAttribute(
      "title",
      "Application is ready"
    );
  });

  it("shows read notifications when active-only toggle is disabled", async () => {
    listNotifications
      .mockResolvedValueOnce([
        {
          id: "n1",
          user_id: "u1",
          notification: "APPLICATION_UPDATE",
          type: "SUCCESS",
          timestamp: "2026-01-01T00:00:00Z",
          check: false,
          payload: { id: "a1", message: "Unread notification" },
          created_at: "2026-01-01T00:00:00Z",
          read_at: null,
          link: "/applications/a1"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "n2",
          user_id: "u1",
          notification: "SYSTEM_ERROR",
          type: "FAILED",
          timestamp: "2026-01-02T00:00:00Z",
          check: false,
          payload: { id: null, message: "Read notification" },
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

    await screen.findByText("Unread notification");
    await userEvent.click(screen.getByRole("checkbox", { name: "Show only active notifications" }));

    expect(await screen.findByText("Read notification")).toBeInTheDocument();
    expect(listNotifications).toHaveBeenLastCalledWith({ unreadOnly: false, skip: 0, limit: 10 });
    expect(screen.getByText("Read")).toBeInTheDocument();
  });

  it("supports pagination through next page", async () => {
    const pageOne = Array.from({ length: 10 }).map((_, idx) => ({
      id: `n-${idx + 1}`,
      user_id: "u1",
      notification: "COMPANY_UPDATE" as const,
      type: "WARN" as const,
      timestamp: `2026-01-01T00:00:0${idx}Z`,
      check: false,
      payload: { id: `c-${idx + 1}`, message: `Company changed ${idx + 1}` },
      created_at: `2026-01-01T00:00:0${idx}Z`,
      read_at: null,
      link: `/companies/c-${idx + 1}`
    }));

    listNotifications
      .mockResolvedValueOnce(pageOne)
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

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText("Company changed 1");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Company changed");
    expect(listNotifications).toHaveBeenCalledTimes(2);
    expect(listNotifications).toHaveBeenNthCalledWith(2, { unreadOnly: true, skip: 10, limit: 10 });
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
      .mockResolvedValueOnce([]);
    markNotificationRead.mockResolvedValueOnce(undefined);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText("Company changed");
    await userEvent.click(screen.getByRole("button", { name: "Mark read" }));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledWith("n1");
      expect(listNotifications).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText("No active notifications.")).toBeInTheDocument();
  });
});

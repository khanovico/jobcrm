import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotificationsPage } from "./NotificationsPage";

const { listNotifications, markNotificationRead, markNotificationsReadBulk, deleteNotificationsBulk } = vi.hoisted(() => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationsReadBulk: vi.fn(),
  deleteNotificationsBulk: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    listNotifications,
    markNotificationRead,
    markNotificationsReadBulk,
    deleteNotificationsBulk
  }
}));

describe("NotificationsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    listNotifications.mockReset();
    markNotificationRead.mockReset();
    markNotificationsReadBulk.mockReset();
    deleteNotificationsBulk.mockReset();
    markNotificationsReadBulk.mockResolvedValue({ updated: 2 });
    deleteNotificationsBulk.mockResolvedValue({ deleted: 2 });
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

  it("expands long notification messages inline", async () => {
    const longMessage =
      "Application preparation finished with several details that are too long for a compact table cell.";
    listNotifications.mockResolvedValueOnce([
      {
        id: "n1",
        user_id: "u1",
        notification: "APPLICATION_UPDATE",
        type: "SUCCESS",
        timestamp: "2026-01-01T00:00:00Z",
        check: false,
        payload: { id: "a1", message: longMessage },
        created_at: "2026-01-01T00:00:00Z",
        read_at: null,
        link: null
      }
    ]);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText(longMessage);
    const expand = screen.getByRole("button", { name: "Show full message" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(expand);
    expect(screen.getByRole("button", { name: "Collapse message" })).toHaveAttribute(
      "aria-expanded",
      "true"
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
    await userEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    await screen.findByText("Company changed");
    expect(listNotifications).toHaveBeenCalledTimes(2);
    expect(listNotifications).toHaveBeenNthCalledWith(2, { unreadOnly: true, skip: 10, limit: 10 });
  });

  it("marks notification as read optimistically without blocking on reload", async () => {
    listNotifications.mockResolvedValueOnce([
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
    ]);
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
    });
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(listNotifications).toHaveBeenCalledTimes(1);
  });

  it("confirms before bulk deleting selected notifications", async () => {
    listNotifications.mockResolvedValueOnce([
      {
        id: "n1",
        user_id: "u1",
        notification: "APPLICATION_UPDATE",
        type: "SUCCESS",
        timestamp: "2026-01-01T00:00:00Z",
        check: false,
        payload: { id: "a1", message: "One" },
        created_at: "2026-01-01T00:00:00Z",
        read_at: null,
        link: null
      },
      {
        id: "n2",
        user_id: "u1",
        notification: "APPLICATION_UPDATE",
        type: "SUCCESS",
        timestamp: "2026-01-02T00:00:00Z",
        check: false,
        payload: { id: "a2", message: "Two" },
        created_at: "2026-01-02T00:00:00Z",
        read_at: null,
        link: null
      }
    ]);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText("One");
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete selected (2)" }));
    expect(deleteNotificationsBulk).not.toHaveBeenCalled();

    expect(await screen.findByRole("heading", { name: "Delete selected notifications" })).toBeInTheDocument();
    expect(screen.getByText("Delete 2 selected notifications? This cannot be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete notifications" }));

    await waitFor(() => {
      expect(deleteNotificationsBulk).toHaveBeenCalledWith(["n1", "n2"]);
    });
    expect(screen.getByText("No active notifications.")).toBeInTheDocument();
  });

  it("cancels bulk delete without removing selected notifications", async () => {
    listNotifications.mockResolvedValueOnce([
      {
        id: "n1",
        user_id: "u1",
        notification: "APPLICATION_UPDATE",
        type: "SUCCESS",
        timestamp: "2026-01-01T00:00:00Z",
        check: false,
        payload: { id: "a1", message: "One" },
        created_at: "2026-01-01T00:00:00Z",
        read_at: null,
        link: null
      }
    ]);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText("One");
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete selected (1)" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(deleteNotificationsBulk).not.toHaveBeenCalled();
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Delete selected notifications" })).not.toBeInTheDocument();
  });

  it("bulk marks selected unread notifications with one request", async () => {
    listNotifications.mockResolvedValueOnce([
      {
        id: "n1",
        user_id: "u1",
        notification: "APPLICATION_UPDATE",
        type: "SUCCESS",
        timestamp: "2026-01-01T00:00:00Z",
        check: false,
        payload: { id: "a1", message: "One" },
        created_at: "2026-01-01T00:00:00Z",
        read_at: null,
        link: null
      },
      {
        id: "n2",
        user_id: "u1",
        notification: "APPLICATION_UPDATE",
        type: "SUCCESS",
        timestamp: "2026-01-02T00:00:00Z",
        check: false,
        payload: { id: "a2", message: "Two" },
        created_at: "2026-01-02T00:00:00Z",
        read_at: null,
        link: null
      }
    ]);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText("One");
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    await userEvent.click(screen.getByRole("button", { name: "Mark selected read" }));

    await waitFor(() => {
      expect(markNotificationsReadBulk).toHaveBeenCalledWith(["n1", "n2"]);
    });
    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(screen.getAllByText("Read")).toHaveLength(2);
  });

  it("select all toggles selection on current page", async () => {
    listNotifications.mockResolvedValueOnce([
      {
        id: "n1",
        user_id: "u1",
        notification: "APPLICATION_UPDATE",
        type: "SUCCESS",
        timestamp: "2026-01-01T00:00:00Z",
        check: false,
        payload: { id: "a1", message: "Hello" },
        created_at: "2026-01-01T00:00:00Z",
        read_at: null,
        link: null
      }
    ]);

    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>
    );

    await screen.findByText("Hello");
    await userEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByRole("button", { name: "Delete selected (1)" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Unselect all" }));
    expect(screen.getByRole("button", { name: "Delete selected (0)" })).toBeDisabled();
  });
});

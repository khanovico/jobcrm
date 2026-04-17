import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationDetailPage } from "./ApplicationDetailPage";

const {
  getApplication,
  getCompany,
  listPerProfileApplications,
  listProfiles,
  listEmailsForPpa,
  markApplied,
  markApplicationEmailSent,
  markEmailSent
} = vi.hoisted(() => ({
  getApplication: vi.fn(),
  getCompany: vi.fn(),
  listPerProfileApplications: vi.fn(),
  listProfiles: vi.fn(),
  listEmailsForPpa: vi.fn(),
  markApplied: vi.fn(),
  markApplicationEmailSent: vi.fn(),
  markEmailSent: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    getApplication,
    getCompany,
    listPerProfileApplications,
    listProfiles,
    listEmailsForPpa,
    markApplied,
    markApplicationEmailSent,
    markEmailSent
  }
}));

vi.mock("../components/ArchiveApplicationModal", () => ({
  ArchiveApplicationModal: () => null
}));

describe("ApplicationDetailPage", () => {
  const scrollIntoViewMock = vi.fn();

  beforeEach(() => {
    getApplication.mockReset();
    getCompany.mockReset();
    listPerProfileApplications.mockReset();
    listProfiles.mockReset();
    listEmailsForPpa.mockReset();
    markApplied.mockReset();
    markApplicationEmailSent.mockReset();
    markEmailSent.mockReset();
    scrollIntoViewMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock
    });
  });

  it("highlights and scrolls to email from emailId query param", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "preparation_ready",
      applied: false,
      email_sent: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    getCompany.mockResolvedValueOnce({
      id: "c1",
      name: "Acme",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    listPerProfileApplications.mockResolvedValueOnce([
      {
        id: "ppa1",
        application_id: "a1",
        profile_id: "p1",
        order_index: 1,
        analysis: "Strong fit",
        applied: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    listProfiles.mockResolvedValueOnce([
      {
        id: "p1",
        name: "Profile One",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    listEmailsForPpa.mockResolvedValueOnce([
      {
        id: "e1",
        per_profile_application_id: "ppa1",
        kind: "follow_up",
        content: "First email",
        lifecycle_status: "drafted",
        sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      },
      {
        id: "e2",
        per_profile_application_id: "ppa1",
        kind: "follow_up",
        content: "Second email",
        lifecycle_status: "drafted",
        sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);

    render(
      <MemoryRouter initialEntries={["/applications/a1?emailId=e2"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Second email");
    const target = document.getElementById("email-e2");
    expect(target).not.toBeNull();
    expect(target?.className).toContain("ring-2");
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it("shows unmark actions when application and email are already marked", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "preparation_ready",
      applied: true,
      applied_at: "2026-01-02T00:00:00Z",
      email_sent: true,
      email_sent_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    getCompany.mockResolvedValueOnce({
      id: "c1",
      name: "Acme",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    listPerProfileApplications.mockResolvedValueOnce([
      {
        id: "ppa1",
        application_id: "a1",
        profile_id: "p1",
        order_index: 1,
        analysis: "Strong fit",
        applied: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    listProfiles.mockResolvedValueOnce([
      {
        id: "p1",
        name: "Profile One",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    listEmailsForPpa.mockResolvedValueOnce([
      {
        id: "e1",
        per_profile_application_id: "ppa1",
        kind: "follow_up",
        content: "Sent email",
        lifecycle_status: "sent",
        sent: true,
        sent_at: "2026-01-02T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Unmark applied" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Unmark email sent" })).toHaveLength(2);
  });

  it("unmarks application applied, application email-sent, and per-profile email-sent", async () => {
    getApplication.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "preparation_ready",
      applied: true,
      applied_at: "2026-01-02T00:00:00Z",
      email_sent: true,
      email_sent_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    getCompany.mockResolvedValue({
      id: "c1",
      name: "Acme",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    listPerProfileApplications.mockResolvedValue([
      {
        id: "ppa1",
        application_id: "a1",
        profile_id: "p1",
        order_index: 1,
        analysis: "Strong fit",
        applied: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    listProfiles.mockResolvedValue([
      {
        id: "p1",
        name: "Profile One",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    listEmailsForPpa.mockResolvedValue([
      {
        id: "e1",
        per_profile_application_id: "ppa1",
        kind: "follow_up",
        content: "Sent email",
        lifecycle_status: "sent",
        sent: true,
        sent_at: "2026-01-02T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    markApplied.mockResolvedValue({});
    markApplicationEmailSent.mockResolvedValue({});
    markEmailSent.mockResolvedValue({});

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Unmark applied" }));
    expect(markApplied).toHaveBeenCalledWith("a1", false);

    const unmarkEmailButtons = screen.getAllByRole("button", { name: "Unmark email sent" });
    await userEvent.click(unmarkEmailButtons[0]);
    expect(markApplicationEmailSent).toHaveBeenCalledWith("a1", false);

    await userEvent.click(unmarkEmailButtons[1]);
    expect(markEmailSent).toHaveBeenCalledWith("e1", false);
  });
});

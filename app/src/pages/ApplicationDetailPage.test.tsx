import { render, screen, waitFor } from "@testing-library/react";
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
});

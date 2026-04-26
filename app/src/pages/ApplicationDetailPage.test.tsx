import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationDetailPage } from "./ApplicationDetailPage";

const {
  getApplicationDetail,
  getApplication,
  getCompany,
  listPerProfileApplications,
  listProfiles,
  listEmailsForPpa,
  updatePerProfileApplication,
  updateApplication,
  markApplied,
  markApplicationEmailSent,
  markEmailSent,
  deleteEmail,
  clearApplicationToCompanyResearchPending
} = vi.hoisted(() => ({
  getApplicationDetail: vi.fn(),
  getApplication: vi.fn(),
  getCompany: vi.fn(),
  listPerProfileApplications: vi.fn(),
  listProfiles: vi.fn(),
  listEmailsForPpa: vi.fn(),
  updatePerProfileApplication: vi.fn(),
  updateApplication: vi.fn(),
  markApplied: vi.fn(),
  markApplicationEmailSent: vi.fn(),
  markEmailSent: vi.fn(),
  deleteEmail: vi.fn(),
  clearApplicationToCompanyResearchPending: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    getApplicationDetail,
    getApplication,
    getCompany,
    listPerProfileApplications,
    listProfiles,
    listEmailsForPpa,
    updatePerProfileApplication,
    updateApplication,
    markApplied,
    markApplicationEmailSent,
    markEmailSent,
    deleteEmail,
    clearApplicationToCompanyResearchPending
  }
}));

vi.mock("../components/ArchiveApplicationModal", () => ({
  ArchiveApplicationModal: () => null
}));

vi.mock("../components/ClearApplicationToPendingModal", () => ({
  ClearApplicationToPendingModal: () => null
}));

describe("ApplicationDetailPage", () => {
  const scrollIntoViewMock = vi.fn();

  beforeEach(() => {
    getApplicationDetail.mockReset();
    getApplication.mockReset();
    getCompany.mockReset();
    listPerProfileApplications.mockReset();
    listProfiles.mockReset();
    listEmailsForPpa.mockReset();
    updatePerProfileApplication.mockReset();
    updateApplication.mockReset();
    markApplied.mockReset();
    markApplicationEmailSent.mockReset();
    markEmailSent.mockReset();
    deleteEmail.mockReset();
    clearApplicationToCompanyResearchPending.mockReset();
    getApplicationDetail.mockImplementation(async (applicationId: string) => {
      const application = await getApplication(applicationId);
      const company = await getCompany(application.company_id);
      const ppas = await listPerProfileApplications(applicationId);
      const profiles = await listProfiles();
      const profileNameById = new Map(profiles.map((profile: { id: string; name: string }) => [profile.id, profile.name]));
      const perProfileApplications = await Promise.all(
        ppas.map(async (ppa: { id: string; profile_id: string }) => {
          try {
            const emails = await listEmailsForPpa(ppa.id);
            return {
              ...ppa,
              profile_name: profileNameById.get(ppa.profile_id) ?? ppa.profile_id,
              emails
            };
          } catch {
            return {
              ...ppa,
              profile_name: profileNameById.get(ppa.profile_id) ?? ppa.profile_id,
              emails: []
            };
          }
        })
      );
      return {
        application,
        company,
        per_profile_applications: perProfileApplications
      };
    });
    scrollIntoViewMock.mockReset();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("highlights and scrolls to email from emailId query param", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
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
        cold_email_plan: {
          subjects: ["Quick intro", "LLM reliability for legal workflows", "15-minute chat?"],
          selected_subject_index: 1,
          to: { title: "Hiring Manager", name: "Benjamin", email: "benjamin@lawgoat.com" },
          status: "ready"
        },
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

    await waitFor(() => {
      const target = document.getElementById("email-e2");
      expect(target).not.toBeNull();
      expect(target?.className).toContain("ring-2");
    });
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it("keeps showing other emails when one per-profile email request fails", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
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
      },
      {
        id: "ppa2",
        application_id: "a1",
        profile_id: "p2",
        order_index: 2,
        analysis: "Good fit",
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
      },
      {
        id: "p2",
        name: "Profile Two",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    listEmailsForPpa.mockResolvedValueOnce([
      {
        id: "e1",
        per_profile_application_id: "ppa1",
        kind: "follow_up",
        content: "Existing email",
        lifecycle_status: "drafted",
        sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    listEmailsForPpa.mockRejectedValueOnce(new Error("email fetch failed"));

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findAllByText("Email body");
    const emptyStates = await screen.findAllByText("No emails yet.");
    expect(emptyStates).toHaveLength(1);
  });

  it("renders email HTML content and strips unsafe tags", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
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
        cold_email_plan: {
          subjects: ["Quick intro", "LLM reliability for legal workflows", "15-minute chat?"],
          selected_subject_index: 1,
          to: { title: "Hiring Manager", name: "Benjamin", email: "benjamin@lawgoat.com" },
          status: "ready"
        },
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
        content:
          "&lt;p&gt;Hi Benjamin,&lt;/p&gt;&lt;p&gt;Hello &lt;strong&gt;team&lt;/strong&gt;.&lt;/p&gt;&lt;script&gt;alert('xss')&lt;/script&gt;",
        lifecycle_status: "drafted",
        sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);

    const { container } = render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText("Email body"));
    await screen.findByText("Hi Benjamin,");
    expect(screen.getByRole("heading", { name: "Review summary" })).toBeInTheDocument();
    const recipientHeading = screen.getAllByRole("heading", { name: "Recipient" })[0];
    const outreachHeading = screen.getAllByRole("heading", { name: "Outreach plan" })[0];
    expect(recipientHeading.compareDocumentPosition(outreachHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByText("Subject options").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Email body").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Quick intro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LLM reliability for legal workflows").length).toBeGreaterThan(0);
    expect(screen.getAllByText("15-minute chat?").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Subject:").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Recipient:").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hiring Manager - Benjamin (benjamin@lawgoat.com)").length).toBeGreaterThan(0);
    const emphasis = screen.getByText("team");
    expect(emphasis.tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
  });

  it("links company name to company detail and shows go-to-job-post link", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      email_sent: false,
      job_post: {
        job_link: "https://example.com/jobs/123"
      },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    getCompany.mockResolvedValueOnce({
      id: "c1",
      name: "Acme",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    listPerProfileApplications.mockResolvedValueOnce([]);
    listProfiles.mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const companyLink = await screen.findByRole("link", { name: "Acme" });
    expect(companyLink).toHaveAttribute("href", "/companies/c1");

    const jobPostLink = screen.getByRole("link", { name: "Go to post" });
    expect(jobPostLink).toHaveAttribute("href", "https://example.com/jobs/123");
  });

  it("updates active subject when user clicks subject badge", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
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
        cold_email_plan: {
          subjects: ["Subject A", "Subject B", "Subject C"],
          selected_subject_index: 0,
          to: { title: "Hiring Manager", name: "Benjamin", email: "benjamin@lawgoat.com" },
          status: "ready"
        },
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
        kind: "cold",
        content: "<p>Body</p>",
        lifecycle_status: "drafted",
        sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    updatePerProfileApplication.mockResolvedValue({
      id: "ppa1",
      application_id: "a1",
      profile_id: "p1",
      order_index: 1,
      analysis: "Strong fit",
      cold_email_plan: {
        subjects: ["Subject A", "Subject B", "Subject C"],
        selected_subject_index: 2,
        to: { title: "Hiring Manager", name: "Benjamin", email: "benjamin@lawgoat.com" },
        status: "ready"
      },
      applied: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findAllByRole("button", { name: "Subject A" });
    fireEvent.click(screen.getAllByRole("button", { name: "Subject C" })[0]);

    await waitFor(() => {
      expect(updatePerProfileApplication).toHaveBeenCalledWith("ppa1", {
        cold_email_plan: {
          subjects: ["Subject A", "Subject B", "Subject C"],
          selected_subject_index: 2,
          to: { title: "Hiring Manager", name: "Benjamin", email: "benjamin@lawgoat.com" },
          status: "ready"
        }
      });
    });
    expect(screen.getAllByText("Subject C").length).toBeGreaterThanOrEqual(2);
  });

  it("allows editing recipient and syncs changes", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
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
        cold_email_plan: {
          subjects: ["Subject A", "Subject B"],
          selected_subject_index: 0,
          to: { title: "Hiring Manager", name: "Benjamin", email: "benjamin@lawgoat.com" },
          status: "ready"
        },
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
        kind: "cold",
        content: "<p>Body</p>",
        lifecycle_status: "drafted",
        sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    updatePerProfileApplication.mockResolvedValue({
      id: "ppa1",
      application_id: "a1",
      profile_id: "p1",
      order_index: 1,
      analysis: "Strong fit",
      cold_email_plan: {
        subjects: ["Subject A", "Subject B"],
        selected_subject_index: 0,
        to: { title: "CTO", name: "Benjamin Kim", email: "bk@lawgoat.com", timezone: "America/Chicago" },
        status: "ready"
      },
      applied: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByRole("button", { name: "Edit recipient" });
    fireEvent.click(screen.getByRole("button", { name: "Edit recipient" }));
    fireEvent.change(screen.getByLabelText("Recipient title"), { target: { value: "CTO" } });
    fireEvent.change(screen.getByLabelText("Recipient name"), { target: { value: "Benjamin Kim" } });
    fireEvent.change(screen.getByLabelText("Recipient email"), { target: { value: "bk@lawgoat.com" } });
    fireEvent.change(screen.getByLabelText("Recipient timezone"), { target: { value: "America/Chicago" } });
    fireEvent.click(screen.getByRole("button", { name: "Save recipient" }));

    await waitFor(() => {
      expect(updatePerProfileApplication).toHaveBeenCalledWith("ppa1", {
        cold_email_plan: {
          subjects: ["Subject A", "Subject B"],
          selected_subject_index: 0,
          to: { title: "CTO", name: "Benjamin Kim", email: "bk@lawgoat.com", timezone: "America/Chicago" },
          status: "ready"
        }
      });
    });
    expect(
      screen.getAllByText("CTO - Benjamin Kim (bk@lawgoat.com) · America/Chicago").length
    ).toBeGreaterThan(0);
  });

  it("shows unmark actions when application and email are already marked", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
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
    expect(screen.getByText("Sent: 2026-01-02T00:00:00Z")).toBeInTheDocument();
  });

  it("disables application mark actions while saving and shows inline failures", async () => {
    getApplication.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      email_sent: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    getCompany.mockResolvedValue({
      id: "c1",
      name: "Acme",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    listPerProfileApplications.mockResolvedValue([]);
    listProfiles.mockResolvedValue([]);
    let rejectMark: (error: Error) => void = () => undefined;
    markApplied.mockReturnValue(new Promise((_, reject) => {
      rejectMark = reject;
    }));

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    const markButton = await screen.findByRole("button", { name: "Mark applied" });
    fireEvent.click(markButton);
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();

    rejectMark(new Error("mark failed"));
    expect(await screen.findByText("mark failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark applied" })).not.toBeDisabled();
  });

  it("unmarks application applied, application email-sent, and per-profile email-sent", async () => {
    getApplication.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
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
    markApplied.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      applied_at: null,
      email_sent: true,
      email_sent_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    });
    markApplicationEmailSent.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      applied_at: null,
      email_sent: false,
      email_sent_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    });
    markEmailSent.mockResolvedValue({
      id: "e1",
      per_profile_application_id: "ppa1",
      kind: "follow_up",
      content: "Sent email",
      lifecycle_status: "sent",
      sent: false,
      sent_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    });

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Unmark applied" }));
    expect(markApplied).toHaveBeenCalledWith("a1", false);

    const unmarkEmailButtons = screen.getAllByRole("button", { name: "Unmark email sent" });
    fireEvent.click(unmarkEmailButtons[0]);
    await waitFor(() => {
      expect(markApplicationEmailSent).toHaveBeenCalledWith("a1", false);
    });

    fireEvent.click(screen.getByRole("button", { name: "Unmark email sent" }));
    await waitFor(() => {
      expect(markEmailSent).toHaveBeenCalledWith("e1", false);
    });
  });

  it("marks per-profile email sent without refetching the full detail payload", async () => {
    getApplication.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      email_sent: false,
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
        content: "Draft email",
        lifecycle_status: "drafted",
        sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    markEmailSent.mockResolvedValue({
      id: "e1",
      per_profile_application_id: "ppa1",
      kind: "follow_up",
      content: "Draft email",
      lifecycle_status: "drafted",
      sent: true,
      sent_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    });
    markApplicationEmailSent.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      email_sent: true,
      email_sent_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    });

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Email body");
    expect(getApplicationDetail).toHaveBeenCalledTimes(1);

    const markEmailButtons = screen.getAllByRole("button", { name: "Mark email sent" });
    fireEvent.click(markEmailButtons[1]);

    expect(markEmailSent).toHaveBeenCalledWith("e1", true);
    expect(getApplicationDetail).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Sent: 2026-01-02T00:00:00Z")).toBeInTheDocument();
  });

  it("locks an email row while its sent action is in flight", async () => {
    getApplication.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      email_sent: false,
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
        content: "Draft email",
        lifecycle_status: "drafted",
        sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    markEmailSent.mockReturnValue(new Promise(() => undefined));

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Email body");
    const markButtons = screen.getAllByRole("button", { name: "Mark email sent" });
    fireEvent.click(markButtons[markButtons.length - 1]);

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete email" })).toBeDisabled();
  });

  it("hides default not-sent text and keeps subjects collapsible", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
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
        cold_email_plan: {
          subjects: ["Subject A", "Subject B"],
          selected_subject_index: 0,
          to: { title: "Hiring Manager", name: "Benjamin", email: "benjamin@lawgoat.com" },
          status: "ready"
        },
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
        kind: "cold",
        content: "<p>Body</p>",
        lifecycle_status: "drafted",
        sent: false,
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

    expect((await screen.findAllByText("Subject:")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sent: Not sent/i)).not.toBeInTheDocument();
    expect(screen.getByText("Subject options")).toBeInTheDocument();
  });

  it("deletes email after modal confirmation and disables submit while deleting", async () => {
    let releaseDelete!: () => void;
    getApplication.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      email_sent: false,
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
        lifecycle_status: "drafted",
        sent: false,
        to: { title: "Hiring Manager", name: "Benjamin", email: "benjamin@lawgoat.com" },
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    deleteEmail.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseDelete = () => resolve();
      })
    );

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findByText("Email body");
    const deleteButtons = screen.getAllByRole("button", { name: "Delete email" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);
    expect(screen.getByText("Delete email?")).toBeInTheDocument();
    expect(screen.getAllByText(/follow_up/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Profile One/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Hiring Manager - Benjamin/).length).toBeGreaterThan(0);

    const modalDeleteButtons = screen.getAllByRole("button", { name: "Delete email" });
    fireEvent.click(modalDeleteButtons[modalDeleteButtons.length - 1]);
    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled();
    expect(deleteEmail).toHaveBeenCalledWith("e1");

    releaseDelete();
    await waitFor(() => {
      expect(screen.getByText("No emails yet.")).toBeInTheDocument();
    });
  });

  it("shows application status as plain text (no dropdown)", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      email_sent: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    getCompany.mockResolvedValueOnce({
      id: "c1",
      name: "Acme",
      research_status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    listPerProfileApplications.mockResolvedValueOnce([]);
    listProfiles.mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Application ready")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Application status" })).not.toBeInTheDocument();
  });

  it("shows Clear next to status when status is not company research pending", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      email_sent: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    getCompany.mockResolvedValueOnce({
      id: "c1",
      name: "Acme",
      research_status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    listPerProfileApplications.mockResolvedValueOnce([]);
    listProfiles.mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Reset preparation" })).toBeInTheDocument();
  });

  it("does not show Clear when status is company research pending", async () => {
    getApplication.mockResolvedValueOnce({
      id: "a1",
      company_id: "c1",
      status: "company_research_pending",
      applied: false,
      email_sent: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    getCompany.mockResolvedValueOnce({
      id: "c1",
      name: "Acme",
      research_status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
    listPerProfileApplications.mockResolvedValueOnce([]);
    listProfiles.mockResolvedValueOnce([]);

    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Company research pending")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset preparation" })).not.toBeInTheDocument();
  });
});

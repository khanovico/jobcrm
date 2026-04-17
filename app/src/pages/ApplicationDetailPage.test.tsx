import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationDetailPage } from "./ApplicationDetailPage";

const {
  getApplication,
  getCompany,
  listPerProfileApplications,
  listProfiles,
  listEmailsForPpa,
  updatePerProfileApplication,
  markApplied,
  markApplicationEmailSent,
  markEmailSent
} = vi.hoisted(() => ({
  getApplication: vi.fn(),
  getCompany: vi.fn(),
  listPerProfileApplications: vi.fn(),
  listProfiles: vi.fn(),
  listEmailsForPpa: vi.fn(),
  updatePerProfileApplication: vi.fn(),
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
    updatePerProfileApplication,
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
    updatePerProfileApplication.mockReset();
    markApplied.mockReset();
    markApplicationEmailSent.mockReset();
    markEmailSent.mockReset();
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

    await screen.findByText("Second email");
    const target = document.getElementById("email-e2");
    expect(target).not.toBeNull();
    expect(target?.className).toContain("ring-2");
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it("keeps showing other emails when one per-profile email request fails", async () => {
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

    await screen.findByText("Existing email");
    const emptyStates = await screen.findAllByText("No emails yet.");
    expect(emptyStates).toHaveLength(1);
  });

  it("renders email HTML content and strips unsafe tags", async () => {
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

    await screen.findByText("Hi Benjamin,");
    expect(screen.getAllByText("Subjects").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Quick intro").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LLM reliability for legal workflows").length).toBeGreaterThan(0);
    expect(screen.getAllByText("15-minute chat?").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Active:").length).toBeGreaterThan(0);
    expect(screen.getAllByText("To:").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Hiring Manager Benjamin <benjamin@lawgoat.com>").length).toBeGreaterThan(0);
    const emphasis = screen.getByText("team");
    expect(emphasis.tagName).toBe("STRONG");
    expect(container.querySelector("script")).toBeNull();
  });

  it("updates active subject when user clicks subject badge", async () => {
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

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findAllByRole("button", { name: "Subject A" });
    await user.click(screen.getAllByRole("button", { name: "Subject C" })[0]);

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
    expect(screen.getAllByText("Subject C")).toHaveLength(2);
  });

  it("allows editing recipient and syncs changes", async () => {
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
        to: { title: "CTO", name: "Benjamin Kim", email: "bk@lawgoat.com" },
        status: "ready"
      },
      applied: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/applications/a1"]}>
        <Routes>
          <Route path="/applications/:applicationId" element={<ApplicationDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    await screen.findAllByRole("button", { name: "Edit recipient" });
    await user.click(screen.getAllByRole("button", { name: "Edit recipient" })[0]);
    await user.clear(screen.getByLabelText("Recipient title"));
    await user.type(screen.getByLabelText("Recipient title"), "CTO");
    await user.clear(screen.getByLabelText("Recipient name"));
    await user.type(screen.getByLabelText("Recipient name"), "Benjamin Kim");
    await user.clear(screen.getByLabelText("Recipient email"));
    await user.type(screen.getByLabelText("Recipient email"), "bk@lawgoat.com");
    await user.click(screen.getByRole("button", { name: "Save recipient" }));

    await waitFor(() => {
      expect(updatePerProfileApplication).toHaveBeenCalledWith("ppa1", {
        cold_email_plan: {
          subjects: ["Subject A", "Subject B"],
          selected_subject_index: 0,
          to: { title: "CTO", name: "Benjamin Kim", email: "bk@lawgoat.com" },
          status: "ready"
        }
      });
    });
    expect(screen.getByText("CTO Benjamin Kim <bk@lawgoat.com>")).toBeInTheDocument();
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

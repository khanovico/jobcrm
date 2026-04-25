import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api";
import { DashboardPage } from "./DashboardPage";

vi.mock("../api", () => ({
  api: {
    getDashboardMetrics: vi.fn(),
    globalSearch: vi.fn()
  }
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.mocked(api.getDashboardMetrics).mockReset();
    vi.mocked(api.globalSearch).mockReset();
    vi.mocked(api.getDashboardMetrics).mockResolvedValue({
      company_research_pipeline: 4,
      application_ready: 2,
      actions_need_review: 3,
      unread_notifications: 5
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows actionable metric links and recognizable application search rows", async () => {
    vi.mocked(api.globalSearch).mockResolvedValue({
      companies: [
        {
          id: "company-1",
          name: "Acme Labs",
          research_status: "indexed",
          created_at: "2026-02-01T00:00:00Z",
          updated_at: "2026-02-03T00:00:00Z"
        }
      ],
      profiles: [
        {
          id: "profile-1",
          name: "Jordan Candidate",
          location: "Remote",
          email: "jordan@example.com",
          phone: "123",
          created_at: "2026-02-01T00:00:00Z",
          updated_at: "2026-02-03T00:00:00Z"
        }
      ],
      applications: [
        {
          id: "application-1",
          company_id: "company-1",
          company_name: "Acme Labs",
          status: "application_ready",
          updated_at: "2026-02-03T15:45:00Z",
          job_link: "https://jobs.example.com/acme-platform",
          job_title: "Senior Platform Engineer",
          job_description_excerpt: "Build faster search and dashboard workflows for application tracking."
        }
      ]
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review companies" })).toHaveAttribute(
      "href",
      "/companies?research_status=pending"
    );
    expect(screen.getByRole("link", { name: "Open ready applications" })).toHaveAttribute(
      "href",
      "/applications?status=application_ready"
    );

    await userEvent.type(screen.getByRole("textbox", { name: "Search dashboard" }), "  platform  ");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(api.globalSearch).toHaveBeenCalledWith("platform");
    });

    expect(await screen.findByText("Senior Platform Engineer")).toBeInTheDocument();
    expect(screen.getByText("Application Ready")).toBeInTheDocument();
    expect(screen.getByText("Build faster search and dashboard workflows for application tracking.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Company record" })).toHaveAttribute("href", "/companies/company-1");
    expect(screen.getByRole("link", { name: "Job post" })).toHaveAttribute(
      "href",
      "https://jobs.example.com/acme-platform"
    );
  });

  it("shows busy and empty states for search", async () => {
    let resolveSearch: ((value: Awaited<ReturnType<typeof api.globalSearch>>) => void) | null = null;
    vi.mocked(api.globalSearch).mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      })
    );

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await screen.findByText("5");
    await userEvent.type(screen.getByRole("textbox", { name: "Search dashboard" }), "Nope");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(screen.getByRole("button", { name: "Searching..." })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Searching across dashboard records...");

    resolveSearch?.({ companies: [], profiles: [], applications: [] });

    expect(await screen.findByText('No matches for "Nope".')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});

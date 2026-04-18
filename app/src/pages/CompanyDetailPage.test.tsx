import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompanyDetailPage } from "./CompanyDetailPage";
import type { Company } from "../types";

const { getCompany, listApplications, listIndustries, getCompanyApplicationCount } = vi.hoisted(() => ({
  getCompany: vi.fn(),
  listApplications: vi.fn(),
  listIndustries: vi.fn(),
  getCompanyApplicationCount: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    getCompany,
    listApplications,
    listIndustries,
    updateCompany: vi.fn(),
    deleteCompany: vi.fn(),
    clearCompanyResearchDetail: vi.fn(),
    getCompanyApplicationCount
  }
}));

const baseCompany = (overrides: Partial<Company> = {}): Company => ({
  id: "co1",
  name: "Acme Corp",
  research_status: "pending",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides
});

function renderPage(companyId = "co1") {
  return render(
    <MemoryRouter initialEntries={[`/companies/${companyId}`]}>
      <Routes>
        <Route path="/companies/:companyId" element={<CompanyDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CompanyDetailPage", () => {
  beforeEach(() => {
    getCompany.mockReset();
    listApplications.mockReset();
    listIndustries.mockReset();
    getCompanyApplicationCount.mockReset();
    listApplications.mockResolvedValue([]);
    listIndustries.mockResolvedValue([]);
    getCompanyApplicationCount.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows read-only Overview and Full Company Detail when research_status is indexed", async () => {
    getCompany.mockResolvedValue(
      baseCompany({
        research_status: "indexed",
        overview: "Public overview body",
        full_overview: "https://example.com/full-detail"
      })
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Acme Corp" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    });
    // Read-only paragraph + edit textarea both show the same copy.
    expect(screen.getAllByText("Public overview body")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Full Company Detail" })).toHaveAttribute(
      "href",
      "https://example.com/full-detail"
    );
    expect(screen.getByText("Indexed")).toBeInTheDocument();
  });

  it("hides read-only enrichment summary when research_status is pending but data exists", async () => {
    getCompany.mockResolvedValue(
      baseCompany({
        research_status: "pending",
        overview: "Still in DB",
        full_overview: "https://example.com/full-detail",
        analysis_links: [{ topic: "T", link: "https://a.example" }],
        enrichment_source_links: ["https://src.example"]
      })
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Acme Corp" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Full Company Detail" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Analysis links" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Enrichment sources" })).not.toBeInTheDocument();

    expect(
      screen.getByText(/hidden while research status is not Indexed/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();

    // Read-only card does not render overview; value only in the edit form.
    expect(screen.getByDisplayValue("Still in DB")).toBeInTheDocument();
  });

  it("does not show the enrichment-hidden note when pending and no stored enrichment", async () => {
    getCompany.mockResolvedValue(
      baseCompany({
        research_status: "pending",
        overview: null,
        full_overview: null,
        analysis_links: [],
        enrichment_source_links: []
      })
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Acme Corp" })).toBeInTheDocument();
    });

    expect(screen.queryByText(/hidden while research status is not Indexed/i)).not.toBeInTheDocument();
  });

  it("shows analysis and enrichment sections when indexed", async () => {
    getCompany.mockResolvedValue(
      baseCompany({
        research_status: "indexed",
        overview: "Overview for analysis-links test",
        analysis_links: [{ topic: "Culture", link: "https://culture.example" }],
        enrichment_source_links: ["https://enrich.example/doc"]
      })
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Analysis links" })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Enrichment sources" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://enrich.example/doc" })).toBeInTheDocument();
  });
});

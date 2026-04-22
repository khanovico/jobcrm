import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetIndustryCatalogCacheForTests } from "../state/industryCatalog";
import { CompanyDetailPage } from "./CompanyDetailPage";
import type { Company } from "../types";

const { getCompany, listApplications, listIndustries, getCompanyApplicationCount } = vi.hoisted(() => ({
  getCompany: vi.fn(),
  listApplications: vi.fn(),
  listIndustries: vi.fn(),
  getCompanyApplicationCount: vi.fn()
}));

vi.mock("../components/ClearCompanyResearchModal", () => ({
  ClearCompanyResearchModal: () => null
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
    resetIndustryCatalogCacheForTests();
    cleanup();
  });

  it("shows read-only Overview and full detail links when research_status is indexed", async () => {
    getCompany.mockResolvedValue(
      baseCompany({
        research_status: "indexed",
        overview: "Public overview body",
        full_product_detail: "https://example.com/product-detail",
        full_hiring_detail: "https://example.com/hiring-detail",
        full_organization_detail: "https://example.com/organization-detail"
      })
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Acme Corp" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    });
    // Read-only paragraph + edit textarea both show the same copy.
    expect(screen.getAllByText("Public overview body")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Full Product Detail" })).toHaveAttribute(
      "href",
      "https://example.com/product-detail"
    );
    expect(screen.getByRole("link", { name: "Full Hiring Detail" })).toHaveAttribute(
      "href",
      "https://example.com/hiring-detail"
    );
    expect(screen.getByRole("link", { name: "Full Organization Detail" })).toHaveAttribute(
      "href",
      "https://example.com/organization-detail"
    );
    expect(screen.getByText("Indexed")).toBeInTheDocument();
  });

  it("hides read-only enrichment summary when research_status is pending but data exists", async () => {
    getCompany.mockResolvedValue(
      baseCompany({
        research_status: "pending",
        overview: "Still in DB",
        full_product_detail: "https://example.com/product-detail",
        full_hiring_detail: "https://example.com/hiring-detail",
        full_organization_detail: "https://example.com/organization-detail",
        analysis_links: [{ topic: "T", link: "https://a.example" }],
        enrichment_source_links: ["https://src.example"]
      })
    );
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Acme Corp" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Full Product Detail" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Full Hiring Detail" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Full Organization Detail" })).not.toBeInTheDocument();
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
        full_product_detail: null,
        full_hiring_detail: null,
        full_organization_detail: null,
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

  it("reuses cached industries when revisiting company detail", async () => {
    getCompany.mockResolvedValue(baseCompany());
    listIndustries.mockResolvedValue([
      {
        id: "ind-1",
        name: "FinTech",
        description: "Finance",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);

    const firstMount = renderPage();
    await screen.findByRole("heading", { level: 2, name: "Acme Corp" });
    firstMount.unmount();

    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Acme Corp" });

    expect(listIndustries).toHaveBeenCalledTimes(1);
  });

  it("paginates company applications", async () => {
    getCompany.mockResolvedValue(baseCompany());
    const firstPageApplications = Array.from({ length: 20 }, (_, index) => ({
      id: `a-${index + 1}`,
      company_id: "co1",
      status: "application_ready",
      applied: false,
      email_sent: false,
      applied_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    }));
    const secondPageApplications = [
      {
        id: "a-21",
        company_id: "co1",
        status: "archived",
        applied: true,
        email_sent: false,
        applied_at: "2026-02-01T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-02-01T00:00:00Z"
      }
    ];
    listApplications.mockImplementation((params?: URLSearchParams) => {
      if (params?.get("skip") === "20") {
        return Promise.resolve(secondPageApplications);
      }
      return Promise.resolve(firstPageApplications);
    });

    renderPage();

    expect(await screen.findByText("Page 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page 2")).toBeInTheDocument();
    expect(screen.getByText("archived")).toBeInTheDocument();
    expect(screen.getByText("2026-02-01T00:00:00Z")).toBeInTheDocument();
  });
});

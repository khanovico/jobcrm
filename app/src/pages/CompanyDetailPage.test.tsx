import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetIndustryCatalogCacheForTests } from "../state/industryCatalog";
import { CompanyDetailPage } from "./CompanyDetailPage";
import type { Company } from "../types";

const { getCompany, listApplications, listIndustryOptions, getCompanyApplicationCount, markApplied, updateCompany } = vi.hoisted(
  () => ({
    getCompany: vi.fn(),
    listApplications: vi.fn(),
    listIndustryOptions: vi.fn(),
    getCompanyApplicationCount: vi.fn(),
    markApplied: vi.fn(),
    updateCompany: vi.fn()
  })
);

vi.mock("../components/ClearCompanyResearchModal", () => ({
  ClearCompanyResearchModal: () => null
}));

vi.mock("../components/ApplicationWorkflowOverrideModal", () => ({
  ApplicationWorkflowOverrideModal: () => null
}));

vi.mock("../api", () => ({
  api: {
    getCompany,
    listApplications,
    listIndustryOptions,
    updateCompany,
    deleteCompany: vi.fn(),
    clearCompanyResearchDetail: vi.fn(),
    getCompanyApplicationCount,
    markApplied
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
    listIndustryOptions.mockReset();
    getCompanyApplicationCount.mockReset();
    markApplied.mockReset();
    updateCompany.mockReset();
    listApplications.mockResolvedValue([]);
    listIndustryOptions.mockResolvedValue({ selected: [], options: [] });
    getCompanyApplicationCount.mockResolvedValue({ count: 0 });
    markApplied.mockResolvedValue({ id: "a1", applied: true } as never);
    updateCompany.mockResolvedValue(baseCompany() as never);
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
    expect(screen.getAllByText("Public overview body")).toHaveLength(1);
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
    const researchLine = screen.getByText("Research status:").parentElement!;
    expect(within(researchLine).getByText("Indexed")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Edit" }));
    expect(screen.getByDisplayValue("Public overview body")).toBeInTheDocument();
  });

  it("keeps applications and edit-only industry options lazy on initial review render", async () => {
    getCompany.mockResolvedValue(baseCompany({ industry_ids: ["ind-250"] }));

    renderPage();

    await screen.findByRole("heading", { level: 2, name: "Acme Corp" });
    expect(screen.getByRole("tab", { name: "Review" })).toHaveAttribute("aria-selected", "true");
    expect(listApplications).not.toHaveBeenCalled();
    expect(listIndustryOptions).not.toHaveBeenCalled();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
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

    expect(screen.getByText("Stored enrichment hidden from indexed review")).toBeInTheDocument();
    const researchLine = screen.getByText("Research status:").parentElement!;
    expect(within(researchLine).getByText("Pending")).toBeInTheDocument();

    expect(screen.queryByDisplayValue("Still in DB")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Stored enrichment hidden from indexed review"));
    expect(screen.getByText(/Research status is Pending/i)).toBeInTheDocument();
    expect(screen.getByText("Still in DB")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://a.example" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "https://src.example" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Review stored enrichment in edit mode" }));
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

    expect(screen.queryByText("Stored enrichment hidden from indexed review")).not.toBeInTheDocument();
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

  it("hydrates selected industries without fetching the full catalog", async () => {
    getCompany.mockResolvedValue(baseCompany({ industry_ids: ["ind-250"] }));
    listIndustryOptions.mockResolvedValue({
      selected: [
        {
          id: "ind-250",
          name: "Late Catalog Industry",
          description: "",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z"
        }
      ],
      options: [
        {
          id: "ind-1",
          name: "FinTech",
          description: "Finance",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z"
        }
      ]
    });

    renderPage();
    await screen.findByRole("heading", { level: 2, name: "Acme Corp" });
    expect(listIndustryOptions).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("tab", { name: "Edit" }));
    await waitFor(() => {
      expect(screen.getAllByText("Late Catalog Industry").length).toBeGreaterThan(0);
    });
    expect(listIndustryOptions).toHaveBeenCalledTimes(1);
    const hydratedCall = listIndustryOptions.mock.calls
      .map((call) => call[0] as URLSearchParams)
      .find((params) => params.getAll("ids").includes("ind-250"));
    expect(hydratedCall).toBeTruthy();
    expect(hydratedCall?.get("limit")).toBe("20");
  });

  it("paginates company applications", async () => {
    getCompany.mockResolvedValue(baseCompany());
    const firstPageApplications = Array.from({ length: 21 }, (_, index) => ({
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

    await userEvent.click(await screen.findByRole("tab", { name: "Applications" }));
    expect(await screen.findByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Current page, page 2" })).toBeInTheDocument();
    });
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("2026-02-01T00:00:00Z")).toBeInTheDocument();
  });

  it("shows application action failures in the applications section", async () => {
    getCompany.mockResolvedValue(baseCompany());
    listApplications.mockResolvedValue([
      {
        id: "a-1",
        company_id: "co1",
        status: "application_ready",
        applied: false,
        email_sent: false,
        applied_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]);
    markApplied.mockRejectedValue(new Error("Application update failed"));

    renderPage();

    await userEvent.click(await screen.findByRole("tab", { name: "Applications" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mark applied" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Application update failed");
    expect(screen.getByRole("heading", { name: "Applications" })).toBeInTheDocument();
  });

  it("shows save failures in the edit section", async () => {
    getCompany.mockResolvedValue(baseCompany({ name: "Acme Corp" }));
    updateCompany.mockRejectedValue(new Error("Company save failed"));

    renderPage();

    await userEvent.click(await screen.findByRole("tab", { name: "Edit" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Name" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Acme Updated");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Company save failed");
    expect(screen.getByRole("heading", { name: "Edit company" })).toBeInTheDocument();
  });
});

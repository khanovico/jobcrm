import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetCompanySummariesCacheForTests } from "../state/companySummaries";
import { resetWorkerSummaryCacheForTests } from "../state/workerState";
import { CompaniesPage } from "./CompaniesPage";

const WORKER_STATE = {
  settings: { max_company_researcher: 1, max_ppa_analyser: 1, max_application_drafter: 1 },
  active: { company_researcher: 0, ppa_analyser: 0, application_drafter: 0 },
  max: { company_researcher: 1, ppa_analyser: 1, application_drafter: 1 }
};

describe("CompaniesPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    resetCompanySummariesCacheForTests();
    resetWorkerSummaryCacheForTests();
    vi.unstubAllGlobals();
  });

  it("navigates to company detail when a table row is clicked", async () => {
    const fetchMock = vi.mocked(fetch);
    const companyRow = {
      id: "c1",
      name: "Acme Corp",
      has_application: true,
      research_status: "indexed",
      website: "https://acme.example",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/companies/summary")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter initialEntries={["/companies"]}>
        <Routes>
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/:companyId" element={<div data-testid="company-detail">Detail page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme Corp" })).toBeInTheDocument();
    expect(screen.getAllByText("Indexed").some((el) => el.tagName === "SPAN")).toBe(true);
    expect(screen.getAllByText("Has application records").some((el) => el.classList.contains("badge"))).toBe(true);
    expect(screen.getAllByText("Applications").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("row", { name: /Acme Corp/i }));
    expect(await screen.findByTestId("company-detail")).toBeInTheDocument();
  });

  it("reuses cached company page data when revisiting the companies page", async () => {
    const fetchMock = vi.mocked(fetch);
    const companyRow = {
      id: "c1",
      name: "Acme Corp",
      has_application: true,
      research_status: "indexed",
      website: "https://acme.example",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/companies/summary")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    const firstMount = render(
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme Corp" })).toBeInTheDocument();
    firstMount.unmount();

    render(
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme Corp" })).toBeInTheDocument();

    const companyCalls = fetchMock.mock.calls
      .map(([input]) => (typeof input === "string" ? input : input.toString()))
      .filter((url) => url.includes("/api/v1/companies/summary"));
    expect(companyCalls).toHaveLength(1);
  });

  it("requests companies with default sort and filters in query string", async () => {
    const fetchMock = vi.mocked(fetch);
    const companyRow = {
      id: "c1",
      name: "Acme Corp",
      has_application: false,
      research_status: "indexed",
      website: "https://acme.example",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/companies/summary")) {
        const u = new URL(url);
        expect(u.searchParams.get("sort")).toBe("updated_at_desc");
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      const calls = fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => url.includes("/api/v1/companies/summary"));
      expect(calls.some((url) => new URL(url).searchParams.get("sort") === "updated_at_desc")).toBe(true);
    });

    expect(screen.getAllByText("No application records").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "No application records" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("option", { name: "Has application records" }).length).toBeGreaterThan(0);
    const calledUrls = fetchMock.mock.calls.map(([input]) =>
      typeof input === "string" ? input : input.toString()
    );
    expect(calledUrls.some((url) => url.includes("/api/v1/companies/summary"))).toBe(true);
    expect(calledUrls.some((url) => url.includes("/api/v1/settings/workers"))).toBe(false);
    expect(calledUrls.filter((url) => url.includes("/api/v1/workers/summary"))).toHaveLength(1);
  });

  it("refreshes cached company summaries when the tab returns to the foreground", async () => {
    const fetchMock = vi.mocked(fetch);
    const initialCompany = {
      id: "c1",
      name: "Acme Corp",
      has_application: false,
      research_status: "pending",
      website: "https://acme.example",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    };
    const refreshedCompany = {
      ...initialCompany,
      has_application: true,
      research_status: "indexed",
      updated_at: "2026-01-02T00:00:00Z"
    };
    let summaryCalls = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/companies/summary")) {
        summaryCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify([summaryCalls > 1 ? refreshedCompany : initialCompany]), {
            status: 200
          })
        );
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Pending")).toBeInTheDocument();
    fireEvent.focus(window);
    fireEvent(document, new Event("visibilitychange"));

    await waitFor(() => {
      expect(summaryCalls).toBe(2);
      expect(screen.getAllByText("Indexed").some((el) => el.tagName === "SPAN")).toBe(true);
    });
  });

  it("creates an application from the company row Apply action", async () => {
    const fetchMock = vi.mocked(fetch);
    const companyRow = {
      id: "c1",
      name: "Acme Corp",
      has_application: false,
      research_status: "indexed",
      website: "https://acme.example",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    };
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/v1/applications") && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "a1",
              company_id: "c1",
              status: "ppa_pending",
              applied: false,
              email_sent: false,
              created_at: "2026-01-03T00:00:00Z",
              updated_at: "2026-01-03T00:00:00Z"
            }),
            { status: 201 }
          )
        );
      }
      if (url.includes("/api/v1/companies/summary")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <CompaniesPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme Corp" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("Using existing company: Acme Corp")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input]) =>
        String(input).endsWith("/api/v1/applications")
      );
      expect(createCall).toBeTruthy();
      expect(JSON.parse((createCall![1] as RequestInit).body as string)).toMatchObject({
        company_id: "c1"
      });
    });
  });
});

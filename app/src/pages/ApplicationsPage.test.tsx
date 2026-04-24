import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppliedProfilesFilterSelectionForTests } from "../state/applicationsFilters";
import {
  getCompanySummariesPage,
  resetCompanySummariesCacheForTests
} from "../state/companySummaries";
import { resetWorkerSummaryCacheForTests } from "../state/workerState";
import { ApplicationsPage } from "./ApplicationsPage";

const WORKER_STATE = {
  settings: { max_company_researcher: 1, max_ppa_analyser: 1, max_application_drafter: 1 },
  active: { company_researcher: 0, ppa_analyser: 0, application_drafter: 0 },
  max: { company_researcher: 1, ppa_analyser: 1, application_drafter: 1 }
};

describe("ApplicationsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    resetAppliedProfilesFilterSelectionForTests();
    resetCompanySummariesCacheForTests();
    resetWorkerSummaryCacheForTests();
    vi.unstubAllGlobals();
  });

  const isApplicationsListRequest = (url: string) => url.split("?")[0].endsWith("/applications");
  const isApplicationsFacetRequest = (url: string) =>
    url.split("?")[0].endsWith("/applications/applied-profile-facets");

  const companyRow = {
    id: "c1",
    name: "Acme",
    research_status: "indexed",
    created_at: "",
    updated_at: ""
  };
  const applicationRow = {
    id: "a1",
    company_id: "c1",
    company_name: "Acme",
    status: "application_ready",
    applied: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    applied_profiles: [] as { profile_name: string }[]
  };

  it("navigates to application detail when a table row is clicked", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter initialEntries={["/applications"]}>
        <Routes>
          <Route path="/applications" element={<ApplicationsPage />} />
          <Route path="/applications/:applicationId" element={<div data-testid="app-detail">Detail</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("row", { name: /Acme/i }));
    expect(await screen.findByTestId("app-detail")).toBeInTheDocument();
  });

  it("requests applications with sort=updated_at_desc by default", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        const parsed = new URL(url, "http://localhost");
        expect(parsed.searchParams.get("sort")).toBe("updated_at_desc");
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    await screen.findByRole("cell", { name: "Acme" });
  });

  it("opens Set application status from the actions column", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    await screen.findByRole("cell", { name: "Acme" });
    await userEvent.click(screen.getByRole("button", { name: "Set status…" }));
    expect(screen.getByRole("heading", { name: "Set application status" })).toBeInTheDocument();
  });

  it("opens new application modal with typed company name and explicit bounded company search", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/api/v1/companies/summary")) {
        const search = new URL(url).searchParams.get("search");
        if (search === "Beta") {
          return Promise.resolve(
            new Response(JSON.stringify([{ ...companyRow, id: "c2", name: "Beta Labs" }]), { status: 200 })
          );
        }
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Applications" });
    await userEvent.click(screen.getByRole("button", { name: "New application" }));
    expect(await screen.findByRole("heading", { name: "New application", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Use an existing company (optional)" })).toBeInTheDocument();

    const initialCompanyCalls = fetchMock.mock.calls
      .map(([input]) => (typeof input === "string" ? input : input.toString()))
      .filter((url) => url.includes("/api/v1/companies/summary"));
    expect(initialCompanyCalls).toHaveLength(0);

    fireEvent.change(screen.getByRole("textbox", { name: "Use an existing company (optional)" }), {
      target: { value: "Beta" }
    });

    await waitFor(() => {
      const companyCalls = fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => url.includes("/api/v1/companies/summary"));
      expect(companyCalls.some((url) => url.includes("search=Beta"))).toBe(true);
      expect(companyCalls.every((url) => url.includes("limit=20"))).toBe(true);
    });
    expect(await screen.findByRole("button", { name: /Beta Labs/ })).toBeInTheDocument();
  });

  it("invalidates cached company summaries after creating an application", async () => {
    const fetchMock = vi.mocked(fetch);
    let summaryCalls = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v1/companies/summary")) {
        summaryCalls += 1;
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "c1",
                name: "Acme",
                research_status: "indexed",
                has_application: summaryCalls > 1,
                created_at: "2026-01-01",
                updated_at: "2026-01-01"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.includes("/api/v1/applications/bootstrap") && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify(applicationRow), { status: 201 }));
      }
      if (isApplicationsFacetRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify({ profile_names: [] }), { status: 200 }));
      }
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    const cachedBeforeCreate = await getCompanySummariesPage({ page: 1, pageSize: 10 });
    expect(cachedBeforeCreate[0].has_application).toBe(false);

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Applications" });
    await userEvent.click(screen.getByRole("button", { name: "New application" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Company name" }), {
      target: { value: "Acme" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("/api/v1/applications/bootstrap"))
      ).toBe(true);
    });
    const refreshedAfterCreate = await getCompanySummariesPage({ page: 1, pageSize: 10 });
    expect(summaryCalls).toBe(2);
    expect(refreshedAfterCreate[0].has_application).toBe(true);
  });

  it("sends company search to the application list API instead of filtering the current page", async () => {
    const fetchMock = vi.mocked(fetch);
    const betaRow = { ...applicationRow, id: "a2", company_id: "c2", company_name: "Beta" };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsFacetRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify({ profile_names: [] }), { status: 200 }));
      }
      if (isApplicationsListRequest(url)) {
        const params = new URL(url).searchParams;
        if (params.get("company_search") === "Beta") {
          return Promise.resolve(new Response(JSON.stringify([betaRow]), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Filter applications by company name" }), {
      target: { value: "Beta" }
    });

    await waitFor(() => {
      const listCalls = fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => isApplicationsListRequest(url));
      expect(listCalls.some((url) => url.includes("company_search=Beta"))).toBe(true);
    });
    expect(await screen.findByRole("cell", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Acme" })).not.toBeInTheDocument();
  });

  it("shows mark applied button and marks as applied", async () => {
    const fetchMock = vi.mocked(fetch);
    const appliedPayload = {
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: true,
      applied_at: "2026-01-01",
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    };

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/applications/") && url.includes("/mark-applied")) {
        return Promise.resolve(new Response(JSON.stringify(appliedPayload), { status: 200 }));
      }
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText("Mark Applied")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Mark Applied"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/applications/a1/mark-applied"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ applied: true, force: false })
      })
    );
  });

  it("disables mark applied action while request is in flight to prevent repeat clicks", async () => {
    const fetchMock = vi.mocked(fetch);
    const appliedPayload = {
      ...applicationRow,
      applied: true,
      applied_at: "2026-01-01"
    };
    let resolveMarkApplied: (response: Response) => void = () => {};
    const markAppliedPromise = new Promise<Response>((resolve) => {
      resolveMarkApplied = resolve;
    });

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/applications/") && url.includes("/mark-applied")) {
        return markAppliedPromise;
      }
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    const markButton = await screen.findByRole("button", { name: "Mark Applied" });
    fireEvent.click(markButton);
    await waitFor(() => expect(markButton).toBeDisabled());
    fireEvent.click(markButton);
    expect(
      fetchMock.mock.calls.filter(([input]) => String(input).includes("/applications/a1/mark-applied"))
    ).toHaveLength(1);

    resolveMarkApplied(new Response(JSON.stringify(appliedPayload), { status: 200 }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Mark Applied" })).toBeEnabled();
    });
  });

  it("shows unmark applied button and unmarks when already applied", async () => {
    const fetchMock = vi.mocked(fetch);
    const unmarkedPayload = {
      id: "a1",
      company_id: "c1",
      status: "application_ready",
      applied: false,
      applied_at: null,
      created_at: "2026-01-01",
      updated_at: "2026-01-01"
    };

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/applications/") && url.includes("/mark-applied")) {
        return Promise.resolve(new Response(JSON.stringify(unmarkedPayload), { status: 200 }));
      }
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                ...applicationRow,
                applied: true,
                applied_at: "2026-01-01"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Unmark Applied")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Unmark Applied"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/applications/a1/mark-applied"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ applied: false, force: false })
      })
    );
  });

  it("shows inline action error and keeps pending mode when mark applied fails", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/applications/") && url.includes("/mark-applied")) {
        return Promise.resolve(new Response(JSON.stringify({ detail: "Temporary backend failure" }), { status: 500 }));
      }
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Mark Applied" }));

    expect(await screen.findByText(/Could not mark Acme as applied\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pending" })).toHaveClass("btn-active");

    const listCalls = fetchMock.mock.calls
      .map(([input]) => (typeof input === "string" ? input : input.toString()))
      .filter((url) => isApplicationsListRequest(url));
    expect(listCalls.every((url) => !url.includes("applied=true"))).toBe(true);
  });

  it("renames Active tab to Pending and includes Applied tab", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Applied" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Active" })).not.toBeInTheDocument();
  });

  it("shows unmark applied button for already applied applications", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                ...applicationRow,
                applied: true,
                status: "application_ready",
                applied_at: "2026-01-01"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    await screen.findByRole("cell", { name: "Acme" });
    expect(screen.getByText("Unmark Applied")).toBeInTheDocument();
  });

  it("keeps the current tab stable after marking an application as applied", async () => {
    const fetchMock = vi.mocked(fetch);
    const pendingApp = { ...applicationRow, applied: false, status: "application_ready" };
    const appliedApp = {
      ...applicationRow,
      applied: true,
      status: "application_ready",
      applied_at: "2026-01-01"
    };

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/applications/") && url.includes("/mark-applied")) {
        return Promise.resolve(new Response(JSON.stringify(appliedApp), { status: 200 }));
      }
      if (isApplicationsListRequest(url)) {
        const params = new URL(url).searchParams;
        const appliedWasMarked = fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/mark-applied")
        );
        if (params.get("applied") === "false" && appliedWasMarked) {
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify([pendingApp]), { status: 200 }));
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Mark Applied")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Mark Applied"));
    expect(await screen.findByText("No applications in this view.")).toBeInTheDocument();

    const listCalls = fetchMock.mock.calls
      .map(([input]) => (typeof input === "string" ? input : input.toString()))
      .filter((url) => isApplicationsListRequest(url));
    expect(listCalls.filter((url) => url.includes("applied=false")).length).toBeGreaterThan(1);
    expect(listCalls.every((url) => !url.includes("applied=true"))).toBe(true);
    expect(screen.getByRole("button", { name: "Pending" })).toHaveClass("btn-active");
  });

  it("does not fetch companies when switching application list modes", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([applicationRow]), { status: 200 }));
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => url.endsWith("/companies"))
    ).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Applied" }));

    await waitFor(() => {
      const listCalls = fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => isApplicationsListRequest(url));
      expect(listCalls.some((url) => url.includes("applied=true"))).toBe(true);
    });

    expect(
      fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => url.endsWith("/companies"))
    ).toHaveLength(0);
    expect(
      fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => url.includes("/api/v1/workers/summary"))
    ).toHaveLength(1);
    expect(
      fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .some((url) => url.includes("/api/v1/settings/workers"))
    ).toBe(false);
  });

  it("paginates application list requests", async () => {
    const fetchMock = vi.mocked(fetch);
    const secondPageRow = { ...applicationRow, id: "a16", company_name: "Beta" };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        if (url.includes("skip=15")) {
          return Promise.resolve(new Response(JSON.stringify([secondPageRow]), { status: 200 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(Array.from({ length: 15 }, (_, index) => ({ ...applicationRow, id: `a${index + 1}` }))), {
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
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Go to next page" }));

    expect(await screen.findByRole("button", { name: "Current page, page 2" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Beta" })).toBeInTheDocument();
  });

  it("uses highlighted badge style for *_ready statuses", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                ...applicationRow,
                status: "application_ready"
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    const companyCell = await screen.findByRole("cell", { name: "Acme" });
    const row = companyCell.closest("tr");
    expect(row).not.toBeNull();
    const statusText = within(row as HTMLElement).getByText("Application ready");
    const statusBadge = statusText.closest("span");
    expect(statusBadge).not.toBeNull();
    expect(statusBadge?.className).toContain("badge-success");
  });

  it("filters applications by selected applied profiles from header dropdown", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsFacetRequest(url)) {
        return Promise.resolve(
          new Response(JSON.stringify({ profile_names: ["Alice Park", "Bob Stone", "Carla Kim"] }), {
            status: 200
          })
        );
      }
      if (isApplicationsListRequest(url)) {
        const params = new URL(url).searchParams;
        if (params.getAll("applied_profile_names").includes("Bob Stone")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  ...applicationRow,
                  id: "a1",
                  company_id: "c1",
                  company_name: "Acme",
                  applied_profiles: [{ profile_name: "Alice Park" }, { profile_name: "Bob Stone" }]
                },
                {
                  ...applicationRow,
                  id: "a2",
                  company_id: "c2",
                  company_name: "Beta",
                  applied_profiles: [{ profile_name: "Bob Stone" }]
                }
              ]),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                ...applicationRow,
                id: "a1",
                company_id: "c1",
                company_name: "Acme",
                applied_profiles: [{ profile_name: "Alice Park" }, { profile_name: "Bob Stone" }]
              },
              {
                ...applicationRow,
                id: "a2",
                company_id: "c2",
                company_name: "Beta",
                applied_profiles: [{ profile_name: "Bob Stone" }]
              },
              {
                ...applicationRow,
                id: "a3",
                company_id: "c3",
                company_name: "Core",
                applied_profiles: [{ profile_name: "Carla Kim" }]
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { ...companyRow, id: "c1", name: "Acme" },
              { ...companyRow, id: "c2", name: "Beta" },
              { ...companyRow, id: "c3", name: "Core" }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Core" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Applied profiles filter" }));
    await userEvent.click(screen.getByRole("button", { name: "Unselect all profiles" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob Stone" }));

    await waitFor(() => {
      const listCalls = fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((requestUrl) => isApplicationsListRequest(requestUrl));
      expect(listCalls.some((requestUrl) => requestUrl.includes("applied_profile_names=Bob+Stone"))).toBe(true);
      expect(listCalls.every((requestUrl) => !requestUrl.includes("/profiles/summary"))).toBe(true);
    });
    expect(await screen.findByRole("cell", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Core" })).not.toBeInTheDocument();
  });

  it("sends an empty-match profile filter when all profile names are unselected", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsFacetRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify({ profile_names: ["Alice Park"] }), { status: 200 }));
      }
      if (isApplicationsListRequest(url)) {
        const params = new URL(url).searchParams;
        if (params.getAll("applied_profile_names").includes("__jobcrm_no_applied_profile_match__")) {
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                ...applicationRow,
                id: "a1",
                company_id: "c1",
                company_name: "Acme",
                applied_profiles: [{ profile_name: "Alice Park" }]
              },
              {
                ...applicationRow,
                id: "a2",
                company_id: "c2",
                company_name: "Beta",
                applied_profiles: []
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { ...companyRow, id: "c1", name: "Acme" },
              { ...companyRow, id: "c2", name: "Beta" }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Beta" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Applied profiles filter" }));
    await userEvent.click(screen.getByRole("button", { name: "Unselect all profiles" }));

    await waitFor(() => {
      const listCalls = fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((requestUrl) => isApplicationsListRequest(requestUrl));
      expect(
        listCalls.some((requestUrl) =>
          requestUrl.includes("applied_profile_names=__jobcrm_no_applied_profile_match__")
        )
      ).toBe(true);
    });
    expect(await screen.findByText("No applications in this view.")).toBeInTheDocument();
  });

  it("preserves applied profile filter selection when page is revisited", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsFacetRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify({ profile_names: ["Alice Park", "Carla Kim"] }), { status: 200 }));
      }
      if (isApplicationsListRequest(url)) {
        const params = new URL(url).searchParams;
        if (params.getAll("applied_profile_names").includes("Carla Kim")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  ...applicationRow,
                  id: "a2",
                  company_id: "c2",
                  company_name: "Core",
                  applied_profiles: [{ profile_name: "Carla Kim" }]
                }
              ]),
              { status: 200 }
            )
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                ...applicationRow,
                id: "a1",
                company_id: "c1",
                company_name: "Acme",
                applied_profiles: [{ profile_name: "Alice Park" }]
              },
              {
                ...applicationRow,
                id: "a2",
                company_id: "c2",
                company_name: "Core",
                applied_profiles: [{ profile_name: "Carla Kim" }]
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              { ...companyRow, id: "c1", name: "Acme" },
              { ...companyRow, id: "c2", name: "Core" }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.includes("/workers/summary")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    const firstMount = render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Core" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Applied profiles filter" }));
    await userEvent.click(screen.getByRole("button", { name: "Unselect all profiles" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Carla Kim" }));
    expect(await screen.findByRole("cell", { name: "Core" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Acme" })).not.toBeInTheDocument();

    firstMount.unmount();

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Core" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Acme" })).not.toBeInTheDocument();
  });
});

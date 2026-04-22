import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetAppliedProfilesFilterSelectionForTests } from "../state/applicationsFilters";
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
    vi.unstubAllGlobals();
  });

  const isApplicationsListRequest = (url: string) => url.split("?")[0].endsWith("/applications");

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
      if (url.includes("/settings/workers")) {
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

  it("opens new application modal with bounded company search", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.includes("/api/v1/companies")) {
        const search = new URL(url).searchParams.get("search");
        if (search === "Beta") {
          return Promise.resolve(
            new Response(JSON.stringify([{ ...companyRow, id: "c2", name: "Beta Labs" }]), { status: 200 })
          );
        }
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/settings/workers")) {
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
    expect(screen.getByRole("textbox", { name: "Search companies" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Company" })).toBeInTheDocument();

    await waitFor(() => {
      const companyCalls = fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => url.includes("/api/v1/companies"));
      expect(companyCalls).toHaveLength(1);
      expect(companyCalls[0]).toContain("limit=20");
    });

    await userEvent.type(screen.getByRole("textbox", { name: "Search companies" }), "Beta");

    await waitFor(() => {
      const companyCalls = fetchMock.mock.calls
        .map(([input]) => (typeof input === "string" ? input : input.toString()))
        .filter((url) => url.includes("/api/v1/companies"));
      expect(companyCalls.some((url) => url.includes("search=Beta"))).toBe(true);
    });
    expect(await screen.findByRole("option", { name: "Beta Labs" })).toBeInTheDocument();
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
        body: JSON.stringify({ applied: true })
      })
    );
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
      if (url.includes("/settings/workers")) {
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
        body: JSON.stringify({ applied: false })
      })
    );
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
      if (url.includes("/settings/workers")) {
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
      if (url.includes("/settings/workers")) {
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

  it("switches to Applied tab after marking an application as applied", async () => {
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
        const params = url.split("?")[1] ?? "";
        if (params.includes("applied=true")) {
          return Promise.resolve(new Response(JSON.stringify([appliedApp]), { status: 200 }));
        }
        if (params.includes("applied=false")) {
          return Promise.resolve(new Response(JSON.stringify([pendingApp]), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify([pendingApp]), { status: 200 }));
      }
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      if (url.includes("/settings/workers")) {
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

    const listCalls = fetchMock.mock.calls
      .map(([input]) => (typeof input === "string" ? input : input.toString()))
      .filter((url) => isApplicationsListRequest(url));
    expect(listCalls.some((url) => url.includes("applied=true"))).toBe(true);
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
      if (url.includes("/settings/workers")) {
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
  });

  it("paginates application list requests", async () => {
    const fetchMock = vi.mocked(fetch);
    const secondPageRow = { ...applicationRow, id: "a21", company_name: "Beta" };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        if (url.includes("skip=20")) {
          return Promise.resolve(new Response(JSON.stringify([secondPageRow]), { status: 200 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(Array.from({ length: 20 }, (_, index) => ({ ...applicationRow, id: `a${index + 1}` }))), {
            status: 200
          })
        );
      }
      if (url.includes("/settings/workers")) {
        return Promise.resolve(new Response(JSON.stringify(WORKER_STATE), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <ApplicationsPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Page 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page 2")).toBeInTheDocument();
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
      if (url.includes("/settings/workers")) {
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
      if (isApplicationsListRequest(url)) {
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
      if (url.includes("/settings/workers")) {
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

    expect(screen.getByRole("cell", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Core" })).not.toBeInTheDocument();
  });

  it("shows applications without applied profiles when all or none are selected", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
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
      if (url.endsWith("/profiles")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([{ id: "p1", name: "Alice Park", created_at: "", updated_at: "" }]),
            { status: 200 }
          )
        );
      }
      if (url.includes("/settings/workers")) {
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

    expect(screen.getByRole("cell", { name: "Beta" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Acme" })).not.toBeInTheDocument();
  });

  it("preserves applied profile filter selection when page is revisited", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
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
      if (url.includes("/settings/workers")) {
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
    expect(screen.queryByRole("cell", { name: "Acme" })).not.toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Core" })).toBeInTheDocument();

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

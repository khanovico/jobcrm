import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationsPage } from "./ApplicationsPage";

describe("ApplicationsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const isApplicationsListRequest = (url: string) => url.split("?")[0].endsWith("/applications");

  const companyRow = { id: "c1", name: "Acme", created_at: "", updated_at: "" };
  const applicationRow = {
    id: "a1",
    company_id: "c1",
    status: "preparation_ready",
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

  it("opens new application modal with company select from + button", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (isApplicationsListRequest(url)) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
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

    await screen.findByRole("heading", { name: "Applications" });
    await userEvent.click(screen.getByRole("button", { name: "New application" }));
    expect(await screen.findByRole("heading", { name: "New application", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Company" })).toBeInTheDocument();
  });

  it("shows mark applied button and marks as applied", async () => {
    const fetchMock = vi.mocked(fetch);
    const appliedPayload = {
      id: "a1",
      company_id: "c1",
      status: "applied",
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
      status: "preparation_ready",
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
                status: "applied",
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
    const pendingApp = { ...applicationRow, applied: false, status: "preparation_ready" };
    const appliedApp = { ...applicationRow, applied: true, status: "applied", applied_at: "2026-01-01" };

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
                status: "preparation_ready"
              }
            ]),
            { status: 200 }
          )
        );
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

    const companyCell = await screen.findByRole("cell", { name: "Acme" });
    const row = companyCell.closest("tr");
    expect(row).not.toBeNull();
    const statusText = within(row as HTMLElement).getByText("preparation_ready");
    const statusBadge = statusText.closest("span");
    expect(statusBadge).not.toBeNull();
    expect(statusBadge?.className).toContain("text-info");
    expect(statusBadge?.className).toContain("bg-info/10");
  });
});

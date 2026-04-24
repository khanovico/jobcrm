import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IndustriesPage } from "./IndustriesPage";

type IndustryRow = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

const now = "2026-01-01T00:00:00Z";

describe("IndustriesPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("creates one industry from single create mode", async () => {
    const fetchMock = vi.mocked(fetch);
    const rows: IndustryRow[] = [
      { id: "1", name: "FinTech", description: "Finance", created_at: now, updated_at: now }
    ];

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/industries/count") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({ total: rows.length }), { status: 200 }));
      }
      if (url.includes("/api/v1/industries") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      }
      if (url.includes("/api/v1/industries") && method === "POST") {
        const payload = JSON.parse(String(init?.body));
        rows.push({
          id: "2",
          name: payload.name,
          description: payload.description ?? "",
          created_at: now,
          updated_at: now
        });
        return Promise.resolve(new Response(JSON.stringify(rows[1]), { status: 201 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<IndustriesPage />);
    expect(await screen.findByText("FinTech")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Industry name"), { target: { value: "HealthTech" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Healthcare" } });
    fireEvent.click(screen.getByRole("button", { name: "Create industry" }));

    expect(await screen.findByText("Industry created.")).toBeInTheDocument();
    expect(screen.getByText("HealthTech")).toBeInTheDocument();
  }, 10000);

  it("supports bulk create mode and inline editing", async () => {
    const fetchMock = vi.mocked(fetch);
    const rows: IndustryRow[] = [
      { id: "1", name: "FinTech", description: "Finance", created_at: now, updated_at: now }
    ];

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/industries/count") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({ total: rows.length }), { status: 200 }));
      }
      if (url.includes("/api/v1/industries") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      }
      if (url.includes("/api/v1/industries/bulk") && method === "POST") {
        const payload = JSON.parse(String(init?.body)) as { industries: Array<{ name: string; description?: string }> };
        payload.industries.forEach((item, index) => {
          rows.push({
            id: String(index + 2),
            name: item.name,
            description: item.description ?? "",
            created_at: now,
            updated_at: now
          });
        });
        return Promise.resolve(new Response(JSON.stringify(rows.slice(1)), { status: 201 }));
      }
      if (url.includes("/api/v1/industries/1") && method === "PUT") {
        const payload = JSON.parse(String(init?.body));
        rows[0] = { ...rows[0], ...payload };
        return Promise.resolve(new Response(JSON.stringify(rows[0]), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<IndustriesPage />);
    expect(await screen.findByText("FinTech")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Bulk create" }));
    await userEvent.type(
      screen.getByLabelText("Bulk entries (one per line)"),
      "HealthTech|Healthcare{enter}EdTech|Education"
    );
    await userEvent.click(screen.getByRole("button", { name: "Create industries in bulk" }));

    expect(await screen.findByText("2 industries created.")).toBeInTheDocument();
    expect(screen.getByText("EdTech")).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    const nameInput = screen.getByDisplayValue("FinTech");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "FinServ");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByText("Industry updated.")).toBeInTheDocument();
    });
    expect(screen.getByText("FinServ")).toBeInTheDocument();
  });

  it("deletes an industry", async () => {
    const fetchMock = vi.mocked(fetch);
    const rows: IndustryRow[] = [
      { id: "1", name: "FinTech", description: "Finance", created_at: now, updated_at: now }
    ];
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/industries/count") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({ total: rows.length }), { status: 200 }));
      }
      if (url.includes("/api/v1/industries") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      }
      if (url.includes("/api/v1/industries/1") && method === "DELETE") {
        rows.splice(0, 1);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<IndustriesPage />);
    expect(await screen.findByRole("cell", { name: "FinTech" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(await screen.findByText('Deleted "FinTech".')).toBeInTheDocument();
    expect(screen.queryByText("FinTech")).not.toBeInTheDocument();
  });

  it("paginates industries and reports total result count", async () => {
    const fetchMock = vi.mocked(fetch);
    const rows: IndustryRow[] = Array.from({ length: 30 }, (_, index) => ({
      id: String(index + 1),
      name: `Industry ${index + 1}`,
      description: "",
      created_at: now,
      updated_at: now
    }));

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/industries/count") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify({ total: rows.length }), { status: 200 }));
      }
      if (url.includes("/api/v1/industries") && method === "GET") {
        const params = new URL(url).searchParams;
        const skip = Number(params.get("skip") ?? "0");
        const limit = Number(params.get("limit") ?? "25");
        return Promise.resolve(new Response(JSON.stringify(rows.slice(skip, skip + limit)), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(<IndustriesPage />);

    expect(await screen.findByText("Industry 1")).toBeInTheDocument();
    expect(screen.getAllByText("1-25 of 30").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Go to next page" }));

    expect(await screen.findByText("Industry 26")).toBeInTheDocument();
    expect(screen.getAllByText("26-30 of 30").length).toBeGreaterThan(0);
    const listCalls = fetchMock.mock.calls
      .map(([input]) => (typeof input === "string" ? input : input.toString()))
      .filter((url) => url.includes("/api/v1/industries?"));
    expect(listCalls.some((url) => url.includes("skip=25") && url.includes("limit=25"))).toBe(true);
  });
});

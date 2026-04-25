import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfilesPage } from "./ProfilesPage";

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({ user: { role: "admin" } }))
}));

vi.mock("../auth", () => ({
  useAuth: () => useAuthMock()
}));

describe("ProfilesPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: "admin" } });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows freeze modal impact copy and allows cancel", async () => {
    const fetchMock = vi.mocked(fetch);
    const rows = [
      {
        id: "p1",
        name: "Alex",
        location: "Remote",
        email: "alex@example.com",
        phone: "123",
        frozen: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      },
      {
        id: "p2",
        name: "Morgan",
        location: "Berlin",
        email: "morgan@example.com",
        phone: "456",
        frozen: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ];

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/profiles/summary") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(
      <MemoryRouter>
        <ProfilesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Freeze" }));
    expect(screen.getByRole("heading", { name: "Freeze profile" })).toBeInTheDocument();
    expect(screen.getByText(/excluded from the agent profile endpoints/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Freeze profile" })).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Alex")).toBeInTheDocument();
  });

  it("hides profile mutation controls for non-admin users", async () => {
    useAuthMock.mockReturnValue({ user: { role: "user" } });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "p1",
            name: "Alex",
            location: "Remote",
            email: "alex@example.com",
            phone: "123",
            frozen: false,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z"
          }
        ]),
        { status: 200 }
      )
    );

    render(
      <MemoryRouter>
        <ProfilesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Freeze" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("uses profile summaries endpoint with search, status filter, and pagination", async () => {
    const fetchMock = vi.mocked(fetch);
    const listCalls: string[] = [];
    const firstPageRows = Array.from({ length: 21 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Profile ${index + 1}`,
      location: "Remote",
      email: `profile${index + 1}@example.com`,
      phone: "123",
      frozen: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    }));
    const secondPageRows = [
      {
        id: "p21",
        name: "Profile 21",
        location: "Berlin",
        email: "profile21@example.com",
        phone: "456",
        frozen: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z"
      }
    ];

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/profiles/summary") && method === "GET") {
        listCalls.push(url);
        if (url.includes("skip=20")) {
          return Promise.resolve(new Response(JSON.stringify(secondPageRows), { status: 200 }));
        }
        return Promise.resolve(new Response(JSON.stringify(firstPageRows), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(
      <MemoryRouter>
        <ProfilesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Profile 1")).toBeInTheDocument();
    expect(listCalls[0]).toContain("skip=0");
    expect(listCalls[0]).toContain("limit=20");

    await userEvent.type(screen.getByRole("textbox", { name: "Search profiles" }), "berlin");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(listCalls.some((url) => url.includes("search=berlin"))).toBe(true);
    });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter profiles by status" }), "frozen");
    await waitFor(() => {
      expect(listCalls.some((url) => url.includes("frozen=true"))).toBe(true);
    });

    expect(screen.getByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to next page" }));

    expect(await screen.findByRole("button", { name: "Current page, page 2" })).toBeInTheDocument();
    expect(screen.getByText("Profile 21")).toBeInTheDocument();
    expect(listCalls.some((url) => url.includes("skip=20") && url.includes("frozen=true"))).toBe(true);

    listCalls.splice(0, listCalls.length);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter profiles by status" }), "active");
    await waitFor(() => {
      expect(listCalls.some((url) => url.includes("skip=0") && url.includes("frozen=false"))).toBe(true);
    });
    expect(listCalls.every((url) => !url.includes("skip=20"))).toBe(true);
  });

  it("does not show a next page when the API returns exactly one page", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/profiles/summary") && method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              Array.from({ length: 20 }, (_, index) => ({
                id: `p${index + 1}`,
                name: `Profile ${index + 1}`,
                location: "Remote",
                email: `profile${index + 1}@example.com`,
                phone: "123",
                frozen: false,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z"
              }))
            ),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(
      <MemoryRouter>
        <ProfilesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Profile 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeDisabled();
  });

  it("shows delete modal and removes profile after confirmation", async () => {
    const fetchMock = vi.mocked(fetch);
    const rows = [
      {
        id: "p1",
        name: "Alex",
        location: "Remote",
        email: "alex@example.com",
        phone: "123",
        frozen: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ];

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/v1/profiles/summary") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      }
      if (url.includes("/api/v1/profiles/p1") && method === "DELETE") {
        rows.splice(0, rows.length);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(
      <MemoryRouter>
        <ProfilesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("heading", { name: "Delete profile" })).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete profile" }));
    expect(await screen.findByText("No profiles yet.")).toBeInTheDocument();
  });
});

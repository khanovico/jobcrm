import { cleanup, render, screen } from "@testing-library/react";
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
  const confirmMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: "admin" } });
    confirmMock.mockReset();
    confirmMock.mockReturnValue(true);
    vi.stubGlobal("confirm", confirmMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows frozen badge and toggles freeze/unfreeze", async () => {
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
      if (url.includes("/api/v1/profiles") && method === "GET") {
        return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
      }
      if (url.includes("/api/v1/profiles/p1") && method === "PUT") {
        rows[0] = { ...rows[0], frozen: true };
        return Promise.resolve(new Response(JSON.stringify(rows[0]), { status: 200 }));
      }
      if (url.includes("/api/v1/profiles/p2") && method === "PUT") {
        rows[1] = { ...rows[1], frozen: false };
        return Promise.resolve(new Response(JSON.stringify(rows[1]), { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });

    render(
      <MemoryRouter>
        <ProfilesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Frozen")).toBeInTheDocument();

    const freezeButtons = screen.getAllByRole("button", { name: "Freeze" });
    await userEvent.click(freezeButtons[0]);
    expect(await screen.findAllByRole("button", { name: "Unfreeze" })).toHaveLength(2);

    const unfreezeButtons = screen.getAllByRole("button", { name: "Unfreeze" });
    await userEvent.click(unfreezeButtons[0]);
    expect(await screen.findByText("Morgan")).toBeInTheDocument();
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

  it("uses profile summaries endpoint with pagination", async () => {
    const fetchMock = vi.mocked(fetch);
    const firstPageRows = Array.from({ length: 20 }, (_, index) => ({
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
    expect(screen.getByText("Page 1")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Page 2")).toBeInTheDocument();
    expect(screen.getByText("Profile 21")).toBeInTheDocument();
  });
});

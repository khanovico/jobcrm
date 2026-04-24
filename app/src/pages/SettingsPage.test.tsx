import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

const adminUser = {
  id: "u1",
  name: "Admin",
  email: "admin@example.com",
  role: "admin" as const,
  admin: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
};

const workerState = (active: { company_researcher: number; ppa_analyser: number; application_drafter: number }) => ({
  settings: { max_company_researcher: 3, max_ppa_analyser: 4, max_application_drafter: 5 },
  active,
  max: { company_researcher: 3, ppa_analyser: 4, application_drafter: 5 }
});

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("disables release buttons when active count is zero", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/me")) {
        return Promise.resolve(new Response(JSON.stringify(adminUser), { status: 200 }));
      }
      if (url.endsWith("/settings/workers")) {
        return Promise.resolve(
          new Response(JSON.stringify(workerState({ company_researcher: 0, ppa_analyser: 0, application_drafter: 0 })), {
            status: 200
          })
        );
      }
      if (url.endsWith("/admin/agent-keys")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Release company researcher workers" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Release PPA analyser workers" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Release application drafter workers" })).toBeDisabled();
  });

  it("confirms release action with worker type and active count before request", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/me")) {
        return Promise.resolve(new Response(JSON.stringify(adminUser), { status: 200 }));
      }
      if (url.endsWith("/settings/workers")) {
        return Promise.resolve(
          new Response(JSON.stringify(workerState({ company_researcher: 2, ppa_analyser: 1, application_drafter: 0 })), {
            status: 200
          })
        );
      }
      if (url.endsWith("/admin/agent-keys")) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
      }
      if (url.endsWith("/settings/workers/release-all")) {
        expect(init?.method).toBe("POST");
        expect(init?.body).toBe(JSON.stringify({ worker_type: "company_researcher" }));
        return Promise.resolve(new Response(JSON.stringify({ released: 2 }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Settings" });
    await userEvent.click(screen.getByRole("button", { name: "Release company researcher workers" }));

    const modalHeading = await screen.findByRole("heading", { name: "Confirm worker release" });
    const modal = modalHeading.closest("dialog");
    expect(modal).not.toBeNull();
    expect(modal).toHaveTextContent("company researcher");
    expect(modal).toHaveTextContent("2");
    expect(modal).toHaveTextContent("active leases now");

    await userEvent.click(screen.getByRole("button", { name: "Release workers" }));

    await waitFor(() => {
      const releaseCalls = fetchMock.mock.calls.filter(([input]) =>
        (typeof input === "string" ? input : input.toString()).endsWith("/settings/workers/release-all")
      );
      expect(releaseCalls).toHaveLength(1);
    });
  });

  it("requires copy or acknowledgement before dismissing a newly created API key", async () => {
    const fetchMock = vi.mocked(fetch);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/me")) {
        return Promise.resolve(new Response(JSON.stringify(adminUser), { status: 200 }));
      }
      if (url.endsWith("/settings/workers")) {
        return Promise.resolve(
          new Response(JSON.stringify(workerState({ company_researcher: 0, ppa_analyser: 0, application_drafter: 0 })), {
            status: 200
          })
        );
      }
      if (url.endsWith("/admin/agent-keys")) {
        if (!init?.method || init.method === "GET") {
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        expect(init.method).toBe("POST");
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "k1",
              name: "prod-key",
              scopes: ["read", "write"],
              created_at: "2026-01-01T00:00:00Z",
              last_used_at: null,
              raw_key: "jaa_live_secret"
            }),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Settings" });
    await userEvent.type(screen.getByLabelText("Key name"), "prod-key");
    await userEvent.click(screen.getByRole("button", { name: "Create API key" }));

    const dismissButton = await screen.findByRole("button", { name: "Dismiss" });
    expect(dismissButton).toBeDisabled();
    expect(screen.getByText(/one-time key before dismissing it/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create API key" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("jaa_live_secret"));
    expect(dismissButton).toBeEnabled();

    await userEvent.click(dismissButton);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    });
  });

  it("renders key list and revokes after confirmation", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/me")) {
        return Promise.resolve(new Response(JSON.stringify(adminUser), { status: 200 }));
      }
      if (url.endsWith("/settings/workers")) {
        return Promise.resolve(
          new Response(JSON.stringify(workerState({ company_researcher: 0, ppa_analyser: 0, application_drafter: 0 })), {
            status: 200
          })
        );
      }
      if (url.endsWith("/admin/agent-keys") && (!init?.method || init.method === "GET")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: "k1",
                name: "prod-agent",
                scopes: ["read", "write"],
                created_at: "2026-01-01T00:00:00Z",
                last_used_at: null
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.endsWith("/admin/agent-keys/k1")) {
        expect(init?.method).toBe("DELETE");
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    await screen.findByRole("heading", { name: "Settings" });
    expect(await screen.findByText("prod-agent")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(await screen.findByRole("heading", { name: "Confirm API key revoke" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revoke key" }));

    await waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(([input]) =>
        (typeof input === "string" ? input : input.toString()).endsWith("/admin/agent-keys/k1")
      );
      expect(deleteCalls).toHaveLength(1);
    });
    await waitFor(() => expect(screen.queryByText("prod-agent")).not.toBeInTheDocument());
  });
});

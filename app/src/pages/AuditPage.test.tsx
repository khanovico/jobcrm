import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditPage } from "./AuditPage";

const makeAuditRow = (id: string, actorType: "user" | "agent", action: string) => ({
  id,
  actor_type: actorType,
  actor_id: `${actorType}-${id}-identifier`,
  action,
  entity_type: "application",
  entity_id: `entity-${id}`,
  metadata: {},
  created_at: "2026-01-01T00:00:00Z"
});

describe("AuditPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("paginates audit events", async () => {
    const fetchMock = vi.mocked(fetch);
    const firstPageRows = Array.from({ length: 50 }, (_, index) =>
      makeAuditRow(`page1-${index + 1}`, "user", "create")
    );
    const secondPageRows = [makeAuditRow("page2-1", "agent", "update")];

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("skip=50")) {
        return Promise.resolve(new Response(JSON.stringify(secondPageRows), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(firstPageRows), { status: 200 }));
    });

    render(<AuditPage />);

    expect(await screen.findByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Go to next page" }));

    expect(await screen.findByRole("button", { name: "Current page, page 2" })).toBeInTheDocument();
    expect(screen.getByText("update")).toBeInTheDocument();
    expect(screen.getByText("agent")).toBeInTheDocument();
  });

  it("resets to page 1 when actor filter changes", async () => {
    const fetchMock = vi.mocked(fetch);
    const firstPageRows = Array.from({ length: 50 }, (_, index) =>
      makeAuditRow(`page1-${index + 1}`, "user", "create")
    );
    const secondPageRows = [makeAuditRow("page2-1", "agent", "update")];
    const filteredRows = [makeAuditRow("agent-1", "agent", "archive")];

    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("actor_type=agent")) {
        return Promise.resolve(new Response(JSON.stringify(filteredRows), { status: 200 }));
      }
      if (url.includes("skip=50")) {
        return Promise.resolve(new Response(JSON.stringify(secondPageRows), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(firstPageRows), { status: 200 }));
    });

    render(<AuditPage />);

    expect(await screen.findByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(await screen.findByRole("button", { name: "Current page, page 2" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox"), "agent");

    expect(await screen.findByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();
    expect(screen.getByText("archive")).toBeInTheDocument();
  });
});

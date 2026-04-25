import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

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

  const renderPage = () =>
    render(
      <MemoryRouter>
        <AuditPage />
      </MemoryRouter>
    );

  it(
    "paginates audit events",
    async () => {
      const fetchMock = vi.mocked(fetch);
      const firstPageRows = Array.from({ length: 51 }, (_, index) =>
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

      renderPage();

      expect(await screen.findByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Go to next page" })).toBeEnabled()
      );

      fireEvent.click(screen.getByRole("button", { name: "Go to next page" }));

      expect(await screen.findByRole("button", { name: "Current page, page 2" })).toBeInTheDocument();
      expect(screen.getByText("update")).toBeInTheDocument();
      expect(screen.getByText("agent")).toBeInTheDocument();
    },
    120000
  );

  it("applies actor/action/entity/date filters to the audit query", async () => {
    const fetchMock = vi.mocked(fetch);
    const firstPageRows = [makeAuditRow("page1-1", "user", "create")];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(firstPageRows), { status: 200 }));

    renderPage();

    expect(await screen.findByRole("button", { name: "Current page, page 1" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Actor filter"), { target: { value: "agent" } });
    fireEvent.change(screen.getByLabelText("Action filter"), { target: { value: "archive" } });
    fireEvent.change(screen.getByLabelText("Entity filter"), { target: { value: "application" } });
    fireEvent.change(screen.getByLabelText("From date filter"), { target: { value: "2026-01-05" } });
    fireEvent.change(screen.getByLabelText("To date filter"), { target: { value: "2026-01-06" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      const filteredCall = fetchMock.mock.calls.find(([input]) => {
        const url = typeof input === "string" ? input : input.toString();
        return (
          url.includes("actor_type=agent") &&
          url.includes("action=archive") &&
          url.includes("entity_type=application") &&
          url.includes("from_ts=2026-01-05T00%3A00%3A00.000Z") &&
          url.includes("to_ts=2026-01-06T23%3A59%3A59.999Z") &&
          url.includes("skip=0")
        );
      });
      expect(filteredCall).toBeDefined();
    });
  });

  it("renders entity links for supported types and toggles metadata expansion", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            ...makeAuditRow("row-company", "user", "create"),
            entity_type: "company",
            entity_id: "company-1234567890",
            metadata: { reason: "manual" }
          },
          {
            ...makeAuditRow("row-application", "user", "update"),
            entity_type: "application",
            entity_id: "application-1234567890",
            metadata: {}
          },
          {
            ...makeAuditRow("row-profile", "user", "view"),
            entity_type: "profile",
            entity_id: "profile-1234567890",
            metadata: {}
          },
          {
            ...makeAuditRow("row-notification", "user", "send"),
            entity_type: "notification",
            entity_id: "notification-1234567890",
            metadata: {}
          }
        ]),
        { status: 200 }
      )
    );

    renderPage();

    expect(await screen.findByText("create")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Open company company-1234567890/ })).toHaveAttribute(
      "href",
      "/companies/company-1234567890"
    );
    expect(
      screen.getByRole("link", { name: /Open application application-1234567890/ })
    ).toHaveAttribute("href", "/applications/application-1234567890");
    expect(screen.getByRole("link", { name: /Open profile profile-1234567890/ })).toHaveAttribute(
      "href",
      "/profiles/profile-1234567890"
    );
    expect(
      screen.getByRole("link", { name: /Open notification notification-1234567890/ })
    ).toHaveAttribute("href", "/notifications");

    const metadataButtons = screen.getAllByRole("button", { name: "Show metadata" });
    fireEvent.click(metadataButtons[0]);
    expect(screen.getByText(/"reason": "manual"/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide metadata" }));
    expect(screen.queryByText(/"reason": "manual"/)).not.toBeInTheDocument();
  });

  it("copies full actor and entity IDs", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([makeAuditRow("copy-row", "agent", "update")]), { status: 200 })
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });

    renderPage();

    expect(await screen.findByText("update")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Copy full actor ID agent-copy-row-identifier/ }));
    expect(writeText).toHaveBeenCalledWith("agent-copy-row-identifier");

    fireEvent.click(screen.getByRole("button", { name: /Copy full entity ID entity-copy-row/ }));
    expect(writeText).toHaveBeenCalledWith("entity-copy-row");
  });
});

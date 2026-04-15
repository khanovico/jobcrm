import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationsPage } from "./ApplicationsPage";

describe("ApplicationsPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows mark applied button", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: "a1",
            company_id: "c1",
            status: "preparation_ready",
            applied: false,
            created_at: "2026-01-01",
            updated_at: "2026-01-01"
          }
        ]),
        { status: 200 }
      )
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: "c1", name: "Acme", created_at: "", updated_at: "" }]), {
        status: 200
      })
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "a1",
          company_id: "c1",
          status: "applied",
          applied: true,
          applied_at: "2026-01-01",
          created_at: "2026-01-01",
          updated_at: "2026-01-01"
        }),
        { status: 200 }
      )
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200
      })
    );

    render(<ApplicationsPage />);
    expect(await screen.findByText("Mark Applied")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Mark Applied"));
    expect(fetchMock).toHaveBeenCalled();
  });
});

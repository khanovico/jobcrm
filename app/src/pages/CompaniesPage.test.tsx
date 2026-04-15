import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompaniesPage } from "./CompaniesPage";

describe("CompaniesPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("navigates to company detail when a table row is clicked", async () => {
    const fetchMock = vi.mocked(fetch);
    const companyRow = {
      id: "c1",
      name: "Acme Corp",
      website: "https://acme.example",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    };
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/companies")) {
        return Promise.resolve(new Response(JSON.stringify([companyRow]), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });

    render(
      <MemoryRouter initialEntries={["/companies"]}>
        <Routes>
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/:companyId" element={<div data-testid="company-detail">Detail page</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("cell", { name: "Acme Corp" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("row", { name: /Acme Corp/i }));
    expect(await screen.findByTestId("company-detail")).toBeInTheDocument();
  });
});

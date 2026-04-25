import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClearApplicationToPendingModal } from "./ClearApplicationToPendingModal";

const { clearApplicationToCompanyResearchPending } = vi.hoisted(() => ({
  clearApplicationToCompanyResearchPending: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    clearApplicationToCompanyResearchPending
  }
}));

describe("ClearApplicationToPendingModal", () => {
  beforeEach(() => {
    clearApplicationToCompanyResearchPending.mockReset();
    clearApplicationToCompanyResearchPending.mockResolvedValue({
      id: "a1",
      company_id: "c1",
      status: "ppa_pending",
      applied: false,
      email_sent: false,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("uses explicit destructive reset wording and submits the reset", async () => {
    const onClose = vi.fn();
    const onCleared = vi.fn();

    render(
      <ClearApplicationToPendingModal
        open
        onClose={onClose}
        applicationId="a1"
        companyLabel="Acme"
        targetStatus="ppa_pending"
        onCleared={onCleared}
      />
    );

    expect(screen.getByRole("heading", { name: "Reset preparation" })).toBeInTheDocument();
    expect(screen.getByText(/This will delete/i)).toBeInTheDocument();
    expect(screen.getByText("all generated per-profile analysis")).toBeInTheDocument();
    expect(screen.getByText(/all generated emails/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete prep artifacts and reset" }));

    await waitFor(() => {
      expect(clearApplicationToCompanyResearchPending).toHaveBeenCalledWith("a1");
    });
    expect(onClose).toHaveBeenCalled();
    expect(onCleared).toHaveBeenCalled();
  });
});

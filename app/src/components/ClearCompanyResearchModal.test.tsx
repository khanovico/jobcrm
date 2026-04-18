import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClearCompanyResearchModal } from "./ClearCompanyResearchModal";

const { listApplications, clearCompanyResearchDetail } = vi.hoisted(() => ({
  listApplications: vi.fn(),
  clearCompanyResearchDetail: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    listApplications,
    clearCompanyResearchDetail
  }
}));

describe("ClearCompanyResearchModal", () => {
  beforeEach(() => {
    listApplications.mockReset();
    clearCompanyResearchDetail.mockReset();
    clearCompanyResearchDetail.mockResolvedValue({
      id: "c1",
      name: "Acme",
      research_status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Archive and Clear when applications exist", async () => {
    listApplications.mockResolvedValue([
      {
        id: "a1",
        company_id: "c1",
        status: "application_ready",
        applied: false,
        email_sent: false,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        applied_profiles: []
      }
    ]);

    const onCleared = vi.fn();
    render(
      <ClearCompanyResearchModal
        open
        onClose={vi.fn()}
        company={{ id: "c1", name: "Acme" }}
        onCleared={onCleared}
      />
    );

    expect(await screen.findByText(/tied to this company/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Clear" })).not.toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(clearCompanyResearchDetail).toHaveBeenCalledWith("c1", { related_applications: "archive" });
    });
    expect(onCleared).toHaveBeenCalled();
  });

  it("shows only Clear company when no applications", async () => {
    listApplications.mockResolvedValue([]);

    render(
      <ClearCompanyResearchModal
        open
        onClose={vi.fn()}
        company={{ id: "c1", name: "Solo" }}
        onCleared={vi.fn()}
      />
    );

    expect(await screen.findByText(/tied to this company/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear company" }));

    await waitFor(() => {
      expect(clearCompanyResearchDetail).toHaveBeenCalledWith("c1", { related_applications: "none" });
    });
  });
});

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClearCompanyResearchModal } from "./ClearCompanyResearchModal";

const { getCompanyApplicationCount, clearCompanyResearchDetail } = vi.hoisted(() => ({
  getCompanyApplicationCount: vi.fn(),
  clearCompanyResearchDetail: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    getCompanyApplicationCount,
    clearCompanyResearchDetail
  }
}));

describe("ClearCompanyResearchModal", () => {
  beforeEach(() => {
    getCompanyApplicationCount.mockReset();
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

  it("shows explicit destructive labels and requires confirmation when applications exist", async () => {
    getCompanyApplicationCount.mockResolvedValue({ count: 1 });

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
    expect(
      screen.getByText(/reset deletes generated per-profile analysis and emails for related applications/i)
    ).toBeInTheDocument();
    const archiveButton = screen.getByRole("button", { name: "Archive related applications" });
    const resetButton = screen.getByRole("button", { name: "Delete prep artifacts and reset applications" });
    expect(archiveButton).toBeDisabled();
    expect(resetButton).toBeDisabled();

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: /i understand reset deletes generated per-profile analysis and emails for related applications/i
      })
    );
    expect(archiveButton).not.toBeDisabled();
    expect(resetButton).not.toBeDisabled();

    await userEvent.click(archiveButton);

    await waitFor(() => {
      expect(clearCompanyResearchDetail).toHaveBeenCalledWith("c1", { related_applications: "archive" });
    });
    expect(onCleared).toHaveBeenCalled();
  });

  it("shows explicit company-only label when no applications", async () => {
    getCompanyApplicationCount.mockResolvedValue({ count: 0 });

    render(
      <ClearCompanyResearchModal
        open
        onClose={vi.fn()}
        company={{ id: "c1", name: "Solo" }}
        onCleared={vi.fn()}
      />
    );

    expect(await screen.findByText(/tied to this company/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete company prep artifacts only" }));

    await waitFor(() => {
      expect(clearCompanyResearchDetail).toHaveBeenCalledWith("c1", { related_applications: "none" });
    });
  });

  it("requires explicit confirmation when related application count cannot be loaded", async () => {
    getCompanyApplicationCount.mockRejectedValue(new Error("timeout"));

    render(
      <ClearCompanyResearchModal
        open
        onClose={vi.fn()}
        company={{ id: "c1", name: "Solo" }}
        onCleared={vi.fn()}
      />
    );

    expect(
      await screen.findByText(/i understand related application count is unavailable, and this action only deletes/i)
    ).toBeInTheDocument();
    const clearButton = screen.getByRole("button", { name: "Delete company prep artifacts only" });
    expect(clearButton).toBeDisabled();

    await userEvent.click(
      screen.getByRole("checkbox", {
        name: /i understand related application count is unavailable, and this action only deletes/i
      })
    );
    expect(clearButton).not.toBeDisabled();

    await userEvent.click(clearButton);
    await waitFor(() => {
      expect(clearCompanyResearchDetail).toHaveBeenCalledWith("c1", { related_applications: "none" });
    });
  });

  it("disables controls and blocks close while submitting", async () => {
    getCompanyApplicationCount.mockResolvedValue({ count: 2 });
    let resolveClear = () => {};
    clearCompanyResearchDetail.mockImplementation(
      () =>
        new Promise((resolve: (value: unknown) => void) => {
          resolveClear = () => resolve({});
        })
    );

    const onClose = vi.fn();
    render(
      <ClearCompanyResearchModal
        open
        onClose={onClose}
        company={{ id: "c1", name: "Acme" }}
        onCleared={vi.fn()}
      />
    );

    await screen.findByText(/tied to this company/);
    await userEvent.click(
      screen.getByRole("checkbox", {
        name: /i understand reset deletes generated per-profile analysis and emails for related applications/i
      })
    );
    await userEvent.click(screen.getByRole("button", { name: "Archive related applications" }));

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(cancelButton).toBeDisabled();
    expect(closeButton).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: "Working…" })) {
      expect(button).toBeDisabled();
    }

    await userEvent.click(closeButton);
    expect(onClose).not.toHaveBeenCalled();

    resolveClear();
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

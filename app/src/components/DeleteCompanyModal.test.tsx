import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteCompanyModal } from "./DeleteCompanyModal";

const { getCompanyApplicationCount, archiveCompany } = vi.hoisted(() => ({
  getCompanyApplicationCount: vi.fn(),
  archiveCompany: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    getCompanyApplicationCount,
    archiveCompany
  }
}));

describe("DeleteCompanyModal", () => {
  beforeEach(() => {
    getCompanyApplicationCount.mockReset();
    archiveCompany.mockReset();
    getCompanyApplicationCount.mockResolvedValue({ count: 2 });
    archiveCompany.mockResolvedValue({ applications_archived: 2 });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads application count and archives with provided reason on submit", async () => {
    const onClose = vi.fn();
    const onArchived = vi.fn();

    render(
      <DeleteCompanyModal
        open
        onClose={onClose}
        company={{ id: "c1", name: "Acme" }}
        onArchived={onArchived}
      />
    );

    expect(await screen.findByText(/2/)).toBeInTheDocument();
    expect(screen.getByText(/Related company is archived/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Archive reason"), "No longer target");
    await userEvent.click(screen.getByRole("button", { name: "Archive company" }));

    await waitFor(() => {
      expect(archiveCompany).toHaveBeenCalledWith("c1", "No longer target");
    });
    expect(onArchived).toHaveBeenCalled();
  });

  it("shows zero applications when count is 0", async () => {
    getCompanyApplicationCount.mockResolvedValue({ count: 0 });

    render(
      <DeleteCompanyModal
        open
        onClose={vi.fn()}
        company={{ id: "c1", name: "Solo" }}
        onArchived={vi.fn()}
      />
    );

    expect(await screen.findByText(/no applications tied/i)).toBeInTheDocument();
  });
});

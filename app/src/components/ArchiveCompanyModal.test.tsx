import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ArchiveCompanyModal } from "./ArchiveCompanyModal";

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

describe("ArchiveCompanyModal", () => {
  beforeEach(() => {
    getCompanyApplicationCount.mockReset();
    archiveCompany.mockReset();
    getCompanyApplicationCount.mockResolvedValue({ count: 2 });
    archiveCompany.mockResolvedValue({ applications_archived: 2 });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads application count and archives on submit with reason", async () => {
    const onClose = vi.fn();
    const onArchived = vi.fn();

    render(
      <ArchiveCompanyModal
        open
        onClose={onClose}
        company={{ id: "c1", name: "Acme" }}
        onArchived={onArchived}
      />
    );

    expect(await screen.findByText(/2/)).toBeInTheDocument();

    await userEvent.type(screen.getByRole("textbox", { name: "Archive reason" }), "Done tracking");
    await userEvent.click(screen.getByRole("button", { name: "Archive company" }));

    await waitFor(() => {
      expect(archiveCompany).toHaveBeenCalledWith("c1", { archive_reason: "Done tracking" });
    });
    expect(onArchived).toHaveBeenCalled();
  });

  it("shows zero applications when count is 0", async () => {
    getCompanyApplicationCount.mockResolvedValue({ count: 0 });

    render(
      <ArchiveCompanyModal open onClose={vi.fn()} company={{ id: "c1", name: "Solo" }} onArchived={vi.fn()} />
    );

    expect(await screen.findByText(/no applications tied/i)).toBeInTheDocument();
  });
});

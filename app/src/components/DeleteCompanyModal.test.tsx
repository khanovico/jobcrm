import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteCompanyModal } from "./DeleteCompanyModal";

const { getCompanyApplicationCount, deleteCompany } = vi.hoisted(() => ({
  getCompanyApplicationCount: vi.fn(),
  deleteCompany: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    getCompanyApplicationCount,
    deleteCompany
  }
}));

describe("DeleteCompanyModal", () => {
  beforeEach(() => {
    getCompanyApplicationCount.mockReset();
    deleteCompany.mockReset();
    getCompanyApplicationCount.mockResolvedValue({ count: 2 });
    deleteCompany.mockResolvedValue({ applications_archived: 2 });
  });

  afterEach(() => {
    cleanup();
  });

  it("loads application count and explains archiving on submit", async () => {
    const onClose = vi.fn();
    const onDeleted = vi.fn();

    render(
      <DeleteCompanyModal
        open
        onClose={onClose}
        company={{ id: "c1", name: "Acme" }}
        onDeleted={onDeleted}
      />
    );

    expect(await screen.findByText(/2/)).toBeInTheDocument();
    expect(screen.getByText(/Related company is deleted/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete company" }));

    await waitFor(() => {
      expect(deleteCompany).toHaveBeenCalledWith("c1");
    });
    expect(onDeleted).toHaveBeenCalled();
  });

  it("shows zero applications when count is 0", async () => {
    getCompanyApplicationCount.mockResolvedValue({ count: 0 });

    render(
      <DeleteCompanyModal
        open
        onClose={vi.fn()}
        company={{ id: "c1", name: "Solo" }}
        onDeleted={vi.fn()}
      />
    );

    expect(await screen.findByText(/no applications tied/i)).toBeInTheDocument();
  });
});

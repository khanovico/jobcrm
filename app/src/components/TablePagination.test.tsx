import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TablePagination } from "./TablePagination";

describe("TablePagination", () => {
  afterEach(() => {
    cleanup();
  });

  it("announces visible item ranges and disables First on page one", () => {
    render(
      <TablePagination
        page={1}
        hasNextPage
        onPageChange={vi.fn()}
        pageSize={10}
        visibleCount={10}
        itemLabel="applications"
      />
    );

    expect(screen.getByText("Showing 1-10 applications")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to first page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Go to next page" })).toBeEnabled();
  });

  it("calculates later-page ranges from page size and visible count", async () => {
    const onPageChange = vi.fn();
    render(
      <TablePagination
        page={3}
        hasNextPage={false}
        onPageChange={onPageChange}
        pageSize={10}
        visibleCount={4}
        itemLabel="results"
      />
    );

    expect(screen.getByText("Showing 21-24 results")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to first page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("uses total count for known last-page navigation", async () => {
    const onPageChange = vi.fn();
    render(
      <TablePagination
        page={2}
        hasNextPage={false}
        onPageChange={onPageChange}
        pageSize={10}
        visibleCount={10}
        totalCount={35}
        itemLabel="industries"
      />
    );

    expect(screen.getByText("Showing 11-20 of 35 industries")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Go to last page" }));
    expect(onPageChange).toHaveBeenCalledWith(4);
  });

  it("shows empty-page text and a fallback label without range props", () => {
    const { rerender } = render(
      <TablePagination
        page={2}
        hasNextPage={false}
        onPageChange={vi.fn()}
        pageSize={10}
        visibleCount={0}
        itemLabel="notifications"
      />
    );

    expect(screen.getByText("No notifications on this page")).toBeInTheDocument();

    rerender(<TablePagination page={4} hasNextPage={false} onPageChange={vi.fn()} />);
    expect(screen.getByText("Page 4")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MarkdownModal } from "./MarkdownModal";

describe("MarkdownModal", () => {
  it("renders markdown in the modal when open", async () => {
    const onClose = vi.fn();
    render(
      <MarkdownModal
        open
        onClose={onClose}
        title="Test overview"
        markdown={"# Hello\n\n- **Bold** item"}
      />
    );
    expect(screen.getByRole("heading", { name: "Test overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hello", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

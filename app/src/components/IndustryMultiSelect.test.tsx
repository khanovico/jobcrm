import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
});

import { IndustryMultiSelect } from "./IndustryMultiSelect";

const industries = [
  { id: "i-a", name: "Alpha", description: "", created_at: "", updated_at: "" },
  { id: "i-b", name: "Beta", description: "", created_at: "", updated_at: "" },
  { id: "i-g", name: "Gamma", description: "", created_at: "", updated_at: "" }
];

describe("IndustryMultiSelect", () => {
  it("searches and adds from bounded options", async () => {
    const onChange = vi.fn();
    const onSearchChange = vi.fn();
    render(
      <IndustryMultiSelect
        selectedIndustries={[industries[0]]}
        options={[industries[2]]}
        value={["i-a"]}
        onChange={onChange}
        search="gam"
        onSearchChange={onSearchChange}
      />
    );

    const list = screen.getByRole("listbox");
    await userEvent.click(within(list).getByRole("option", { name: "Gamma" }));

    expect(onChange).toHaveBeenCalledWith(["i-a", "i-g"]);
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("removes a selected industry", async () => {
    const onChange = vi.fn();
    render(
      <IndustryMultiSelect
        selectedIndustries={[industries[0], industries[1]]}
        options={[industries[2]]}
        value={["i-a", "i-b"]}
        onChange={onChange}
        search=""
        onSearchChange={vi.fn()}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Remove Alpha/i }));

    expect(onChange).toHaveBeenCalledWith(["i-b"]);
  });

  it("shows selected labels even when they are outside current options", () => {
    render(
      <IndustryMultiSelect
        selectedIndustries={[industries[1]]}
        options={[]}
        value={["i-b"]}
        onChange={vi.fn()}
        search="alpha"
        onSearchChange={vi.fn()}
      />
    );

    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("No matching industries.")).toBeInTheDocument();
  });
});

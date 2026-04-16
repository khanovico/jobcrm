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
  it("adds an industry from the dropdown", async () => {
    const onChange = vi.fn();
    render(
      <IndustryMultiSelect industries={industries} value={[]} onChange={onChange} />
    );

    const dropdown = screen.getByRole("combobox", { name: /Add industry from dropdown/i });
    await userEvent.selectOptions(dropdown, "i-b");

    expect(onChange).toHaveBeenCalledWith(["i-b"]);
  });

  it("filters and adds from the search list", async () => {
    const onChange = vi.fn();
    render(
      <IndustryMultiSelect industries={industries} value={["i-a"]} onChange={onChange} />
    );

    const search = screen.getByRole("searchbox");
    await userEvent.type(search, "gam");

    const list = screen.getByRole("listbox");
    await userEvent.click(within(list).getByRole("option", { name: "Gamma" }));

    expect(onChange).toHaveBeenCalledWith(["i-a", "i-g"]);
  });

  it("removes a selected industry", async () => {
    const onChange = vi.fn();
    render(
      <IndustryMultiSelect industries={industries} value={["i-a", "i-b"]} onChange={onChange} />
    );

    await userEvent.click(screen.getByRole("button", { name: /Remove Alpha/i }));

    expect(onChange).toHaveBeenCalledWith(["i-b"]);
  });
});

import { describe, expect, it } from "vitest";

import { getSelectableApplicationStatuses } from "./applicationStatus";

describe("getSelectableApplicationStatuses", () => {
  it("includes current and allowed transitions for preparation_ready", () => {
    expect(getSelectableApplicationStatuses("preparation_ready")).toEqual([
      "preparation_ready",
      "applied",
      "archived"
    ]);
  });

  it("only offers archived when already archived", () => {
    expect(getSelectableApplicationStatuses("archived")).toEqual(["archived"]);
  });
});

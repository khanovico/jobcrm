import { describe, expect, it } from "vitest";

import { applicationSortLabel } from "./applicationTableSort";

describe("applicationTableSort", () => {
  it("returns human labels for each sort key", () => {
    expect(applicationSortLabel("updated_at_desc")).toBe("Recently updated");
    expect(applicationSortLabel("created_at_desc")).toBe("Newest first");
  });
});

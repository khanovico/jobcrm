import { describe, expect, it } from "vitest";

import { applicationStatusBadgeClass, formatApplicationStatusLabel } from "./applicationStatus";

describe("formatApplicationStatusLabel", () => {
  it("uses human-readable labels", () => {
    expect(formatApplicationStatusLabel("application_ready")).toBe("Application ready");
    expect(formatApplicationStatusLabel("company_research_pending")).toBe("Company research pending");
  });
});

describe("applicationStatusBadgeClass", () => {
  it("returns a non-empty class string for known statuses", () => {
    expect(applicationStatusBadgeClass("ppa_pending")).toContain("badge");
  });
});

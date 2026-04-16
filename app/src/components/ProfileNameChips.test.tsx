import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProfileNameChips } from "./ProfileNameChips";

describe("ProfileNameChips", () => {
  it("renders profile names as badges", () => {
    render(
      <ProfileNameChips
        profiles={[
          { profile_id: "p1", profile_name: "Alex" },
          { profile_id: "p2", profile_name: "Jordan" }
        ]}
      />
    );
    expect(screen.getByText("Alex")).toBeInTheDocument();
    expect(screen.getByText("Jordan")).toBeInTheDocument();
  });

  it("shows empty label when no profiles", () => {
    render(<ProfileNameChips profiles={[]} emptyLabel="None" />);
    expect(screen.getByText("None")).toBeInTheDocument();
  });
});

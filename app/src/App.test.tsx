import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import App from "./App";
import { AuthProvider } from "./auth";

describe("App", () => {
  it("routes unauthenticated user to login", async () => {
    localStorage.removeItem("jobcrm-token");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText("Login")).toBeInTheDocument();
  });
});

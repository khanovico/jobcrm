import { render, screen } from "@testing-library/react";
import { Outlet } from "react-router-dom";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const { authState } = vi.hoisted(() => ({
  authState: {
    token: null as string | null,
    isUserLoading: false,
    user: null as { role: "admin" | "user" } | null
  }
}));

vi.mock("./auth", () => ({
  useAuth: () => ({
    token: authState.token,
    isUserLoading: authState.isUserLoading,
    user: authState.user,
    login: vi.fn(),
    logout: vi.fn()
  })
}));

vi.mock("./components/Layout", () => ({
  Layout: () => <Outlet />
}));

vi.mock("./pages/LoginPage", () => ({
  LoginPage: () => <div>Login</div>
}));
vi.mock("./pages/DashboardPage", () => ({
  DashboardPage: () => <div>Dashboard</div>
}));

describe("App", () => {
  beforeEach(() => {
    authState.token = null;
    authState.isUserLoading = false;
    authState.user = null;
  });

  it("routes unauthenticated user to login", async () => {
    authState.token = null;
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>
    );
    expect(await screen.findByText("Login")).toBeInTheDocument();
  });

  it("shows a not authorized page for non-admin access to admin routes", async () => {
    authState.token = "token";
    authState.user = { role: "user" };

    render(
      <MemoryRouter initialEntries={["/settings"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Not authorized" })).toBeInTheDocument();
    expect(screen.getByText("This page is available to admin accounts only.")).toBeInTheDocument();
  });

  it("shows a not found page for unknown routes", async () => {
    authState.token = "token";
    authState.user = { role: "admin" };

    render(
      <MemoryRouter initialEntries={["/missing-route"]}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });
});

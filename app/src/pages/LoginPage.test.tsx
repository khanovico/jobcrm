import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

const { login } = vi.hoisted(() => ({
  login: vi.fn(),
  getMe: vi.fn()
}));

vi.mock("../auth", () => ({
  useAuth: () => ({
    token: null,
    login,
    logout: vi.fn(),
    user: null,
    isUserLoading: false
  })
}));

describe("LoginPage", () => {
  beforeEach(() => {
    login.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders login form without signup controls", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });

  it("submits credentials to login", async () => {
    login.mockResolvedValueOnce(undefined);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith("user@example.com", "secret1234"));
  });

  it("uses email autocomplete and busy submit state while signing in", async () => {
    let resolveLogin!: () => void;
    login.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLogin = resolve;
        })
    );

    render(<LoginPage />);
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    fireEvent.change(email, { target: { value: "user@example.com" } });
    fireEvent.change(password, { target: { value: "secret1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "username");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Signing in..." })).toBeDisabled();
    expect(email).toBeDisabled();
    expect(password).toBeDisabled();

    resolveLogin();
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled());
  });
});

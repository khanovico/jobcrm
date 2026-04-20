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
  });

  it("submits credentials to login", async () => {
    login.mockResolvedValueOnce(undefined);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith("user@example.com", "secret1234"));
  });
});

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "./LoginPage";

const { getRegistrationStatus, login, registerAndLogin } = vi.hoisted(() => ({
  getRegistrationStatus: vi.fn(),
  login: vi.fn(),
  registerAndLogin: vi.fn()
}));

vi.mock("../api", () => ({
  api: {
    getRegistrationStatus
  }
}));

vi.mock("../auth", () => ({
  useAuth: () => ({
    token: null,
    login,
    registerAndLogin,
    logout: vi.fn()
  })
}));

describe("LoginPage", () => {
  beforeEach(() => {
    getRegistrationStatus.mockReset();
  });

  it("shows login-only mode when registration is closed", async () => {
    getRegistrationStatus.mockResolvedValueOnce({ registration_open: false });
    render(<LoginPage />);

    await waitFor(() => expect(getRegistrationStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByText("Need account? Register")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("allows register mode when registration is open", async () => {
    getRegistrationStatus.mockResolvedValueOnce({ registration_open: true });
    render(<LoginPage />);

    expect(await screen.findByRole("heading", { name: "Register" })).toBeInTheDocument();
    expect(screen.getByText("Already have account? Login")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });
});

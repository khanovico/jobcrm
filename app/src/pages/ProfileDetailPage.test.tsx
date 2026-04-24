import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileDetailPage } from "./ProfileDetailPage";

const { createProfileMock, updateProfileMock, getProfileMock, useAuthMock } = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  updateProfileMock: vi.fn(),
  getProfileMock: vi.fn(),
  useAuthMock: vi.fn(() => ({ user: { role: "admin" } }))
}));

vi.mock("../api", () => ({
  api: {
    createProfile: createProfileMock,
    updateProfile: updateProfileMock,
    getProfile: getProfileMock,
    deleteProfile: vi.fn()
  }
}));

vi.mock("../auth", () => ({
  useAuth: () => useAuthMock()
}));

vi.mock("../components/MarkdownModal", () => ({
  MarkdownModal: () => null
}));

const renderAtPath = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/profiles/:profileId" element={<ProfileDetailPage />} />
        <Route path="/profiles" element={<div>Profiles list</div>} />
      </Routes>
    </MemoryRouter>
  );

describe("ProfileDetailPage education year validation", () => {
  beforeEach(() => {
    createProfileMock.mockReset();
    updateProfileMock.mockReset();
    getProfileMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: "admin" } });
  });

  afterEach(() => {
    cleanup();
  });

  it("rejects partial and out-of-range year strings and blocks create until valid", async () => {
    createProfileMock.mockResolvedValue({ id: "p-new" });
    renderAtPath("/profiles/new");

    await userEvent.type(screen.getByLabelText("Name"), "Taylor");
    await userEvent.type(screen.getByLabelText("Location"), "Remote");
    await userEvent.type(screen.getByLabelText("Email"), "taylor@example.com");
    await userEvent.type(screen.getByLabelText("Phone"), "123");
    await userEvent.type(screen.getByLabelText("Bio markdown"), "Bio");
    await userEvent.type(screen.getByLabelText("Niche markdown"), "Niche");
    await userEvent.type(screen.getByPlaceholderText("University name *"), "State U");

    const fromInput = screen.getByPlaceholderText("From");
    const createButton = screen.getByRole("button", { name: "Create profile" });

    await userEvent.type(fromInput, "2024abc");
    expect(await screen.findByText("From year must be a 4-digit year.")).toBeInTheDocument();
    expect(createButton).toBeDisabled();

    await userEvent.clear(fromInput);
    await userEvent.type(fromInput, "1800");
    expect(await screen.findByText("From year must be between 1900 and 2100.")).toBeInTheDocument();
    expect(createButton).toBeDisabled();

    await userEvent.clear(fromInput);
    await userEvent.type(fromInput, "2024");
    await waitFor(() => {
      expect(screen.queryByText("From year must be a 4-digit year.")).not.toBeInTheDocument();
      expect(screen.queryByText("From year must be between 1900 and 2100.")).not.toBeInTheDocument();
      expect(createButton).toBeEnabled();
    });

    await userEvent.click(createButton);

    await waitFor(() => {
      expect(createProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          educations: [{ university_name: "State U", from_year: 2024, to_year: null }]
        })
      );
    });
  });

  it("shows inline row errors and disables save for invalid year while editing", async () => {
    getProfileMock.mockResolvedValue({
      id: "p1",
      name: "Existing Profile",
      location: "NYC",
      email: "existing@example.com",
      phone: "555",
      educations: [{ university_name: "College", from_year: 2021, to_year: 2023 }],
      bio_md: "Bio",
      niche_info_md: "Niche",
      resume_md: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    });

    renderAtPath("/profiles/p1");
    await screen.findByDisplayValue("Existing Profile");

    const fromInput = screen.getByDisplayValue("2021");
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeEnabled();

    await userEvent.clear(fromInput);
    await userEvent.type(fromInput, "2024abc");

    expect(await screen.findByText("From year must be a 4-digit year.")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(updateProfileMock).not.toHaveBeenCalled();
  });
});

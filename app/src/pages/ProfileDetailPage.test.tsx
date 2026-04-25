import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileDetailPage } from "./ProfileDetailPage";

const { createProfileMock, updateProfileMock, getProfileMock, deleteProfileMock, useAuthMock } = vi.hoisted(() => ({
  createProfileMock: vi.fn(),
  updateProfileMock: vi.fn(),
  getProfileMock: vi.fn(),
  deleteProfileMock: vi.fn(),
  useAuthMock: vi.fn(() => ({ user: { role: "admin" } }))
}));

vi.mock("../api", () => ({
  api: {
    createProfile: createProfileMock,
    updateProfile: updateProfileMock,
    getProfile: getProfileMock,
    deleteProfile: deleteProfileMock
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
      <Link to="/profiles">Sidebar Profiles</Link>
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
    deleteProfileMock.mockReset();
    useAuthMock.mockReset();
    useAuthMock.mockReturnValue({ user: { role: "admin" } });
  });

  afterEach(() => {
    cleanup();
  });

  it("rejects partial and out-of-range year strings and blocks create until valid", async () => {
    const createdProfile = {
      id: "p-new",
      name: "Taylor",
      location: "Remote",
      email: "taylor@example.com",
      phone: "123",
      educations: [{ university_name: "State U", from_year: 2024, to_year: null }],
      bio_md: "Bio",
      niche_info_md: "Niche",
      resume_md: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z"
    };
    createProfileMock.mockResolvedValue(createdProfile);
    getProfileMock.mockResolvedValue(createdProfile);
    renderAtPath("/profiles/new");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Taylor" } });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Remote" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "taylor@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("Bio markdown"), { target: { value: "Bio" } });
    fireEvent.change(screen.getByLabelText("Niche markdown"), { target: { value: "Niche" } });
    fireEvent.change(screen.getByPlaceholderText("University name *"), { target: { value: "State U" } });

    const fromInput = screen.getByPlaceholderText("From");
    const createButton = screen.getByRole("button", { name: "Create profile" });

    fireEvent.change(fromInput, { target: { value: "2024abc" } });
    expect(await screen.findByText("From year must be a 4-digit year.")).toBeInTheDocument();
    expect(createButton).toBeDisabled();

    fireEvent.change(fromInput, { target: { value: "1800" } });
    expect(await screen.findByText("From year must be between 1900 and 2100.")).toBeInTheDocument();
    expect(createButton).toBeDisabled();

    fireEvent.change(fromInput, { target: { value: "2024" } });
    await waitFor(() => {
      expect(screen.queryByText("From year must be a 4-digit year.")).not.toBeInTheDocument();
      expect(screen.queryByText("From year must be between 1900 and 2100.")).not.toBeInTheDocument();
      expect(createButton).toBeEnabled();
    });

    fireEvent.click(createButton);

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
    fireEvent.click(screen.getByRole("button", { name: "Education" }));

    const fromInput = screen.getByDisplayValue("2021");
    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeDisabled();

    fireEvent.change(fromInput, { target: { value: "2024abc" } });

    expect(await screen.findByText("From year must be a 4-digit year.")).toBeInTheDocument();
    expect(saveButton).toBeDisabled();
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it("saves edits in place and shows confirmation without returning to the list", async () => {
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
    updateProfileMock.mockResolvedValue({
      id: "p1",
      name: "Existing Profile",
      location: "Remote",
      email: "existing@example.com",
      phone: "555",
      educations: [{ university_name: "College", from_year: 2021, to_year: 2023 }],
      bio_md: "Bio",
      niche_info_md: "Niche",
      resume_md: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z"
    });

    renderAtPath("/profiles/p1");
    fireEvent.change(await screen.findByLabelText("Location"), { target: { value: "Remote" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateProfileMock).toHaveBeenCalledWith("p1", expect.objectContaining({ location: "Remote" }));
    });
    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
    expect(screen.queryByText("Profiles list")).not.toBeInTheDocument();
  });

  it("asks before leaving with unsaved edits", async () => {
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
    fireEvent.change(await screen.findByLabelText("Location"), { target: { value: "Remote" } });
    fireEvent.click(screen.getByRole("link", { name: "Sidebar Profiles" }));

    expect(await screen.findByRole("heading", { name: "Discard unsaved profile changes?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("heading", { name: "Discard unsaved profile changes?" })).not.toBeInTheDocument();
    expect(screen.queryByText("Profiles list")).not.toBeInTheDocument();
  });

  it("blocks empty profile name even after switching away from the basics tab", async () => {
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
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Education" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Name is required.")).toBeInTheDocument();
    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("deletes with an in-app confirmation instead of native confirm", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
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
    deleteProfileMock.mockResolvedValue(undefined);

    renderAtPath("/profiles/p1");
    fireEvent.click(await screen.findByRole("button", { name: "Delete profile" }));
    expect(screen.getByRole("heading", { name: "Delete profile" })).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole("button", { name: "Delete profile" });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(deleteProfileMock).toHaveBeenCalledWith("p1");
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

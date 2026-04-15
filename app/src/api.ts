import { Application, Company, Profile, UserPublic } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

let token: string | null = null;

export const setAuthToken = (value: string | null) => {
  token = value;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

export const api = {
  async register(name: string, email: string, password: string): Promise<UserPublic> {
    return request<UserPublic>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    });
  },
  async login(email: string, password: string): Promise<string> {
    const result = await request<{ access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    return result.access_token;
  },
  listCompanies: () => request<Company[]>("/api/v1/companies"),
  createCompany: (payload: Partial<Company>) =>
    request<Company>("/api/v1/companies", { method: "POST", body: JSON.stringify(payload) }),
  updateCompany: (id: string, payload: Partial<Company>) =>
    request<Company>(`/api/v1/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCompany: (id: string) => request<void>(`/api/v1/companies/${id}`, { method: "DELETE" }),
  listProfiles: () => request<Profile[]>("/api/v1/profiles"),
  createProfile: (payload: Partial<Profile>) =>
    request<Profile>("/api/v1/profiles", { method: "POST", body: JSON.stringify(payload) }),
  updateProfile: (id: string, payload: Partial<Profile>) =>
    request<Profile>(`/api/v1/profiles/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProfile: (id: string) => request<void>(`/api/v1/profiles/${id}`, { method: "DELETE" }),
  listApplications: () => request<Application[]>("/api/v1/applications"),
  createApplication: (payload: Record<string, unknown>) =>
    request<Application>("/api/v1/applications", { method: "POST", body: JSON.stringify(payload) }),
  updateApplication: (id: string, payload: Record<string, unknown>) =>
    request<Application>(`/api/v1/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  markApplied: (id: string, applied: boolean) =>
    request<Application>(`/api/v1/applications/${id}/mark-applied`, {
      method: "POST",
      body: JSON.stringify({ applied })
    })
};

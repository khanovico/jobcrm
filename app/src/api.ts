import {
  Application,
  AuditEvent,
  Company,
  DashboardMetrics,
  Email,
  GlobalSearchResult,
  Industry,
  PerProfileApplication,
  Profile,
  UserNotification,
  UserPublic
} from "./types";

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
  getDashboardMetrics: () => request<DashboardMetrics>("/api/v1/metrics/dashboard"),
  globalSearch: (q: string, limit = 20) =>
    request<GlobalSearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  listIndustries: () => request<Industry[]>("/api/v1/industries"),
  createIndustry: (payload: { name: string; description?: string }) =>
    request<Industry>("/api/v1/industries", { method: "POST", body: JSON.stringify(payload) }),
  listCompanies: () => request<Company[]>("/api/v1/companies"),
  createCompany: (payload: Partial<Company> & { name: string }) =>
    request<Company>("/api/v1/companies", { method: "POST", body: JSON.stringify(payload) }),
  getCompany: (id: string) => request<Company>(`/api/v1/companies/${id}`),
  updateCompany: (id: string, payload: Partial<Company>) =>
    request<Company>(`/api/v1/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCompany: (id: string) => request<void>(`/api/v1/companies/${id}`, { method: "DELETE" }),
  listProfiles: () => request<Profile[]>("/api/v1/profiles"),
  createProfile: (payload: Partial<Profile> & { name: string }) =>
    request<Profile>("/api/v1/profiles", { method: "POST", body: JSON.stringify(payload) }),
  updateProfile: (id: string, payload: Partial<Profile>) =>
    request<Profile>(`/api/v1/profiles/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProfile: (id: string) => request<void>(`/api/v1/profiles/${id}`, { method: "DELETE" }),
  listApplications: (params?: URLSearchParams) =>
    request<Application[]>(`/api/v1/applications${params ? `?${params.toString()}` : ""}`),
  createApplication: (payload: Record<string, unknown>) =>
    request<Application>("/api/v1/applications", { method: "POST", body: JSON.stringify(payload) }),
  bootstrapApplication: (payload: {
    company_name: string;
    company_website?: string | null;
    job_post?: { job_link?: string | null; job_description?: string | null } | null;
  }) =>
    request<Application>("/api/v1/applications/bootstrap", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getApplication: (id: string) => request<Application>(`/api/v1/applications/${id}`),
  updateApplication: (id: string, payload: Record<string, unknown>) =>
    request<Application>(`/api/v1/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  markApplied: (id: string, applied: boolean) =>
    request<Application>(`/api/v1/applications/${id}/mark-applied`, {
      method: "POST",
      body: JSON.stringify({ applied })
    }),
  markApplicationEmailSent: (id: string, sent: boolean) =>
    request<Application>(`/api/v1/applications/${id}/mark-email-sent`, {
      method: "POST",
      body: JSON.stringify({ sent })
    }),
  deleteApplication: (id: string) =>
    request<void>(`/api/v1/applications/${id}`, { method: "DELETE" }),
  listPerProfileApplications: (applicationId: string) =>
    request<PerProfileApplication[]>(
      `/api/v1/applications/${applicationId}/per-profile-applications`
    ),
  createPerProfileApplication: (applicationId: string, payload: Record<string, unknown>) =>
    request<PerProfileApplication>(
      `/api/v1/applications/${applicationId}/per-profile-applications`,
      { method: "POST", body: JSON.stringify(payload) }
    ),
  listEmailsForPpa: (ppaId: string) =>
    request<Email[]>(`/api/v1/per-profile-applications/${ppaId}/emails`),
  createEmail: (ppaId: string, payload: Record<string, unknown>) =>
    request<Email>(`/api/v1/per-profile-applications/${ppaId}/emails`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  markEmailSent: (emailId: string) =>
    request<Email>(`/api/v1/emails/${emailId}/mark-sent`, { method: "POST" }),
  listNotifications: (unreadOnly = false) =>
    request<UserNotification[]>(
      `/api/v1/notifications?unread_only=${unreadOnly ? "true" : "false"}`
    ),
  markNotificationRead: (id: string) =>
    request<void>(`/api/v1/notifications/${id}/read`, { method: "POST" }),
  listAuditEvents: (params?: URLSearchParams) =>
    request<AuditEvent[]>(`/api/v1/audit-events${params ? `?${params.toString()}` : ""}`)
};

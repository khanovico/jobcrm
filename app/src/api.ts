import {
  Application,
  AgentApiKeyCreated,
  ApplicationListItem,
  AuditEvent,
  Company,
  DashboardMetrics,
  Email,
  GlobalSearchResult,
  Industry,
  PerProfileApplication,
  Profile,
  ProfileCreatePayload,
  RegistrationStatus,
  UserNotification,
  UserPublic
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

let unauthorizedHandler: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  unauthorizedHandler = handler;
};

const readStoredToken = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("jobcrm-token");
};

const extractDetailMessage = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object") return null;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return "Request failed. Please check your input and try again.";
  return null;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = readStoredToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!response.ok) {
    const rawBody = (await response.text()).trim();
    let payload: unknown = null;
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody);
      } catch {
        payload = null;
      }
    }

    if (response.status === 401) {
      unauthorizedHandler?.();
      throw new Error("Session expired. Please sign in again.");
    }

    const detail = extractDetailMessage(payload);
    if (detail) throw new Error(detail);
    if (rawBody && !payload) throw new Error(rawBody);
    throw new Error("Request failed");
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
  getRegistrationStatus: () =>
    request<RegistrationStatus>("/api/v1/auth/registration-status"),
  async login(email: string, password: string): Promise<string> {
    const result = await request<{ access_token: string }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    return result.access_token;
  },
  getMe: () => request<UserPublic>("/api/v1/auth/me"),
  createAgentApiKey: (payload: { name: string; scopes?: string[] }) =>
    request<AgentApiKeyCreated>("/api/v1/admin/agent-keys", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
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
  getProfile: (id: string) => request<Profile>(`/api/v1/profiles/${id}`),
  createProfile: (payload: ProfileCreatePayload) =>
    request<Profile>("/api/v1/profiles", { method: "POST", body: JSON.stringify(payload) }),
  updateProfile: (id: string, payload: Partial<Profile>) =>
    request<Profile>(`/api/v1/profiles/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProfile: (id: string) => request<void>(`/api/v1/profiles/${id}`, { method: "DELETE" }),
  listApplications: (params?: URLSearchParams) =>
    request<ApplicationListItem[]>(`/api/v1/applications${params ? `?${params.toString()}` : ""}`),
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
  updatePerProfileApplication: (ppaId: string, payload: Record<string, unknown>) =>
    request<PerProfileApplication>(`/api/v1/per-profile-applications/${ppaId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
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

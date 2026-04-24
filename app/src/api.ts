import {
  Application,
  ApplicationDetailResponse,
  ApplicationAppliedProfileFacets,
  AgentApiKeyCreated,
  AgentApiKeyPublic,
  ApplicationListItem,
  AuditEvent,
  Company,
  CompanyListItem,
  DashboardMetrics,
  WorkerSettings,
  WorkerStateResponse,
  WorkerSettingsUpdatePayload,
  WorkerType,
  Email,
  GlobalSearchResult,
  IndustryBulkCreatePayload,
  IndustryCountResponse,
  IndustryCreatePayload,
  Industry,
  IndustryOptionsResponse,
  IndustryUpdatePayload,
  PerProfileApplication,
  Profile,
  ProfileCreatePayload,
  ProfileListItem,
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

/** Thrown on HTTP 409 when the API returns a structured `detail` object with a `code` field. */
export class ApiConflictError extends Error {
  constructor(public readonly detail: Record<string, unknown>) {
    super("Conflict");
    this.name = "ApiConflictError";
  }
}

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

    if (response.status === 409 && payload && typeof payload === "object") {
      const d = (payload as { detail?: unknown }).detail;
      if (d && typeof d === "object" && d !== null && "code" in d) {
        throw new ApiConflictError(d as Record<string, unknown>);
      }
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
  listAgentApiKeys: () => request<AgentApiKeyPublic[]>("/api/v1/admin/agent-keys"),
  revokeAgentApiKey: (id: string) =>
    request<void>(`/api/v1/admin/agent-keys/${id}`, {
      method: "DELETE"
    }),
  getDashboardMetrics: () => request<DashboardMetrics>("/api/v1/metrics/dashboard"),
  globalSearch: (q: string, limit = 20) =>
    request<GlobalSearchResult>(`/api/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  listIndustries: (params?: URLSearchParams) =>
    request<Industry[]>(`/api/v1/industries${params ? `?${params.toString()}` : ""}`),
  countIndustries: (params?: URLSearchParams) =>
    request<IndustryCountResponse>(`/api/v1/industries/count${params ? `?${params.toString()}` : ""}`),
  listIndustryOptions: (params?: URLSearchParams) =>
    request<IndustryOptionsResponse>(`/api/v1/industries/options${params ? `?${params.toString()}` : ""}`),
  createIndustry: (payload: IndustryCreatePayload) =>
    request<Industry>("/api/v1/industries", { method: "POST", body: JSON.stringify(payload) }),
  bulkCreateIndustries: (payload: IndustryBulkCreatePayload) =>
    request<Industry[]>("/api/v1/industries/bulk", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateIndustry: (id: string, payload: IndustryUpdatePayload) =>
    request<Industry>(`/api/v1/industries/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deleteIndustry: (id: string) => request<void>(`/api/v1/industries/${id}`, { method: "DELETE" }),
  listCompanies: (params?: URLSearchParams) =>
    request<Company[]>(`/api/v1/companies${params ? `?${params.toString()}` : ""}`),
  listCompanySummaries: (params?: URLSearchParams) =>
    request<CompanyListItem[]>(`/api/v1/companies/summary${params ? `?${params.toString()}` : ""}`),
  createCompany: (
    payload: Partial<Company> & { name: string; acknowledge_reuse_of_archived_company?: boolean }
  ) => request<Company>("/api/v1/companies", { method: "POST", body: JSON.stringify(payload) }),
  getCompany: (id: string) => request<Company>(`/api/v1/companies/${id}`),
  updateCompany: (id: string, payload: Partial<Company>) =>
    request<Company>(`/api/v1/companies/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  getCompanyApplicationCount: (companyId: string) =>
    request<{ count: number }>(`/api/v1/companies/${companyId}/application-count`),
  archiveCompany: (id: string, body: { archive_reason: string }) =>
    request<{ applications_archived: number }>(`/api/v1/companies/${id}/archive`, {
      method: "POST",
      body: JSON.stringify(body)
    }),
  deleteCompany: (id: string) =>
    request<{ applications_archived: number }>(`/api/v1/companies/${id}`, { method: "DELETE" }),
  listProfiles: (params?: URLSearchParams) =>
    request<Profile[]>(`/api/v1/profiles${params ? `?${params.toString()}` : ""}`),
  listProfileSummaries: (params?: URLSearchParams) =>
    request<ProfileListItem[]>(`/api/v1/profiles/summary${params ? `?${params.toString()}` : ""}`),
  getProfile: (id: string) => request<Profile>(`/api/v1/profiles/${id}`),
  createProfile: (payload: ProfileCreatePayload) =>
    request<Profile>("/api/v1/profiles", { method: "POST", body: JSON.stringify(payload) }),
  updateProfile: (id: string, payload: Partial<Profile>) =>
    request<Profile>(`/api/v1/profiles/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProfile: (id: string) => request<void>(`/api/v1/profiles/${id}`, { method: "DELETE" }),
  listApplications: (params?: URLSearchParams) =>
    request<ApplicationListItem[]>(`/api/v1/applications${params ? `?${params.toString()}` : ""}`),
  listApplicationAppliedProfileFacets: (params?: URLSearchParams) =>
    request<ApplicationAppliedProfileFacets>(
      `/api/v1/applications/applied-profile-facets${params ? `?${params.toString()}` : ""}`
    ),
  createApplication: (payload: Record<string, unknown>) =>
    request<Application>("/api/v1/applications", { method: "POST", body: JSON.stringify(payload) }),
  bootstrapApplication: (payload: {
    company_name: string;
    company_website?: string | null;
    job_post?: { job_link?: string | null; job_description?: string | null } | null;
    acknowledge_reuse_of_archived_company?: boolean;
  }) =>
    request<Application>("/api/v1/applications/bootstrap", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getApplication: (id: string) => request<Application>(`/api/v1/applications/${id}`),
  getApplicationDetail: (id: string) =>
    request<ApplicationDetailResponse>(`/api/v1/applications/${id}/detail`),
  updateApplication: (id: string, payload: Record<string, unknown>) =>
    request<Application>(`/api/v1/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  markApplied: (id: string, applied: boolean, options?: { force?: boolean }) =>
    request<Application>(`/api/v1/applications/${id}/mark-applied`, {
      method: "POST",
      body: JSON.stringify({ applied, force: options?.force ?? false })
    }),
  markApplicationEmailSent: (id: string, sent: boolean) =>
    request<Application>(`/api/v1/applications/${id}/mark-email-sent`, {
      method: "POST",
      body: JSON.stringify({ sent })
    }),
  clearApplicationToCompanyResearchPending: (id: string) =>
    request<Application>(`/api/v1/applications/${id}/clear-to-company-research-pending`, {
      method: "POST"
    }),
  clearCompanyResearchDetail: (
    companyId: string,
    payload?: { related_applications: "none" | "archive" | "reset" }
  ) =>
    request<Company>(`/api/v1/companies/${companyId}/clear-research-detail`, {
      method: "POST",
      body: JSON.stringify(payload ?? { related_applications: "none" })
    }),
  getWorkerState: () => request<WorkerStateResponse>("/api/v1/settings/workers"),
  getWorkerSummary: () => request<WorkerStateResponse>("/api/v1/workers/summary"),
  patchWorkerSettings: (payload: WorkerSettingsUpdatePayload) =>
    request<WorkerSettings>("/api/v1/settings/workers", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  releaseAllWorkers: (workerType: WorkerType) =>
    request<{ released: number }>("/api/v1/settings/workers/release-all", {
      method: "POST",
      body: JSON.stringify({ worker_type: workerType })
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
  markEmailSent: (emailId: string, sent: boolean) =>
    request<Email>(`/api/v1/emails/${emailId}/mark-sent`, {
      method: "POST",
      body: JSON.stringify({ sent })
    }),
  deleteEmail: (emailId: string) =>
    request<void>(`/api/v1/emails/${emailId}`, { method: "DELETE" }),
  listNotifications: (options?: { unreadOnly?: boolean; skip?: number; limit?: number }) => {
    const params = new URLSearchParams();
    params.set("unread_only", options?.unreadOnly ? "true" : "false");
    if (options?.skip !== undefined) params.set("skip", String(options.skip));
    if (options?.limit !== undefined) params.set("limit", String(options.limit));
    return request<UserNotification[]>(`/api/v1/notifications?${params.toString()}`);
  },
  getUnreadNotificationsCount: () =>
    request<{ count: number }>("/api/v1/notifications/unread-count"),
  getNotificationsSummary: (latestLimit = 10) =>
    request<{ unread_count: number; newest_unread: UserNotification[] }>(
      `/api/v1/notifications/summary?latest_limit=${latestLimit}`
    ),
  markNotificationRead: (id: string) =>
    request<void>(`/api/v1/notifications/${id}/read`, { method: "POST" }),
  markNotificationsReadBulk: (ids: string[]) =>
    request<{ updated: number }>("/api/v1/notifications/read", {
      method: "POST",
      body: JSON.stringify({ ids })
    }),
  deleteNotification: (id: string) =>
    request<void>(`/api/v1/notifications/${id}`, { method: "DELETE" }),
  deleteNotificationsBulk: (ids: string[]) =>
    request<{ deleted: number }>("/api/v1/notifications", {
      method: "DELETE",
      body: JSON.stringify({ ids })
    }),
  listAuditEvents: (params?: URLSearchParams) =>
    request<AuditEvent[]>(`/api/v1/audit-events${params ? `?${params.toString()}` : ""}`)
};

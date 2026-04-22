export type CompanyResearchStatus = "pending" | "indexing" | "indexed" | "invalid";

export type Company = {
  id: string;
  name: string;
  /** True when the company has at least one application (from API). */
  has_application?: boolean;
  research_status: CompanyResearchStatus;
  website?: string | null;
  linkedin?: string | null;
  industry_ids?: string[];
  hq_locations?: string[];
  employee_count_text?: string | null;
  actively_hiring?: boolean | null;
  work_mode?: string | null;
  work_mode_description?: string | null;
  overview?: string | null;
  full_product_detail?: string | null;
  full_hiring_detail?: string | null;
  full_organization_detail?: string | null;
  analysis_links?: { topic: string; link: string }[];
  enrichment_source_links?: string[];
  created_at: string;
  updated_at: string;
  archived?: boolean;
  archived_at?: string | null;
  archive_reason?: string | null;
};

export type Industry = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type IndustryCreatePayload = {
  name: string;
  description?: string;
};

export type IndustryUpdatePayload = {
  name?: string;
  description?: string;
};

export type IndustryBulkCreatePayload = {
  industries: IndustryCreatePayload[];
};

export type EducationEntry = {
  university_name: string;
  from_year?: number | null;
  to_year?: number | null;
};

export type Profile = {
  id: string;
  name: string;
  frozen?: boolean;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  educations?: EducationEntry[];
  bio_md?: string | null;
  niche_info_md?: string | null;
  resume_md?: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileListItem = {
  id: string;
  name: string;
  frozen?: boolean;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at: string;
};

/** POST /api/v1/profiles — all required except resume_md */
export type ProfileCreatePayload = {
  name: string;
  location: string;
  email: string;
  phone: string;
  educations: EducationEntry[];
  bio_md: string;
  niche_info_md: string;
  resume_md?: string | null;
};

export type ApplicationStatus =
  | "company_research_pending"
  | "company_researching"
  | "ppa_pending"
  | "ppa_analyzing"
  | "application_pending"
  | "application_drafting"
  | "application_ready"
  | "invalid"
  | "archived";

export type JobPost = {
  job_link?: string | null;
  job_description?: string | null;
};

export type Application = {
  id: string;
  company_id: string;
  job_post?: JobPost | null;
  status: ApplicationStatus;
  applied: boolean;
  applied_at?: string | null;
  email_sent: boolean;
  email_sent_at?: string | null;
  notes?: string | null;
  /** Set when status is archived (human or JAA). */
  archive_reason?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

/** Resolved profile names for PPAs that have tailored resume or email on list applications API. */
export type AppliedProfileName = {
  profile_name: string;
};

export type ApplicationListItem = Application & {
  company_name: string;
  applied_profiles: AppliedProfileName[];
};

export type PerProfileApplicationDetail = PerProfileApplication & {
  profile_name: string;
  emails: Email[];
};

export type ApplicationDetailResponse = {
  application: Application;
  company: Company;
  per_profile_applications: PerProfileApplicationDetail[];
};

export type ColdEmailPlan = {
  subjects: string[];
  selected_subject_index: number;
  to?: { title: string; name: string; email?: string | null; timezone?: string | null } | null;
  status: string;
};

export type PerProfileApplication = {
  id: string;
  application_id: string;
  profile_id: string;
  order_index: number;
  fit_score?: number | null;
  analysis: string;
  tailored_resume_link?: string | null;
  cold_email_plan?: ColdEmailPlan | null;
  applied: boolean;
  applied_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type Email = {
  id: string;
  per_profile_application_id: string;
  kind: "cold" | "follow_up";
  to?: { title?: string; name?: string; email?: string | null; timezone?: string | null } | null;
  content: string;
  lifecycle_status: string;
  sent: boolean;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPublic = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  admin: boolean;
  created_at: string;
  updated_at: string;
};

/** POST /api/v1/admin/agent-keys — response includes one-time raw_key */
export type AgentApiKeyCreated = {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  raw_key: string;
};

export type DashboardMetrics = {
  company_research_pipeline: number;
  application_ready: number;
  actions_need_review: number;
  unread_notifications: number;
};

export type WorkerSettings = {
  max_company_researcher: number;
  max_ppa_analyser: number;
  max_application_drafter: number;
};

export type WorkerStateResponse = {
  settings: WorkerSettings;
  active: Record<string, number>;
  max: Record<string, number>;
};

export type WorkerSettingsUpdatePayload = {
  max_company_researcher?: number;
  max_ppa_analyser?: number;
  max_application_drafter?: number;
};

export type WorkerType = "company_researcher" | "ppa_analyser" | "application_drafter";

export type AuditEvent = {
  id: string;
  actor_type: "user" | "agent";
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type NotificationKind =
  | "APPLICATION_UPDATE"
  | "COMPANY_UPDATE"
  | "SYSTEM_ERROR"
  | "FOLLOW_UP_DRAFT";

export type NotificationSeverity = "SUCCESS" | "FAILED" | "WARN";

export type UserNotification = {
  id: string;
  user_id: string;
  notification: NotificationKind;
  type: NotificationSeverity;
  timestamp: string;
  check: boolean;
  payload: { id: string | null; message: string };
  read_at?: string | null;
  created_at: string;
  link?: string | null;
};

export type GlobalSearchResult = {
  companies: Company[];
  profiles: Profile[];
  applications: Application[];
};

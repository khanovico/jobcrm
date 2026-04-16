export type Company = {
  id: string;
  name: string;
  indexed?: boolean;
  website?: string | null;
  linkedin?: string | null;
  industry_ids?: string[];
  hq_locations?: string[];
  employee_count_text?: string | null;
  actively_hiring?: boolean | null;
  work_mode?: string | null;
  work_mode_description?: string | null;
  overview?: string | null;
  analysis_links?: { topic: string; link: string }[];
  enrichment_source_links?: string[];
  created_at: string;
  updated_at: string;
};

export type Industry = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

export type EducationEntry = {
  university_name: string;
  from_year?: number | null;
  to_year?: number | null;
};

export type Profile = {
  id: string;
  name: string;
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
  | "draft"
  | "pending_preparation"
  | "researching"
  | "analysis_ready"
  | "preparation_ready"
  | "applied"
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

/** Resolved profile names for per-profile rows with `applied` on list applications API. */
export type AppliedProfileName = {
  profile_id: string;
  profile_name: string;
};

export type ApplicationListItem = Application & {
  applied_profiles: AppliedProfileName[];
};

export type ColdEmailPlan = {
  subjects: string[];
  selected_subject_index: number;
  to?: { title: string; name: string; email?: string | null } | null;
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
  pending_preparation: number;
  preparation_ready: number;
  actions_need_review: number;
  unread_notifications: number;
};

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

export type UserNotification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  link?: string | null;
  read_at?: string | null;
  created_at: string;
};

export type GlobalSearchResult = {
  companies: Company[];
  profiles: Profile[];
  applications: Application[];
};

export type Company = {
  id: string;
  name: string;
  website?: string | null;
  linkedin?: string | null;
  overview?: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  name: string;
  location?: string | null;
  email?: string | null;
  phone?: string | null;
  bio_md?: string | null;
  niche_info_md?: string | null;
  resume_md?: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationStatus =
  | "draft"
  | "pending_preparation"
  | "researching"
  | "analysis_ready"
  | "preparation_ready"
  | "applied"
  | "archived";

export type Application = {
  id: string;
  company_id: string;
  status: ApplicationStatus;
  applied: boolean;
  applied_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPublic = {
  id: string;
  name: string;
  email: string;
  admin: boolean;
};

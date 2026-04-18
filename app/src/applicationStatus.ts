import type { ApplicationStatus } from "./types";

const LABELS: Record<ApplicationStatus, string> = {
  company_research_pending: "Company research pending",
  company_researching: "Company researching",
  ppa_pending: "PPA pending",
  application_pending: "Application pending",
  application_ready: "Application ready",
  invalid: "Invalid",
  archived: "Archived"
};

export function formatApplicationStatusLabel(status: ApplicationStatus): string {
  return LABELS[status] ?? status;
}

/** DaisyUI-oriented badge classes for application workflow status. */
export function applicationStatusBadgeClass(status: ApplicationStatus): string {
  switch (status) {
    case "company_research_pending":
      return "badge badge-warning badge-outline";
    case "company_researching":
      return "badge badge-info";
    case "ppa_pending":
      return "badge badge-secondary";
    case "application_pending":
      return "badge badge-accent";
    case "application_ready":
      return "badge badge-success";
    case "invalid":
      return "badge badge-error";
    case "archived":
      return "badge badge-ghost";
    default:
      return "badge badge-ghost";
  }
}

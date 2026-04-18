import type { ApplicationStatus } from "./types";

/** Mirrors backend `ALLOWED_APPLICATION_TRANSITIONS` — only these targets are valid from each status. */
export const ALLOWED_APPLICATION_STATUS_TRANSITIONS: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  draft: ["pending_preparation", "archived"],
  pending_preparation: ["researching", "analysis_ready", "preparation_ready", "archived"],
  researching: ["analysis_ready", "preparation_ready", "archived"],
  analysis_ready: ["preparation_ready", "applied", "archived"],
  preparation_ready: ["applied", "archived"],
  applied: ["archived"],
  archived: []
};

const STATUS_DROPDOWN_ORDER: ApplicationStatus[] = [
  "draft",
  "pending_preparation",
  "researching",
  "analysis_ready",
  "preparation_ready",
  "applied",
  "archived"
];

/** Current status plus allowed next statuses, in a stable order for a &lt;select&gt;. */
export function getSelectableApplicationStatuses(current: ApplicationStatus): ApplicationStatus[] {
  const allowed = new Set<ApplicationStatus>([
    current,
    ...ALLOWED_APPLICATION_STATUS_TRANSITIONS[current]
  ]);
  return STATUS_DROPDOWN_ORDER.filter((s) => allowed.has(s));
}

export function formatApplicationStatusLabel(status: ApplicationStatus): string {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Mirrors backend `/api/v1/applications` sort query param values. */

export type ApplicationTableSort =
  | "updated_at_desc"
  | "updated_at_asc"
  | "created_at_desc"
  | "created_at_asc";

export function applicationSortLabel(sort: ApplicationTableSort): string {
  switch (sort) {
    case "updated_at_desc":
      return "Recently updated";
    case "updated_at_asc":
      return "Least recently updated";
    case "created_at_desc":
      return "Newest first";
    case "created_at_asc":
      return "Oldest first";
    default:
      return sort;
  }
}

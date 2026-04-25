import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { ArchiveCompanyModal } from "../components/ArchiveCompanyModal";
import { NewApplicationModal } from "../components/NewApplicationModal";
import { Modal } from "../components/Modal";
import { TablePagination } from "../components/TablePagination";
import { api, ApiConflictError } from "../api";
import { getCompanySummariesPage, invalidateCompanySummariesCache } from "../state/companySummaries";
import { getWorkerSummaryCached, invalidateWorkerSummaryCache } from "../state/workerState";
import { CompanyListItem, CompanyResearchStatus, WorkerStateResponse } from "../types";

const PAGE_SIZE = 10;
const FOREGROUND_REFRESH_DEDUPE_MS = 1000;

type CompanySort =
  | "updated_at_desc"
  | "created_at_desc"
  | "updated_at_asc"
  | "name_asc";

type ApplicationRecordFilter = "all" | "never" | "once";

type ArchivedCompanyConflict = {
  companyId: string | null;
  name: string;
  website: string | null;
  archiveReason: string | null;
  archivedAt: string | null;
};

const readOptionalConflictString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseArchivedCompanyConflict = (
  detail: Record<string, unknown>,
  fallbackName: string
): ArchivedCompanyConflict => ({
  companyId: readOptionalConflictString(detail.company_id),
  name: readOptionalConflictString(detail.name) ?? fallbackName,
  website: readOptionalConflictString(detail.website),
  archiveReason: readOptionalConflictString(detail.archive_reason),
  archivedAt: readOptionalConflictString(detail.archived_at)
});

const companySortLabel = (s: CompanySort): string => {
  switch (s) {
    case "updated_at_desc":
      return "Recently updated";
    case "created_at_desc":
      return "Newest companies";
    case "updated_at_asc":
      return "Oldest companies";
    case "name_asc":
      return "Name A–Z";
    default:
      return s;
  }
};

const researchLabel = (s: CompanyResearchStatus | undefined) => {
  if (s === "indexed") return "Indexed";
  if (s === "indexing") return "Indexing";
  if (s === "invalid") return "Invalid";
  return "Pending";
};

const researchBadgeClass = (s: CompanyResearchStatus | undefined) => {
  if (s === "indexed") return "badge-success";
  if (s === "indexing") return "badge-info";
  if (s === "invalid") return "badge-error";
  return "badge-warning";
};

export const CompaniesPage = () => {
  const [items, setItems] = useState<CompanyListItem[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [applyCompanyId, setApplyCompanyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [workerState, setWorkerState] = useState<WorkerStateResponse | null>(null);
  const [sort, setSort] = useState<CompanySort>("updated_at_desc");
  const [researchFilter, setResearchFilter] = useState<CompanyResearchStatus | "all">("all");
  const [applicationRecordFilter, setApplicationRecordFilter] = useState<ApplicationRecordFilter>("all");
  const lastForegroundRefreshAtRef = useRef(0);

  const listExtraParams = useMemo(() => {
    const p = new URLSearchParams();
    p.set("sort", sort);
    if (researchFilter !== "all") {
      p.set("research_status", researchFilter);
    }
    if (applicationRecordFilter === "never") {
      p.set("has_application", "false");
    } else if (applicationRecordFilter === "once") {
      p.set("has_application", "true");
    }
    return p;
  }, [sort, researchFilter, applicationRecordFilter]);
  const [archiveTarget, setArchiveTarget] = useState<CompanyListItem | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [archivedConflict, setArchivedConflict] = useState<ArchivedCompanyConflict | null>(null);
  const [restoreSubmitting, setRestoreSubmitting] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPage = page, options?: { force?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const response = await getCompanySummariesPage({
          page: targetPage,
          pageSize: PAGE_SIZE,
          force: options?.force,
          extraParams: listExtraParams
        });
        setItems(response.slice(0, PAGE_SIZE));
        setHasNextPage(response.length > PAGE_SIZE);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [page, listExtraParams]
  );

  useEffect(() => {
    setPage(1);
  }, [sort, researchFilter, applicationRecordFilter]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  const loadWorkerSummary = useCallback(async (options?: { force?: boolean }) => {
    setWorkerState(await getWorkerSummaryCached(options));
  }, []);

  useEffect(() => {
    void loadWorkerSummary();
  }, [loadWorkerSummary]);

  useEffect(() => {
    const refreshOnForeground = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now();
      if (now - lastForegroundRefreshAtRef.current < FOREGROUND_REFRESH_DEDUPE_MS) return;
      lastForegroundRefreshAtRef.current = now;
      void load(page, { force: true });
      void loadWorkerSummary({ force: true });
    };
    window.addEventListener("focus", refreshOnForeground);
    document.addEventListener("visibilitychange", refreshOnForeground);
    return () => {
      window.removeEventListener("focus", refreshOnForeground);
      document.removeEventListener("visibilitychange", refreshOnForeground);
    };
  }, [load, loadWorkerSummary, page]);

  useEffect(() => {
    if (items.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [items.length, page]);

  const closeCreateModal = useCallback(() => {
    setCreateOpen(false);
    setError(null);
    setRestoreError(null);
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setRestoreError(null);
    setArchivedConflict(null);
    setCreateSubmitting(true);
    try {
      await api.createCompany({
        name,
        website: website.trim() || null,
        acknowledge_reuse_of_archived_company: false
      });
      invalidateCompanySummariesCache();
      setName("");
      setWebsite("");
      setCreateOpen(false);
      await load(page, { force: true });
    } catch (err) {
      if (err instanceof ApiConflictError) {
        if (err.detail.code === "archived_company_name_exists") {
          setCreateOpen(false);
          setArchivedConflict(parseArchivedCompanyConflict(err.detail, name.trim()));
          return;
        }
        if (err.detail.code === "company_name_exists") {
          setError("A company with this name already exists. Choose a different name.");
          return;
        }
      }
      setError((err as Error).message);
    } finally {
      setCreateSubmitting(false);
    }
  };

  const onRestoreArchivedCompany = async () => {
    if (!archivedConflict) return;
    setRestoreError(null);
    setRestoreSubmitting(true);
    try {
      await api.createCompany({
        name,
        website: website.trim() || null,
        acknowledge_reuse_of_archived_company: true
      });
      invalidateCompanySummariesCache();
      setName("");
      setWebsite("");
      setArchivedConflict(null);
      setRestoreError(null);
      setCreateOpen(false);
      await load(page, { force: true });
    } catch (err) {
      setRestoreError((err as Error).message);
    } finally {
      setRestoreSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="card bg-base-100 p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Companies</h2>
            {workerState?.max ? (
              <p className="mt-1 text-xs opacity-70">
                {(workerState.max.company_researcher ?? 0) > 0
                  ? `${workerState.active.company_researcher ?? 0}/${workerState.max.company_researcher} Researchers are running`
                  : "No current active worker"}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                void load(page, { force: true });
                invalidateWorkerSummaryCache();
                void loadWorkerSummary({ force: true });
              }}
            >
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-circle btn-primary btn-sm"
              title="New company"
              aria-label="New company"
              onClick={() => {
                setError(null);
                setArchivedConflict(null);
                setRestoreError(null);
                setCreateOpen(true);
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex min-w-[200px] max-w-xs flex-nowrap items-center gap-2">
            <span className="shrink-0 text-xs opacity-70">Order by</span>
            <select
              className="select select-bordered select-sm min-w-0 grow"
              aria-label="Order companies by"
              value={sort}
              onChange={(e) => setSort(e.target.value as CompanySort)}
            >
              <option value="updated_at_desc">{companySortLabel("updated_at_desc")}</option>
              <option value="created_at_desc">{companySortLabel("created_at_desc")}</option>
              <option value="updated_at_asc">{companySortLabel("updated_at_asc")}</option>
              <option value="name_asc">{companySortLabel("name_asc")}</option>
            </select>
          </div>
          <label className="form-control w-full min-w-[160px] max-w-xs">
            <span className="label-text text-xs">Research</span>
            <select
              className="select select-bordered select-sm w-full"
              value={researchFilter}
              onChange={(e) => setResearchFilter(e.target.value as CompanyResearchStatus | "all")}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="indexing">Indexing</option>
              <option value="indexed">Indexed</option>
              <option value="invalid">Invalid</option>
            </select>
          </label>
          <label className="form-control w-full min-w-[160px] max-w-xs">
            <span className="label-text text-xs">Applications</span>
            <select
              className="select select-bordered select-sm w-full"
              value={applicationRecordFilter}
              onChange={(e) => setApplicationRecordFilter(e.target.value as ApplicationRecordFilter)}
            >
              <option value="all">All</option>
              <option value="never">No application records</option>
              <option value="once">Has application records</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th className="whitespace-nowrap">Research</th>
                <th className="whitespace-nowrap">Applications</th>
                <th>Website</th>
                <th className="whitespace-nowrap">Updated</th>
                <th className="min-w-[140px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((company) => (
                <tr key={company.id} className="hover:bg-base-200">
                  <td className="font-medium">
                    <Link to={`/companies/${company.id}`} className="link link-primary">
                      {company.name}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge badge-sm ${researchBadgeClass(company.research_status)}`}>
                      {researchLabel(company.research_status)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-xs">
                    {company.has_application ? (
                      <span className="badge badge-sm badge-success badge-outline">Has application records</span>
                    ) : (
                      <span className="opacity-50">No application records</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate text-xs opacity-80" title={company.website ?? undefined}>
                    {company.website ?? "—"}
                  </td>
                  <td className="whitespace-nowrap text-xs opacity-80">
                    {new Date(company.updated_at).toLocaleString()}
                  </td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        className="btn btn-xs btn-primary btn-outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setError(null);
                          setApplyCompanyId(company.id);
                          setApplicationOpen(true);
                        }}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-error btn-outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setError(null);
                          setArchiveTarget(company);
                        }}
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="p-4 text-sm opacity-70">No companies yet.</p>}
        </div>
        <TablePagination
          page={page}
          hasNextPage={hasNextPage}
          onPageChange={setPage}
          disabled={loading}
          pageSize={PAGE_SIZE}
          visibleCount={items.length}
          itemLabel="companies"
        />
        <p className="mt-2 text-xs opacity-60">Open the company name link to view and edit full company details.</p>
      </section>

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title="New company"
        size="md"
      >
        <form className="space-y-3" onSubmit={onSubmit} aria-label="Create new company">
          <label className="form-control w-full">
            <span className="label-text">Name</span>
            <input
              className="input input-bordered w-full"
              placeholder="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setArchivedConflict(null);
                setRestoreError(null);
              }}
              required
              autoFocus={createOpen}
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text">Website</span>
            <input
              className="input input-bordered w-full"
              placeholder="Website"
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
                setArchivedConflict(null);
                setRestoreError(null);
              }}
            />
          </label>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={closeCreateModal}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={createSubmitting}>
              {createSubmitting ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={archivedConflict !== null}
        onClose={() => {
          if (restoreSubmitting) return;
          setArchivedConflict(null);
          setRestoreError(null);
          setCreateOpen(true);
        }}
        title="Restore archived company"
        size="md"
        closeDisabled={restoreSubmitting}
      >
        {archivedConflict && (
          <div className="space-y-3 text-sm">
            <p>
              A company named <span className="font-medium">{archivedConflict.name}</span> already exists in the
              archive.
            </p>
            <p className="opacity-80">
              Restoring will reuse this archived record and return it to your active company list instead of creating
              a second company with the same name.
            </p>
            <div className="rounded border border-base-300 bg-base-200 p-3">
              <p>
                <span className="font-medium">Name:</span> {archivedConflict.name}
              </p>
              {archivedConflict.website && (
                <p className="mt-1">
                  <span className="font-medium">Website:</span> {archivedConflict.website}
                </p>
              )}
              {archivedConflict.archiveReason && (
                <p className="mt-1">
                  <span className="font-medium">Archived reason:</span> {archivedConflict.archiveReason}
                </p>
              )}
              {archivedConflict.archivedAt && (
                <p className="mt-1">
                  <span className="font-medium">Archived at:</span> {new Date(archivedConflict.archivedAt).toLocaleString()}
                </p>
              )}
              {archivedConflict.companyId && (
                <p className="mt-1 opacity-70">
                  <span className="font-medium">ID:</span> {archivedConflict.companyId}
                </p>
              )}
            </div>
            {restoreError && <p className="text-error">{restoreError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={restoreSubmitting}
                onClick={() => {
                  setArchivedConflict(null);
                  setRestoreError(null);
                  setCreateOpen(true);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-warning"
                disabled={restoreSubmitting}
                onClick={() => void onRestoreArchivedCompany()}
              >
                {restoreSubmitting ? "Restoring..." : "Restore archived company"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <NewApplicationModal
        open={applicationOpen}
        onClose={() => {
          setApplicationOpen(false);
          setApplyCompanyId(null);
        }}
        companies={items}
        editing={null}
        initialCompanyId={applyCompanyId}
        onSuccess={async () => {
          invalidateCompanySummariesCache();
          await load(page, { force: true });
          setApplicationOpen(false);
          setApplyCompanyId(null);
        }}
      />

      <ArchiveCompanyModal
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        company={archiveTarget ? { id: archiveTarget.id, name: archiveTarget.name } : null}
        onArchived={async () => {
          invalidateCompanySummariesCache();
          await load(page, { force: true });
          setArchiveTarget(null);
        }}
      />
    </div>
  );
};

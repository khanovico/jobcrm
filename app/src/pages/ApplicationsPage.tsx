import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ArchiveApplicationModal } from "../components/ArchiveApplicationModal";
import { ApplicationWorkflowOverrideModal } from "../components/ApplicationWorkflowOverrideModal";
import { NewApplicationModal } from "../components/NewApplicationModal";
import { ProfileNameChips } from "../components/ProfileNameChips";
import { TablePagination } from "../components/TablePagination";
import { api } from "../api";
import { applicationStatusBadgeClass, formatApplicationStatusLabel } from "../applicationStatus";
import {
  applicationSortLabel,
  type ApplicationTableSort
} from "../applicationTableSort";
import {
  getSelectedAppliedProfileNames,
  initializeSelectedAppliedProfileNames,
  setSelectedAppliedProfileNames
} from "../state/applicationsFilters";
import { ApplicationListItem, WorkerStateResponse } from "../types";

const PAGE_SIZE = 15;
const EMPTY_APPLIED_PROFILE_MATCH = "__jobcrm_no_applied_profile_match__";

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

export type ApplicationListMode = "pending" | "applied" | "archived" | "all";

export const ApplicationsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ApplicationListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listMode, setListMode] = useState<ApplicationListMode>("pending");
  const [appliedProfileFilterOpen, setAppliedProfileFilterOpen] = useState(false);
  const [selectedAppliedProfileNames, setSelectedAppliedProfileNamesState] = useState<string[] | null>(null);
  const appliedProfilesFilterButtonRef = useRef<HTMLButtonElement | null>(null);
  const [appliedProfilesFilterPosition, setAppliedProfilesFilterPosition] = useState<{ top: number; left: number } | null>(
    null
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationListItem | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ApplicationListItem | null>(null);
  const [statusOverrideApplication, setStatusOverrideApplication] = useState<ApplicationListItem | null>(null);
  const [workerState, setWorkerState] = useState<WorkerStateResponse | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [tableSort, setTableSort] = useState<ApplicationTableSort>("updated_at_desc");
  const [profileNamesForFilter, setProfileNamesForFilter] = useState<string[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [debouncedCompanySearch, setDebouncedCompanySearch] = useState("");
  const previousAvailableProfileNamesRef = useRef<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedCompanySearch(companySearch.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [companySearch]);

  const availableAppliedProfileNames = profileNamesForFilter;

  useEffect(() => {
    if (availableAppliedProfileNames.length === 0) {
      setSelectedAppliedProfileNamesState(null);
      previousAvailableProfileNamesRef.current = [];
      return;
    }
    const prev = previousAvailableProfileNamesRef.current;
    const next = availableAppliedProfileNames;
    const fromStore = getSelectedAppliedProfileNames() ?? next;
    const hadAllOfPrevious =
      prev.length > 0 &&
      fromStore.length === prev.length &&
      prev.every((n) => fromStore.includes(n));
    if (hadAllOfPrevious && next.length > prev.length) {
      setSelectedAppliedProfileNames(next);
      setSelectedAppliedProfileNamesState(next);
    } else {
      setSelectedAppliedProfileNamesState(initializeSelectedAppliedProfileNames(next));
    }
    previousAvailableProfileNamesRef.current = next;
  }, [availableAppliedProfileNames]);

  const updateAppliedProfileSelection = (nextSelection: string[]) => {
    const sanitizedSelection = nextSelection.filter((name) => availableAppliedProfileNames.includes(name));
    setSelectedAppliedProfileNamesState(sanitizedSelection);
    setSelectedAppliedProfileNames(sanitizedSelection);
    setPage(1);
  };

  const applicationFilterParams = useMemo(() => {
    const p = new URLSearchParams();
    if (listMode === "pending") {
      p.set("exclude_status", "archived");
      p.set("applied", "false");
    } else if (listMode === "applied") {
      p.set("exclude_status", "archived");
      p.set("applied", "true");
    } else if (listMode === "archived") {
      p.set("status_filter", "archived");
    }
    if (debouncedCompanySearch) {
      p.set("company_search", debouncedCompanySearch);
    }
    return p;
  }, [debouncedCompanySearch, listMode]);

  const loadProfileNamesForFilter = useCallback(async () => {
    try {
      const facets = await api.listApplicationAppliedProfileFacets(applicationFilterParams);
      const names = Array.from(
        new Set(facets.profile_names.map((name) => name.trim()).filter((name) => name.length > 0))
      ).sort((a, b) => a.localeCompare(b));
      setProfileNamesForFilter(names);
    } catch {
      setProfileNamesForFilter([]);
    }
  }, [applicationFilterParams]);

  const listParamsKey = useMemo(() => {
    const p = new URLSearchParams(applicationFilterParams);
    const allProfilesSelected =
      selectedAppliedProfileNames === null ||
      (selectedAppliedProfileNames.length === availableAppliedProfileNames.length &&
        availableAppliedProfileNames.every((name) => selectedAppliedProfileNames.includes(name)));
    if (availableAppliedProfileNames.length > 0 && selectedAppliedProfileNames !== null && !allProfilesSelected) {
      const namesToFilter =
        selectedAppliedProfileNames.length > 0
          ? selectedAppliedProfileNames
          : [EMPTY_APPLIED_PROFILE_MATCH];
      for (const profileName of namesToFilter) {
        p.append("applied_profile_names", profileName);
      }
    }
    p.set("sort", tableSort);
    return p.toString();
  }, [applicationFilterParams, availableAppliedProfileNames, selectedAppliedProfileNames, tableSort]);

  const load = useCallback(
    async (targetPage = page) => {
      setError(null);
      try {
        const params = new URLSearchParams(listParamsKey);
        params.set("skip", String((targetPage - 1) * PAGE_SIZE));
        params.set("limit", String(PAGE_SIZE));
        const [applicationItems, workers] = await Promise.all([
          api.listApplications(params),
          api.getWorkerState().catch(() => null)
        ]);
        setItems(applicationItems);
        setHasNextPage(applicationItems.length === PAGE_SIZE);
        setWorkerState(workers);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [listParamsKey, page]
  );

  useEffect(() => {
    setPage(1);
  }, [listMode, debouncedCompanySearch]);

  useEffect(() => {
    setPage(1);
  }, [tableSort]);

  useEffect(() => {
    void loadProfileNamesForFilter();
  }, [loadProfileNamesForFilter]);

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    if (items.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
    }
  }, [items.length, page]);

  const openCreateModal = () => {
    setError(null);
    setEditing(null);
    setCreateOpen(true);
  };

  const openEditModal = (application: ApplicationListItem) => {
    setError(null);
    setEditing(application);
    setCreateOpen(true);
  };

  const closeModal = () => {
    setCreateOpen(false);
    setEditing(null);
  };

  useEffect(() => {
    if (!appliedProfileFilterOpen) return;

    const updatePosition = () => {
      const button = appliedProfilesFilterButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      setAppliedProfilesFilterPosition({
        top: rect.bottom + 6,
        left: Math.max(8, Math.min(rect.right - 256, window.innerWidth - 264))
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [appliedProfileFilterOpen]);

  return (
    <div className="space-y-4">
      <section className="card bg-base-100 p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Applications</h2>
            {workerState?.max ? (
              <p className="mt-1 text-xs opacity-70">
                <span className="mr-3">
                  {(workerState.max.ppa_analyser ?? 0) > 0
                    ? `${workerState.active.ppa_analyser ?? 0}/${workerState.max.ppa_analyser} PPA analysers running`
                    : "No current active PPA analyser worker"}
                </span>
                <span>
                  {(workerState.max.application_drafter ?? 0) > 0
                    ? `${workerState.active.application_drafter ?? 0}/${workerState.max.application_drafter} Application drafters running`
                    : "No current active application drafter worker"}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-0 max-w-[200px] flex-nowrap items-center gap-2">
              <span className="shrink-0 text-xs opacity-70">Company</span>
              <input
                className="input input-bordered input-sm min-w-0 grow"
                placeholder="Search"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                aria-label="Filter applications by company name"
              />
            </div>
            <div className="flex min-w-0 max-w-[280px] flex-nowrap items-center gap-2">
              <span className="shrink-0 text-xs opacity-70">Order by</span>
              <select
                className="select select-bordered select-sm min-w-0 grow max-w-[220px]"
                aria-label="Order applications by"
                value={tableSort}
                onChange={(e) => setTableSort(e.target.value as ApplicationTableSort)}
              >
                <option value="updated_at_desc">{applicationSortLabel("updated_at_desc")}</option>
                <option value="updated_at_asc">{applicationSortLabel("updated_at_asc")}</option>
                <option value="created_at_desc">{applicationSortLabel("created_at_desc")}</option>
                <option value="created_at_asc">{applicationSortLabel("created_at_asc")}</option>
              </select>
            </div>
            <div className="join join-horizontal border border-base-300">
              {(
                [
                  ["pending", "Pending"],
                  ["applied", "Applied"],
                  ["archived", "Archived"],
                  ["all", "All"]
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`btn btn-sm join-item ${listMode === value ? "btn-active" : "btn-ghost"}`}
                  onClick={() => setListMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              title="Re-select all profile names in the Applied profiles column filter (avoids hiding rows when new profile names appear)"
              onClick={() => {
                if (availableAppliedProfileNames.length > 0) {
                  updateAppliedProfileSelection(availableAppliedProfileNames);
                }
              }}
            >
              Reset profile filter
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load(page)}>
              Refresh
            </button>
            <button
              type="button"
              className="btn btn-circle btn-primary btn-sm"
              title="New application"
              aria-label="New application"
              onClick={openCreateModal}
            >
              <PlusIcon />
            </button>
          </div>
        </div>
        {error && !createOpen && <div className="alert alert-error mb-2 text-sm">{error}</div>}
        <div className="overflow-x-auto rounded-lg border border-base-300">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th className="min-w-[220px]">
                  <div onClick={(event) => event.stopPropagation()}>
                    <button
                      ref={appliedProfilesFilterButtonRef}
                      type="button"
                      className="btn btn-ghost btn-xs normal-case"
                      aria-label="Applied profiles filter"
                      onClick={() => setAppliedProfileFilterOpen((open) => !open)}
                    >
                      Applied profiles
                    </button>
                  </div>
                </th>
                <th className="whitespace-nowrap">Applied</th>
                <th className="whitespace-nowrap">Updated</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((application) => (
                <tr
                  key={application.id}
                  className="cursor-pointer hover:bg-base-200"
                  onClick={() => navigate(`/applications/${application.id}`)}
                >
                  <td className="font-medium">{application.company_name}</td>
                  <td>
                    <span className={`${applicationStatusBadgeClass(application.status)} badge-sm`}>
                      {formatApplicationStatusLabel(application.status)}
                    </span>
                  </td>
                  <td className="max-w-[220px]" onClick={(e) => e.stopPropagation()}>
                    <ProfileNameChips profiles={application.applied_profiles ?? []} />
                  </td>
                  <td className="whitespace-nowrap text-xs opacity-80">{application.applied_at ?? "—"}</td>
                  <td className="whitespace-nowrap text-xs opacity-80">
                    {new Date(application.updated_at).toLocaleString()}
                  </td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setStatusOverrideApplication(application);
                        }}
                      >
                        Set status…
                      </button>
                      <button
                        type="button"
                        className="btn btn-xs btn-ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(application);
                        }}
                      >
                        Edit
                      </button>
                      {application.status !== "archived" && (
                        <>
                          <button
                            type="button"
                            className={`btn btn-xs ${application.applied ? "btn-outline" : "btn-success"}`}
                            disabled={!application.applied && application.status !== "application_ready"}
                            title={
                              !application.applied && application.status !== "application_ready"
                                ? "Mark applied only when status is Application ready"
                                : undefined
                            }
                            onClick={async (e) => {
                              e.stopPropagation();
                              const nextApplied = !application.applied;
                              await api.markApplied(application.id, nextApplied);
                              await load(page);
                            }}
                          >
                            {application.applied ? "Unmark Applied" : "Mark Applied"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-warning btn-outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setArchiveTarget(application);
                              setArchiveOpen(true);
                            }}
                          >
                            Archive
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="p-4 text-sm opacity-70">No applications in this view.</p>}
        </div>
        <TablePagination page={page} hasNextPage={hasNextPage} onPageChange={setPage} />
        {appliedProfileFilterOpen && appliedProfilesFilterPosition ? (
          <>
            <button
              type="button"
              aria-label="Close applied profiles filter"
              className="fixed inset-0 z-30 cursor-default bg-transparent"
              onClick={() => setAppliedProfileFilterOpen(false)}
            />
            <div
              className="fixed z-40 w-64 rounded-lg border border-base-300 bg-base-100 p-2 shadow-xl"
              style={{ top: appliedProfilesFilterPosition.top, left: appliedProfilesFilterPosition.left }}
            >
              <div className="mb-2 flex items-center justify-between gap-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label="Select all profiles"
                  onClick={() => updateAppliedProfileSelection(availableAppliedProfileNames)}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  aria-label="Unselect all profiles"
                  onClick={() => updateAppliedProfileSelection([])}
                >
                  Unselect all
                </button>
              </div>
              <div className="max-h-56 space-y-1 overflow-auto pr-1">
                {availableAppliedProfileNames.length === 0 ? (
                  <p className="text-xs opacity-70">No profiles available</p>
                ) : (
                  availableAppliedProfileNames.map((profileName) => (
                    <label key={profileName} className="label cursor-pointer justify-start gap-2 py-1">
	                      <input
	                        type="checkbox"
	                        className="checkbox checkbox-sm"
	                        checked={(selectedAppliedProfileNames ?? []).includes(profileName)}
                        onChange={(event) => {
	                          if (event.target.checked) {
	                            updateAppliedProfileSelection(
	                              Array.from(new Set([...(selectedAppliedProfileNames ?? []), profileName])).sort((a, b) =>
	                                a.localeCompare(b)
	                              )
	                            );
                            return;
                          }
	                          updateAppliedProfileSelection((selectedAppliedProfileNames ?? []).filter((name) => name !== profileName));
                        }}
                      />
                      <span className="label-text text-xs">{profileName}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}
        <p className="mt-2 text-xs opacity-60">
          Click a row to open application detail. Use <strong>Pending</strong> for in-flight work, <strong>Applied</strong> for already-submitted applications, <strong>Archived</strong> to review closed pipelines, <strong>All</strong> for everything.
        </p>
      </section>

      <NewApplicationModal
        open={createOpen}
        onClose={closeModal}
        companies={editing ? [{ id: editing.company_id, name: editing.company_name }] : []}
        editing={editing}
        onSuccess={load}
      />

      <ApplicationWorkflowOverrideModal
        open={statusOverrideApplication !== null}
        onClose={() => setStatusOverrideApplication(null)}
        application={statusOverrideApplication}
        onSaved={async () => {
          setStatusOverrideApplication(null);
          await load(page);
        }}
      />

      <ArchiveApplicationModal
        open={archiveOpen && !!archiveTarget}
        onClose={() => {
          setArchiveOpen(false);
          setArchiveTarget(null);
        }}
        applicationId={archiveTarget?.id ?? ""}
        companyLabel={archiveTarget ? archiveTarget.company_name ?? archiveTarget.company_id : ""}
        onArchived={load}
      />
    </div>
  );
};

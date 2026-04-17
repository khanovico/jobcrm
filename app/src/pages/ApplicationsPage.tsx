import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ArchiveApplicationModal } from "../components/ArchiveApplicationModal";
import { NewApplicationModal } from "../components/NewApplicationModal";
import { ProfileNameChips } from "../components/ProfileNameChips";
import { api } from "../api";
import { ApplicationListItem, Company } from "../types";

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

export type ApplicationListMode = "pending" | "applied" | "archived" | "all";

const getStatusBadgeClass = (status: string) => {
  if (status.endsWith("_ready")) {
    return "badge border-info/30 bg-info/10 text-info";
  }
  if (status === "pending_preparation") {
    return "badge badge-ghost";
  }
  return "badge badge-ghost";
};

export const ApplicationsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ApplicationListItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [listMode, setListMode] = useState<ApplicationListMode>("pending");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationListItem | null>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<ApplicationListItem | null>(null);

  const companyNameById = (id: string) => companies.find((c) => c.id === id)?.name ?? id;

  const listParams = useMemo(() => {
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
    return p;
  }, [listMode]);

  const load = async () => {
    setError(null);
    try {
      const [applicationItems, companyItems] = await Promise.all([
        api.listApplications(listParams),
        api.listCompanies()
      ]);
      setItems(applicationItems);
      setCompanies(companyItems);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, [listParams]);

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

  return (
    <div className="space-y-4">
      <section className="card bg-base-100 p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Applications</h2>
          <div className="flex flex-wrap items-center gap-2">
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
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
                <th className="min-w-[140px]">Applied profiles</th>
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
                  <td className="font-medium">{companyNameById(application.company_id)}</td>
                  <td>
                    <span className={`${getStatusBadgeClass(application.status)} badge-sm`}>
                      {application.status}
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
                            onClick={async (e) => {
                              e.stopPropagation();
                              const nextApplied = !application.applied;
                              await api.markApplied(application.id, nextApplied);
                              if (listMode === "all" || listMode === "archived") {
                                await load();
                                return;
                              }
                              setListMode(nextApplied ? "applied" : "pending");
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
        <p className="mt-2 text-xs opacity-60">
          Click a row to open application detail. Use <strong>Pending</strong> for in-flight work, <strong>Applied</strong> for already-submitted applications, <strong>Archived</strong> to review closed pipelines, <strong>All</strong> for everything.
        </p>
      </section>

      <NewApplicationModal
        open={createOpen}
        onClose={closeModal}
        companies={companies}
        editing={editing}
        onSuccess={load}
      />

      <ArchiveApplicationModal
        open={archiveOpen && !!archiveTarget}
        onClose={() => {
          setArchiveOpen(false);
          setArchiveTarget(null);
        }}
        applicationId={archiveTarget?.id ?? ""}
        companyLabel={archiveTarget ? companyNameById(archiveTarget.company_id) : ""}
        onArchived={load}
      />
    </div>
  );
};

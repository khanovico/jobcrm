import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Modal } from "../components/Modal";
import { ProfileNameChips } from "../components/ProfileNameChips";
import { api } from "../api";
import { ApplicationListItem, ApplicationStatus, Company } from "../types";

const statuses: ApplicationStatus[] = [
  "draft",
  "pending_preparation",
  "researching",
  "analysis_ready",
  "preparation_ready",
  "applied",
  "archived"
];

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

export const ApplicationsPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ApplicationListItem[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApplicationListItem | null>(null);

  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("draft");
  const [jobLink, setJobLink] = useState("");
  const [jobDescription, setJobDescription] = useState("");

  const companyNameById = (id: string) => companies.find((c) => c.id === id)?.name ?? id;

  const load = async () => {
    setError(null);
    try {
      const [applicationItems, companyItems] = await Promise.all([
        api.listApplications(),
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
  }, []);

  const resetForm = () => {
    setStatus("draft");
    setJobLink("");
    setJobDescription("");
    setCompanyId(companies[0]?.id ?? "");
  };

  useEffect(() => {
    if (companies.length === 0) {
      setCompanyId("");
      return;
    }
    if (!companyId || !companies.some((c) => c.id === companyId)) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const openCreateModal = () => {
    setError(null);
    setEditing(null);
    resetForm();
    setCreateOpen(true);
  };

  const openEditModal = (application: ApplicationListItem) => {
    setError(null);
    setEditing(application);
    setCompanyId(application.company_id);
    setStatus(application.status);
    setJobLink(application.job_post?.job_link ?? "");
    setJobDescription(application.job_post?.job_description ?? "");
    setCreateOpen(true);
  };

  const closeModal = () => {
    setCreateOpen(false);
    setEditing(null);
    resetForm();
  };

  const buildJobPostPayload = () => {
    const hasJob = jobLink.trim() || jobDescription.trim();
    if (!hasJob) return undefined;
    return {
      job_link: jobLink.trim() || null,
      job_description: jobDescription.trim() || null
    };
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!companyId) {
      setError("Select a company.");
      return;
    }
    setError(null);
    try {
      const jobPost = buildJobPostPayload();
      if (editing) {
        await api.updateApplication(editing.id, {
          company_id: companyId,
          status,
          job_post: jobPost ?? null
        });
      } else {
        await api.createApplication({
          company_id: companyId,
          status,
          job_post: jobPost
        });
      }
      closeModal();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const modalTitle = editing ? "Edit application" : "New application";

  return (
    <div className="space-y-4">
      <section className="card bg-base-100 p-4 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Applications</h2>
          <div className="flex items-center gap-2">
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
                    <span className="badge badge-ghost badge-sm">{application.status}</span>
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
                      <button
                        type="button"
                        className="btn btn-xs btn-success"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await api.markApplied(application.id, true);
                          await load();
                        }}
                      >
                        Mark Applied
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <p className="p-4 text-sm opacity-70">No applications yet.</p>}
        </div>
        <p className="mt-2 text-xs opacity-60">Click a row to open application detail.</p>
      </section>

      <Modal open={createOpen} onClose={closeModal} title={modalTitle} size="lg">
        <form className="space-y-3" onSubmit={onSubmit} aria-label={modalTitle}>
          {companies.length === 0 ? (
            <div className="rounded-lg border border-base-300 bg-base-200 p-3 text-sm">
              <p className="mb-2">Add at least one company before creating an application.</p>
              <Link to="/companies" className="link link-primary">
                Go to Companies
              </Link>
            </div>
          ) : (
            <label className="form-control w-full">
              <span className="label-text">Company</span>
              <select
                className="select select-bordered w-full"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="form-control w-full">
            <span className="label-text">Status</span>
            <select
              className="select select-bordered w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value as ApplicationStatus)}
            >
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control w-full">
            <span className="label-text">Job link (optional)</span>
            <input
              className="input input-bordered w-full"
              value={jobLink}
              onChange={(e) => setJobLink(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="form-control w-full">
            <span className="label-text">Job description (optional)</span>
            <textarea
              className="textarea textarea-bordered w-full text-sm"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={3}
            />
          </label>
          {error && <p className="text-sm text-error">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={companies.length === 0}>
              {editing ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

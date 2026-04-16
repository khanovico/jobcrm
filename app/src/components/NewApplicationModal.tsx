import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { Modal } from "./Modal";
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

type Props = {
  open: boolean;
  onClose: () => void;
  companies: Company[];
  editing: ApplicationListItem | null;
  /** When creating from Companies "Apply", preselect this company */
  initialCompanyId?: string | null;
  onSuccess: () => void | Promise<void>;
};

export const NewApplicationModal = ({
  open,
  onClose,
  companies,
  editing,
  initialCompanyId,
  onSuccess
}: Props) => {
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("pending_preparation");
  const [jobLink, setJobLink] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setStatus("pending_preparation");
    setJobLink("");
    setJobDescription("");
    setCompanyId(companies[0]?.id ?? "");
  };

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setCompanyId(editing.company_id);
      setStatus(editing.status);
      setJobLink(editing.job_post?.job_link ?? "");
      setJobDescription(editing.job_post?.job_description ?? "");
      return;
    }
    resetForm();
    if (initialCompanyId && companies.some((c) => c.id === initialCompanyId)) {
      setCompanyId(initialCompanyId);
    }
  }, [open, editing, initialCompanyId, companies]);

  useEffect(() => {
    if (companies.length === 0) {
      setCompanyId("");
      return;
    }
    if (!companyId || !companies.some((c) => c.id === companyId)) {
      setCompanyId(companies[0].id);
    }
  }, [companies, companyId]);

  const closeModal = () => {
    onClose();
    setError(null);
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
      await onSuccess();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const modalTitle = editing ? "Edit application" : "New application";

  return (
    <Modal open={open} onClose={closeModal} title={modalTitle} size="lg">
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
  );
};

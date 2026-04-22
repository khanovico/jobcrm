import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Modal } from "./Modal";
import { api } from "../api";
import { ApplicationListItem } from "../types";

const COMPANY_SEARCH_LIMIT = 20;

type CompanyOption = {
  id: string;
  name: string;
};

const mergeCompanyOptions = (...groups: CompanyOption[][]): CompanyOption[] => {
  const seen = new Set<string>();
  const merged: CompanyOption[] = [];
  for (const group of groups) {
    for (const company of group) {
      if (seen.has(company.id)) continue;
      seen.add(company.id);
      merged.push(company);
    }
  }
  return merged;
};

type Props = {
  open: boolean;
  onClose: () => void;
  companies: CompanyOption[];
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
  const [companySearch, setCompanySearch] = useState("");
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [jobLink, setJobLink] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const companySearchRequestRef = useRef(0);
  const selectedCompany = useMemo(
    () => companyOptions.find((company) => company.id === companyId) ?? companies.find((company) => company.id === companyId) ?? null,
    [companies, companyId, companyOptions]
  );
  const selectedCompanyRef = useRef<CompanyOption | null>(null);

  useEffect(() => {
    selectedCompanyRef.current = selectedCompany;
  }, [selectedCompany]);

  const resetForm = () => {
    setJobLink("");
    setJobDescription("");
    setCompanyId(companies[0]?.id ?? "");
    setCompanySearch("");
    setCompanyOptions(companies);
  };

  useEffect(() => {
    if (!open) return;
    const initialCompanyOptions = editing
      ? mergeCompanyOptions([{ id: editing.company_id, name: editing.company_name }], companies)
      : companies;
    setCompanyOptions(initialCompanyOptions);
    if (editing) {
      setCompanyId(editing.company_id);
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
    if (companyOptions.length === 0) {
      setCompanyId("");
      return;
    }
    if (!companyId || !companyOptions.some((c) => c.id === companyId)) {
      setCompanyId(companyOptions[0].id);
    }
  }, [companyOptions, companyId]);

  const loadCompanyOptions = useCallback(
    async (searchTerm: string) => {
      const requestId = companySearchRequestRef.current + 1;
      companySearchRequestRef.current = requestId;
      setLoadingCompanies(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(COMPANY_SEARCH_LIMIT));
        if (searchTerm.trim()) {
          params.set("search", searchTerm.trim());
        }
        const result = await api.listCompanies(params);
        if (companySearchRequestRef.current !== requestId) return;
        const fetchedOptions = result.map((company) => ({ id: company.id, name: company.name }));
        setCompanyOptions(
          mergeCompanyOptions(
            selectedCompanyRef.current ? [selectedCompanyRef.current] : [],
            editing ? [{ id: editing.company_id, name: editing.company_name }] : [],
            searchTerm.trim() ? [] : companies,
            fetchedOptions
          )
        );
      } catch (err) {
        if (companySearchRequestRef.current !== requestId) return;
        setError((err as Error).message);
      } finally {
        if (companySearchRequestRef.current === requestId) {
          setLoadingCompanies(false);
        }
      }
    },
    [companies, editing]
  );

  useEffect(() => {
    if (!open) return;
    if (!companySearch.trim() && companies.length > 0) {
      setLoadingCompanies(false);
      setCompanyOptions(
        mergeCompanyOptions(editing ? [{ id: editing.company_id, name: editing.company_name }] : [], companies)
      );
      return;
    }
    const timer = window.setTimeout(() => {
      void loadCompanyOptions(companySearch);
    }, companySearch.trim() ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [companies, companySearch, editing, loadCompanyOptions, open]);

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
          job_post: jobPost ?? null
        });
      } else {
        await api.createApplication({
          company_id: companyId,
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
        {loadingCompanies ? (
          <div className="rounded-lg border border-base-300 bg-base-200 p-3 text-sm">Loading companies...</div>
        ) : companyOptions.length === 0 && !companySearch.trim() ? (
          <div className="rounded-lg border border-base-300 bg-base-200 p-3 text-sm">
            <p className="mb-2">Add at least one company before creating an application.</p>
            <Link to="/companies" className="link link-primary">
              Go to Companies
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="form-control w-full">
              <span className="label-text">Search companies</span>
              <input
                className="input input-bordered w-full"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Search by company name"
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text">Company</span>
              <select
                className="select select-bordered w-full"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
              >
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            {companyOptions.length === 0 && (
              <p className="text-xs opacity-70">No companies matched that search.</p>
            )}
          </div>
        )}
        {!editing && (
          <p className="text-xs opacity-70">
            Initial status is set from the company&apos;s research state (indexed companies start in PPA pending).
          </p>
        )}
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
          <button type="submit" className="btn btn-primary" disabled={!companyId || loadingCompanies}>
            {editing ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

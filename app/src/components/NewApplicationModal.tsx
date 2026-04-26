import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Modal } from "./Modal";
import { api, ApiConflictError } from "../api";
import { ApplicationListItem } from "../types";

const COMPANY_SEARCH_LIMIT = 20;

type CompanyOption = {
  id: string;
  name: string;
  website?: string | null;
};

type ArchivedCompanyConflict = {
  company_id: string;
  name: string;
  archive_reason?: string | null;
};

type FormSnapshot = {
  companyId: string;
  companyName: string;
  companyWebsite: string;
  jobLink: string;
  jobDescription: string;
};

const EMPTY_FORM_SNAPSHOT: FormSnapshot = {
  companyId: "",
  companyName: "",
  companyWebsite: "",
  jobLink: "",
  jobDescription: ""
};

const hasFormChanges = (snapshot: FormSnapshot, initialSnapshot: FormSnapshot): boolean =>
  snapshot.companyId !== initialSnapshot.companyId ||
  snapshot.companyName !== initialSnapshot.companyName ||
  snapshot.companyWebsite !== initialSnapshot.companyWebsite ||
  snapshot.jobLink !== initialSnapshot.jobLink ||
  snapshot.jobDescription !== initialSnapshot.jobDescription;

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
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [companyOptions, setCompanyOptions] = useState<CompanyOption[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [jobLink, setJobLink] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [archivedConflict, setArchivedConflict] = useState<ArchivedCompanyConflict | null>(null);
  const [duplicateCompany, setDuplicateCompany] = useState<CompanyOption | null>(null);
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<FormSnapshot>(EMPTY_FORM_SNAPSHOT);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const companySearchRequestRef = useRef(0);
  const formResetKeyRef = useRef<string | null>(null);
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
    setCompanyId("");
    setCompanyName("");
    setCompanyWebsite("");
    setCompanySearch("");
    setCompanyOptions(companies);
    setArchivedConflict(null);
    setDuplicateCompany(null);
  };

  const formSnapshot = useMemo<FormSnapshot>(
    () => ({
      companyId,
      companyName,
      companyWebsite,
      jobLink,
      jobDescription
    }),
    [companyId, companyName, companyWebsite, jobLink, jobDescription]
  );
  const isDirty = hasFormChanges(formSnapshot, initialFormSnapshot);

  useEffect(() => {
    if (!open) {
      formResetKeyRef.current = null;
      setInitialFormSnapshot(EMPTY_FORM_SNAPSHOT);
      return;
    }
    const formResetKey = editing
      ? `edit:${editing.id}:${editing.company_id}:${editing.updated_at}`
      : `create:${initialCompanyId ?? ""}`;
    if (formResetKeyRef.current === formResetKey) return;
    formResetKeyRef.current = formResetKey;
    const initialCompanyOptions = editing
      ? mergeCompanyOptions([{ id: editing.company_id, name: editing.company_name }], companies)
      : companies;
    setCompanyOptions(initialCompanyOptions);
    if (editing) {
      const initialJobLink = editing.job_post?.job_link ?? "";
      const initialJobDescription = editing.job_post?.job_description ?? "";
      setCompanyId(editing.company_id);
      setCompanyName("");
      setCompanyWebsite("");
      setJobLink(initialJobLink);
      setJobDescription(initialJobDescription);
      setInitialFormSnapshot({
        companyId: editing.company_id,
        companyName: "",
        companyWebsite: "",
        jobLink: initialJobLink,
        jobDescription: initialJobDescription
      });
      return;
    }
    resetForm();
    const initialSelectedCompanyId = initialCompanyId && companies.some((c) => c.id === initialCompanyId) ? initialCompanyId : "";
    if (initialSelectedCompanyId) setCompanyId(initialSelectedCompanyId);
    setInitialFormSnapshot({
      ...EMPTY_FORM_SNAPSHOT,
      companyId: initialSelectedCompanyId
    });
  }, [open, editing, initialCompanyId, companies]);

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
        const result = await api.listCompanySummaries(params);
        if (companySearchRequestRef.current !== requestId) return;
        const fetchedOptions = result.map((company) => ({ id: company.id, name: company.name, website: company.website }));
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
    if (!companySearch.trim()) {
      companySearchRequestRef.current += 1;
      setLoadingCompanies(false);
      setCompanyOptions(
        mergeCompanyOptions(
          selectedCompanyRef.current ? [selectedCompanyRef.current] : [],
          editing ? [{ id: editing.company_id, name: editing.company_name }] : [],
          companies
        )
      );
      return;
    }
    const timer = window.setTimeout(() => {
      void loadCompanyOptions(companySearch);
    }, companySearch.trim() ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [companies, companySearch, editing, loadCompanyOptions, open]);

  const finishClose = () => {
    companySearchRequestRef.current += 1;
    setDiscardConfirmOpen(false);
    onClose();
    setError(null);
    setSubmitting(false);
    resetForm();
  };

  const closeModal = ({ skipDirtyCheck = false, reopenAfterCancel = false } = {}) => {
    if (!skipDirtyCheck && isDirty) {
      if (reopenAfterCancel) {
        setModalKey((value) => value + 1);
      }
      setDiscardConfirmOpen(true);
      return;
    }
    finishClose();
  };

  const chooseExistingCompany = (company: CompanyOption) => {
    setCompanyOptions((current) => mergeCompanyOptions([company], current));
    setCompanyId(company.id);
    setDuplicateCompany(null);
    setArchivedConflict(null);
    setError(null);
  };

  const updateCompanyName = (value: string) => {
    setCompanyName(value);
    setCompanyId("");
    setDuplicateCompany(null);
    setArchivedConflict(null);
  };

  const buildJobPostPayload = () => {
    const hasJob = jobLink.trim() || jobDescription.trim();
    if (!hasJob) return undefined;
    return {
      job_link: jobLink.trim() || null,
      job_description: jobDescription.trim() || null
    };
  };

  const submitCreate = async (acknowledgeArchivedRestore = false) => {
    const name = companyName.trim();
    if (!companyId && !name) {
      setError("Enter a company name or choose an existing company.");
      return;
    }
    setError(null);
    setArchivedConflict(null);
    setDuplicateCompany(null);
    setSubmitting(true);
    try {
      const jobPost = buildJobPostPayload();
      if (companyId) {
        await api.createApplication({
          company_id: companyId,
          job_post: jobPost
        });
      } else {
        await api.bootstrapApplication({
          company_name: name,
          company_website: companyWebsite.trim() || null,
          job_post: jobPost,
          acknowledge_reuse_of_archived_company: acknowledgeArchivedRestore
        });
      }
      closeModal({ skipDirtyCheck: true });
      await onSuccess();
    } catch (err) {
      if (err instanceof ApiConflictError) {
        if (err.detail.code === "archived_company_name_exists") {
          setArchivedConflict({
            company_id: String(err.detail.company_id ?? ""),
            name: String(err.detail.name ?? name),
            archive_reason:
              typeof err.detail.archive_reason === "string" ? err.detail.archive_reason : null
          });
          setError(null);
          return;
        }
        if (err.detail.code === "company_name_exists") {
          setDuplicateCompany({
            id: String(err.detail.company_id ?? ""),
            name: String(err.detail.name ?? name)
          });
          setError(null);
          return;
        }
      }
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) {
      await submitCreate(false);
      return;
    }
    if (!companyId) {
      setError("Choose a company.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.updateApplication(editing.id, {
        company_id: companyId,
        job_post: buildJobPostPayload() ?? null
      });
      closeModal({ skipDirtyCheck: true });
      await onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = editing ? "Edit application" : "New application";

  return (
    <Modal
      key={modalKey}
      open={open}
      onClose={() => closeModal({ reopenAfterCancel: true })}
      title={modalTitle}
      size="lg"
    >
      <form className="space-y-3" onSubmit={onSubmit} aria-label={modalTitle}>
        {!editing ? (
          <>
            <label className="form-control w-full">
              <span className="label-text">Company name</span>
              <input
                className="input input-bordered w-full"
                value={companyName}
                onChange={(e) => updateCompanyName(e.target.value)}
                placeholder="Company name"
                required={!companyId}
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text">Company website (optional)</span>
              <input
                className="input input-bordered w-full"
                value={companyWebsite}
                onChange={(e) => setCompanyWebsite(e.target.value)}
                placeholder="https://example.com"
                disabled={Boolean(companyId)}
              />
            </label>
            <label className="form-control w-full">
              <span className="label-text">Use an existing company (optional)</span>
              <input
                className="input input-bordered w-full"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Search by company name"
              />
            </label>
            {selectedCompany && (
              <div className="flex items-center justify-between gap-2 rounded border border-primary/30 bg-primary/10 p-2 text-sm">
                <span>Using existing company: {selectedCompany.name}</span>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCompanyId("")}>
                  Use typed name
                </button>
              </div>
            )}
            {loadingCompanies ? (
              <div className="rounded border border-base-300 bg-base-200 p-3 text-sm">Loading companies...</div>
            ) : companyOptions.length > 0 ? (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded border border-base-300 p-2">
                {companyOptions.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    className="btn btn-ghost btn-sm flex w-full justify-between"
                    onClick={() => chooseExistingCompany(company)}
                  >
                    <span>{company.name}</span>
                    <span className="text-xs opacity-70">Use</span>
                  </button>
                ))}
              </div>
            ) : companySearch.trim() ? (
              <p className="text-xs opacity-70">No companies matched that search.</p>
            ) : null}
          </>
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
                <option value="" disabled>
                  Choose a company
                </option>
                {companyOptions.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            {companyOptions.length === 0 && companySearch.trim() && (
              <p className="text-xs opacity-70">No companies matched that search.</p>
            )}
          </div>
        )}
        {!editing && (
          <p className="text-xs opacity-70">
            Initial status is set from the company&apos;s research state (indexed companies start in PPA pending).
          </p>
        )}
        {duplicateCompany && (
          <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium">A company named {duplicateCompany.name} already exists.</p>
            <button type="button" className="btn btn-warning btn-sm mt-2" onClick={() => chooseExistingCompany(duplicateCompany)}>
              Use existing company
            </button>
          </div>
        )}
        {archivedConflict && (
          <div className="rounded border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium">Archived company found: {archivedConflict.name}</p>
            {archivedConflict.archive_reason && <p className="mt-1 opacity-80">Reason: {archivedConflict.archive_reason}</p>}
            <button
              type="button"
              className="btn btn-warning btn-sm mt-2"
              disabled={submitting}
              onClick={() => void submitCreate(true)}
            >
              Restore archived company and create application
            </button>
          </div>
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
          <button type="button" className="btn btn-ghost" onClick={() => closeModal()}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              submitting ||
              loadingCompanies ||
              (editing ? !companyId : !companyId && !companyName.trim())
            }
          >
            {submitting ? "Saving..." : editing ? "Save" : "Create"}
          </button>
        </div>
      </form>
      <Modal
        open={discardConfirmOpen}
        onClose={() => setDiscardConfirmOpen(false)}
        title="Discard unsaved changes?"
        size="md"
      >
        <div className="space-y-4 text-sm">
          <p>Discard unsaved application changes? This cannot be undone.</p>
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={() => setDiscardConfirmOpen(false)}>
              Keep editing
            </button>
            <button type="button" className="btn btn-warning" onClick={finishClose}>
              Discard changes
            </button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
};

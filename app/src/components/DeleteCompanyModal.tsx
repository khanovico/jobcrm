import { FormEvent, useEffect, useState } from "react";

import { Modal } from "./Modal";
import { api } from "../api";
import { invalidateCompanySummariesCache } from "../state/companySummaries";

type CompanyRef = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  company: CompanyRef | null;
  onArchived: () => void | Promise<void>;
};

export const DeleteCompanyModal = ({ open, onClose, company, onArchived }: Props) => {
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !company) {
      setCount(null);
      setCountError(null);
      setArchiveReason("");
      setError(null);
      setSubmitting(false);
      return;
    }
    let cancelled = false;
    setCount(null);
    setCountError(null);
    void (async () => {
      try {
        const res = await api.getCompanyApplicationCount(company.id);
        if (!cancelled) {
          setCount(res.count);
        }
      } catch (e) {
        if (!cancelled) {
          setCountError((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, company]);

  const close = () => {
    setError(null);
    onClose();
  };

  const countReady = count !== null || countError !== null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    if (!archiveReason.trim()) {
      setError("Archive reason is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await api.archiveCompany(company.id, archiveReason.trim());
      invalidateCompanySummariesCache();
      close();
      await onArchived();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Archive company" size="md">
      <form className="space-y-3" onSubmit={onSubmit}>
        {company && (
          <>
            <p className="text-sm leading-relaxed opacity-90">
              Archive <span className="font-medium">{company.name}</span>? This will hide the company and archive tied
              applications.
            </p>
            {countError && (
              <p className="text-sm text-warning">
                Could not load application count: {countError}. You can still archive; tied applications will be
                archived.
              </p>
            )}
            {count !== null && !countError && (
              <p className="text-sm leading-relaxed opacity-90">
                {count === 0 ? (
                  <>There are no applications tied to this company.</>
                ) : (
                  <>
                    <strong>{count}</strong> application{count === 1 ? "" : "s"} tied to this company will be{" "}
                    <strong>archived</strong> with reason{" "}
                    <span className="font-mono text-xs opacity-90">&quot;Related company is archived&quot;</span>.
                  </>
                )}
              </p>
            )}
            {count === null && !countError && company && (
              <p className="text-sm opacity-70">Loading application count…</p>
            )}
            <label className="form-control w-full">
              <span className="label-text">Archive reason</span>
              <input
                className="input input-bordered w-full"
                value={archiveReason}
                onChange={(event) => setArchiveReason(event.target.value)}
                placeholder="e.g. Duplicate company, no longer target"
                required
              />
            </label>
          </>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-error"
            disabled={submitting || !company || !countReady || !archiveReason.trim()}
          >
            {submitting ? "Archiving…" : "Archive company"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

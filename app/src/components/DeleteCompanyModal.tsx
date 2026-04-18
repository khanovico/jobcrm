import { FormEvent, useEffect, useState } from "react";

import { Modal } from "./Modal";
import { api } from "../api";

type CompanyRef = {
  id: string;
  name: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  company: CompanyRef | null;
  onDeleted: () => void | Promise<void>;
};

export const DeleteCompanyModal = ({ open, onClose, company, onDeleted }: Props) => {
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !company) {
      setCount(null);
      setCountError(null);
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.deleteCompany(company.id);
      close();
      await onDeleted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Delete company" size="md">
      <form className="space-y-3" onSubmit={onSubmit}>
        {company && (
          <>
            <p className="text-sm leading-relaxed opacity-90">
              Permanently delete <span className="font-medium">{company.name}</span>? This cannot be undone.
            </p>
            {countError && (
              <p className="text-sm text-warning">
                Could not load application count: {countError}. You can still delete; tied applications will be
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
                    <span className="font-mono text-xs opacity-90">&quot;Related company is deleted&quot;</span>.
                  </>
                )}
              </p>
            )}
            {count === null && !countError && company && (
              <p className="text-sm opacity-70">Loading application count…</p>
            )}
          </>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-error" disabled={submitting || !company}>
            {submitting ? "Deleting…" : "Delete company"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

import { useEffect, useState } from "react";

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
  onCleared: () => void | Promise<void>;
};

export const ClearCompanyResearchModal = ({ open, onClose, company, onCleared }: Props) => {
  const [relatedApplicationCount, setRelatedApplicationCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [destructiveConfirmed, setDestructiveConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !company) {
      setRelatedApplicationCount(null);
      setLoadError(null);
      setError(null);
      setDestructiveConfirmed(false);
      setSubmitting(false);
      return;
    }
    let cancelled = false;
    setRelatedApplicationCount(null);
    setLoadError(null);
    setDestructiveConfirmed(false);
    void (async () => {
      try {
        const result = await api.getCompanyApplicationCount(company.id);
        if (!cancelled) {
          setRelatedApplicationCount(result.count);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, company]);

  const finishClose = () => {
    setError(null);
    setDestructiveConfirmed(false);
    onClose();
  };

  const close = () => {
    if (submitting) return;
    finishClose();
  };

  const relatedReady = relatedApplicationCount !== null || loadError !== null;
  const n = relatedApplicationCount ?? 0;
  const requireExplicitConfirmation = relatedReady && (n > 0 || loadError !== null);

  const runClear = async (related_applications: "none" | "archive" | "reset") => {
    if (!company) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.clearCompanyResearchDetail(company.id, { related_applications });
      finishClose();
      await onCleared();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Clear company research" size="md" closeDisabled={submitting}>
      <div className="space-y-3">
        {company && (
          <>
            <p className="text-sm leading-relaxed opacity-90">
              This will set research status to <strong>Pending</strong> for{" "}
              <span className="font-medium">{company.name}</span> and{" "}
              <strong>remove stored research details</strong> (LinkedIn, industries, locations, overview, links, and
              other enrichment). The company <strong>name</strong> and <strong>website</strong> are kept.
            </p>
            {loadError && (
              <p className="text-sm text-warning">
                Could not load related applications: {loadError}. You can still continue; choose an option below.
              </p>
            )}
            {relatedApplicationCount === null && !loadError && (
              <p className="text-sm opacity-70">Loading related applications…</p>
            )}
            {relatedReady && (
              <p className="text-sm leading-relaxed opacity-90">
                <strong>{n}</strong> application{n === 1 ? "" : "s"} tied to this company
                {n === 0 ? "." : ". Choose what to do with them:"}
              </p>
            )}
            {relatedReady && n > 0 && (
              <ul className="list-inside list-disc space-y-1 text-sm opacity-90">
                <li>
                  <strong>Archive related applications</strong> — archive all tied applications with reason
                  &quot;Related company research cleared&quot;, then set company research to Pending.
                </li>
                <li>
                  <strong>Delete prep artifacts and reset applications</strong> — delete generated per-profile analysis
                  rows and generated emails, then reset each non-archived application (same as the application Clear
                  action) before setting company research to Pending.
                </li>
              </ul>
            )}
            {relatedReady && n > 0 && (
              <label className="label cursor-pointer justify-start gap-3 rounded border border-warning/30 bg-warning/10 px-3 py-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-warning checkbox-sm"
                  checked={destructiveConfirmed}
                  onChange={(event) => setDestructiveConfirmed(event.target.checked)}
                  disabled={submitting}
                />
                <span className="label-text text-sm leading-relaxed">
                  I understand reset deletes generated per-profile analysis and emails for related applications.
                </span>
              </label>
            )}
            {loadError && (
              <label className="label cursor-pointer justify-start gap-3 rounded border border-warning/30 bg-warning/10 px-3 py-2">
                <input
                  type="checkbox"
                  className="checkbox checkbox-warning checkbox-sm"
                  checked={destructiveConfirmed}
                  onChange={(event) => setDestructiveConfirmed(event.target.checked)}
                  disabled={submitting}
                />
                <span className="label-text text-sm leading-relaxed">
                  I understand related application count is unavailable, and this action only deletes company prep
                  artifacts.
                </span>
              </label>
            )}
          </>
        )}
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={submitting}>
            Cancel
          </button>
          {relatedReady && n > 0 && (
            <>
              <button
                type="button"
                className="btn btn-warning"
                disabled={submitting || !relatedReady || (requireExplicitConfirmation && !destructiveConfirmed)}
                onClick={() => void runClear("archive")}
              >
                {submitting ? "Working…" : "Archive related applications"}
              </button>
              <button
                type="button"
                className="btn btn-accent"
                disabled={submitting || !relatedReady || (requireExplicitConfirmation && !destructiveConfirmed)}
                onClick={() => void runClear("reset")}
              >
                {submitting ? "Working…" : "Delete prep artifacts and reset applications"}
              </button>
            </>
          )}
          {relatedReady && n === 0 && (
            <button
              type="button"
              className="btn btn-warning"
              disabled={submitting || !relatedReady || (requireExplicitConfirmation && !destructiveConfirmed)}
              onClick={() => void runClear("none")}
            >
              {submitting ? "Working…" : "Delete company prep artifacts only"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

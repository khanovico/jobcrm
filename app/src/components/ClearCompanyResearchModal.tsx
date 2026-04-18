import { useEffect, useState } from "react";

import { Modal } from "./Modal";
import { api } from "../api";
import type { ApplicationListItem } from "../types";

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
  const [relatedApps, setRelatedApps] = useState<ApplicationListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !company) {
      setRelatedApps(null);
      setLoadError(null);
      setError(null);
      setSubmitting(false);
      return;
    }
    let cancelled = false;
    setRelatedApps(null);
    setLoadError(null);
    void (async () => {
      try {
        const params = new URLSearchParams({
          company_id: company.id,
          skip: "0",
          limit: "10000"
        });
        const list = await api.listApplications(params);
        if (!cancelled) {
          setRelatedApps(list);
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

  const close = () => {
    setError(null);
    onClose();
  };

  const relatedReady = relatedApps !== null || loadError !== null;
  const n = relatedApps?.length ?? 0;

  const runClear = async (related_applications: "none" | "archive" | "reset") => {
    if (!company) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.clearCompanyResearchDetail(company.id, { related_applications });
      close();
      await onCleared();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Clear company research" size="md">
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
            {relatedApps === null && !loadError && (
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
                  <strong>Archive</strong> — archive all tied applications with reason &quot;Related company research
                  cleared&quot;, then set company research to Pending.
                </li>
                <li>
                  <strong>Clear</strong> — reset each non-archived application (remove per-profile rows and emails; same
                  as the application Clear action), then set company research to Pending.
                </li>
              </ul>
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
                disabled={submitting || !relatedReady}
                onClick={() => void runClear("archive")}
              >
                {submitting ? "Working…" : "Archive"}
              </button>
              <button
                type="button"
                className="btn btn-accent"
                disabled={submitting || !relatedReady}
                onClick={() => void runClear("reset")}
              >
                {submitting ? "Working…" : "Clear"}
              </button>
            </>
          )}
          {relatedReady && n === 0 && (
            <button
              type="button"
              className="btn btn-warning"
              disabled={submitting || !relatedReady}
              onClick={() => void runClear("none")}
            >
              {submitting ? "Working…" : "Clear company"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

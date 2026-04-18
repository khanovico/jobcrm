import { FormEvent, useEffect, useState } from "react";

import { Modal } from "./Modal";
import { api } from "../api";
import { formatApplicationStatusLabel } from "../applicationStatus";
import type { ApplicationStatus } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  companyLabel: string;
  /** Status the API will set after clear (depends on company research state). */
  targetStatus: ApplicationStatus;
  onCleared: () => void | Promise<void>;
};

export const ClearApplicationToPendingModal = ({
  open,
  onClose,
  applicationId,
  companyLabel,
  targetStatus,
  onCleared
}: Props) => {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setSubmitting(false);
    }
  }, [open, applicationId]);

  const close = () => {
    setError(null);
    onClose();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.clearApplicationToCompanyResearchPending(applicationId);
      close();
      await onCleared();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Reset to ${formatApplicationStatusLabel(targetStatus)}`}
      size="md"
    >
      <form className="space-y-3" onSubmit={onSubmit}>
        <p className="text-sm leading-relaxed opacity-90">
          This will remove <strong>all per-profile rows</strong> and <strong>all emails</strong> tied to this
          application for <span className="font-medium">{companyLabel}</span>, then set status to{" "}
          <strong>{formatApplicationStatusLabel(targetStatus)}</strong>. Application-level marks (applied, email
          sent) are cleared. This cannot be undone.
        </p>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-warning" disabled={submitting}>
            {submitting ? "Resetting…" : "Clear and reset"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

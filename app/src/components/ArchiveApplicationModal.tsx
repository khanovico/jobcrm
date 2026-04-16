import { FormEvent, useEffect, useState } from "react";

import { Modal } from "./Modal";
import { api } from "../api";

type Props = {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  companyLabel: string;
  onArchived: () => void | Promise<void>;
};

export const ArchiveApplicationModal = ({
  open,
  onClose,
  applicationId,
  companyLabel,
  onArchived
}: Props) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
      setSubmitting(false);
    }
  }, [open, applicationId]);

  const close = () => {
    setReason("");
    setError(null);
    onClose();
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const trimmed = reason.trim();
      await api.updateApplication(applicationId, {
        status: "archived",
        ...(trimmed ? { archive_reason: trimmed } : {})
      });
      close();
      await onArchived();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Archive application" size="md">
      <form className="space-y-3" onSubmit={onSubmit}>
        <p className="text-sm opacity-80">
          Archive <span className="font-medium">{companyLabel}</span>? Archived applications stay in the system and can be viewed with the list filter.
        </p>
        <label className="form-control w-full">
          <span className="label-text">Why remove (optional)</span>
          <textarea
            className="textarea textarea-bordered w-full text-sm"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. role closed, company not a fit, duplicate…"
          />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={close} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-warning" disabled={submitting}>
            {submitting ? "Archiving…" : "Archive"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

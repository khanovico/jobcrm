import { FormEvent, useEffect, useState } from "react";

import { Modal } from "./Modal";
import { api } from "../api";
import { formatApplicationStatusLabel } from "../applicationStatus";
import type { Application, ApplicationStatus } from "../types";

const STATUS_OPTIONS: ApplicationStatus[] = [
  "company_research_pending",
  "company_researching",
  "ppa_pending",
  "ppa_analyzing",
  "application_pending",
  "application_drafting",
  "application_ready",
  "invalid",
  "archived"
];

type Props = {
  open: boolean;
  onClose: () => void;
  application: Pick<Application, "id" | "status"> | null;
  onSaved: (application: Application) => void | Promise<void>;
};

export const ApplicationWorkflowOverrideModal = ({ open, onClose, application, onSaved }: Props) => {
  const [status, setStatus] = useState<ApplicationStatus>("company_research_pending");
  const [forceTransition, setForceTransition] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !application) return;
    setStatus(application.status);
    setForceTransition(false);
    setError(null);
  }, [open, application]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!application) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateApplication(application.id, {
        status,
        force_transition: forceTransition
      });
      await onSaved(updated);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Set application status" size="md">
      <form className="space-y-3" onSubmit={(ev) => void onSubmit(ev)}>
        <p className="text-xs opacity-70">
          Workflow rules apply by default. Enable <strong>Force transition</strong> only when you need to correct
          status outside the normal pipeline.
        </p>
        <label className="form-control w-full">
          <span className="label-text">Status</span>
          <select
            className="select select-bordered w-full"
            value={status}
            onChange={(ev) => setStatus(ev.target.value as ApplicationStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {formatApplicationStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={forceTransition}
            onChange={(ev) => setForceTransition(ev.target.checked)}
          />
          <span className="label-text text-sm">Force transition (skip workflow validation)</span>
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !application}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

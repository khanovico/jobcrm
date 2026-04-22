import { FormEvent, useEffect, useState } from "react";

import { Modal } from "./Modal";
import { api } from "../api";
import type { Company, CompanyResearchStatus } from "../types";

const OPTIONS: { value: CompanyResearchStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "indexing", label: "Indexing" },
  { value: "indexed", label: "Indexed" },
  { value: "invalid", label: "Invalid" }
];

type Props = {
  open: boolean;
  onClose: () => void;
  company: Pick<Company, "id" | "research_status"> | null;
  onSaved: (company: Company) => void | Promise<void>;
};

export const CompanyResearchOverrideModal = ({ open, onClose, company, onSaved }: Props) => {
  const [researchStatus, setResearchStatus] = useState<CompanyResearchStatus>("pending");
  const [forceSet, setForceSet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !company) return;
    setResearchStatus(company.research_status);
    setForceSet(false);
    setError(null);
  }, [open, company]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateCompany(company.id, {
        research_status: researchStatus,
        ...(forceSet ? { skip_research_side_effects: true } : {})
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
    <Modal open={open} onClose={onClose} title="Set company research status" size="md">
      <form className="space-y-3" onSubmit={(ev) => void onSubmit(ev)}>
        <p className="text-xs opacity-70">
          Changing research status normally updates tied applications (e.g. indexed promotes pipelines). Enable{" "}
          <strong>Force set</strong> to update the label only without those automatic application changes.
        </p>
        <label className="form-control w-full">
          <span className="label-text">Research status</span>
          <select
            className="select select-bordered w-full"
            value={researchStatus}
            onChange={(ev) => setResearchStatus(ev.target.value as CompanyResearchStatus)}
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="label cursor-pointer justify-start gap-2">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={forceSet}
            onChange={(ev) => setForceSet(ev.target.checked)}
          />
          <span className="label-text text-sm">Force set (skip automatic application updates)</span>
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || !company}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

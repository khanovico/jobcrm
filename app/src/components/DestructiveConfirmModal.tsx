import type { ReactNode } from "react";

import { Modal } from "./Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  confirmLabel: string;
  confirmingLabel: string;
  submitting: boolean;
  error?: string | null;
  children: ReactNode;
};

export const DestructiveConfirmModal = ({
  open,
  onClose,
  onConfirm,
  title,
  confirmLabel,
  confirmingLabel,
  submitting,
  error = null,
  children
}: Props) => {
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <div className="space-y-3">
        <div className="text-sm leading-relaxed opacity-90">{children}</div>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-error" onClick={onConfirm} disabled={submitting}>
            {submitting ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
};

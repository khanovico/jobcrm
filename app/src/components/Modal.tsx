import { ReactNode, useEffect, useRef } from "react";

type ModalSize = "md" | "lg" | "xl" | "3xl" | "full";

const sizeClass: Record<ModalSize, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "3xl": "max-w-3xl",
  full: "max-w-[min(96rem,calc(100vw-2rem))]"
};

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: ModalSize;
  /** Extra class on modal-box (e.g. padding tweaks) */
  bodyClassName?: string;
  closeDisabled?: boolean;
};

/**
 * Reusable modal using the native `<dialog>` element (DaisyUI modal styles).
 * Parent state is synced via the dialog `close` event (including backdrop and programmatic close).
 */
export const Modal = ({
  open,
  onClose,
  title,
  children,
  size = "lg",
  bodyClassName = "",
  closeDisabled = false
}: ModalProps) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = () => {
      onClose();
    };
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onClose]);

  const requestClose = () => {
    if (closeDisabled) return;
    ref.current?.close();
  };

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <div className={`modal-box flex max-h-[85vh] flex-col ${sizeClass[size]} ${bodyClassName}`}>
        <header className="mb-3 flex shrink-0 items-start justify-between gap-2">
          <h3 className="text-lg font-semibold leading-tight">{title}</h3>
          <button
            type="button"
            className="btn btn-sm btn-circle btn-ghost"
            aria-label="Close"
            disabled={closeDisabled}
            onClick={requestClose}
          >
            ✕
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit" className="cursor-default" disabled={closeDisabled}>
          close
        </button>
      </form>
    </dialog>
  );
};

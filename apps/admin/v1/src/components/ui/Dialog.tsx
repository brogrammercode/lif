import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
export function Dialog({
  title,
  description,
  onClose,
  busy = false,
  children,
  small = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  small?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${small ? "dialog-small" : ""}`}
      aria-labelledby={id}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
    >
      <div className="dialog-content">
        <header className="dialog-header">
          <div>
            <h2 id={id}>{title}</h2>
            {description && <p id={`${id}-description`}>{description}</p>}
          </div>
          <button
            className="icon-button"
            type="button"
            disabled={busy}
            aria-label="Close dialog"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

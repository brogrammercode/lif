import { useEffect } from "react";
import { Icon } from "../ui/Icon";
export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);
  return (
    <div className="toast" role="status">
      <Icon name="success" className="text-brand" />
      <span>{message}</span>
      <button
        className="icon-button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}

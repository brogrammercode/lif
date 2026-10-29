import type { ReactNode } from "react";
import { Icon } from "../ui/Icon";
import { LoadingSkeleton, type LoadingVariant } from "../ui/Skeleton";
export function StateCard({
  title,
  message,
  error = false,
  children,
}: {
  title: string;
  message: string;
  error?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`state-card ${error ? "state-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <span className="state-icon">
        <Icon name={error ? "error" : "layers"} size={26} />
      </span>
      <h2>{title}</h2>
      <p>{message}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
export function InlineError({ message }: { message: string }) {
  return (
    <div className="inline-error" role="alert">
      <Icon name="error" size={18} />
      <span>{message}</span>
    </div>
  );
}
export function LoadingState({
  variant = "page",
  label = "Loading content",
}: {
  variant?: LoadingVariant;
  label?: string;
}) {
  return <LoadingSkeleton variant={variant} label={label} />;
}

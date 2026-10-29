import type { ButtonHTMLAttributes, ReactNode } from "react";
import { InlineLoading } from "./Skeleton";

export function Button({
  variant = "primary",
  busy = false,
  children,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      className={`button button-${variant} ${className}`}
      aria-busy={busy || undefined}
    >
      {busy && <InlineLoading />}
      {children}
    </button>
  );
}

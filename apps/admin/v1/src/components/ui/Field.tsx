import { cloneElement, isValidElement, type ReactNode } from "react";
export function Field({
  id,
  label,
  hint,
  children,
  className = "",
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field-group ${className}`}>
      <label htmlFor={id}>{label}</label>
      {hint && isValidElement<{ "aria-describedby"?: string }>(children)
        ? cloneElement(children, {
            "aria-describedby": [
              children.props["aria-describedby"],
              `${id}-hint`,
            ]
              .filter(Boolean)
              .join(" "),
          })
        : children}
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

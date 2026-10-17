import type { ReactNode } from "react";

export function PageHeading({
  eyebrow,
  context,
  title,
  description,
  children,
}: {
  eyebrow: string;
  context?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="page-eyebrow">
          <span className="eyebrow">{eyebrow}</span>
          {context && (
            <>
              <span className="eyebrow-dot" aria-hidden="true" />
              <span className="text-xs text-muted">{context}</span>
            </>
          )}
        </div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

import type { CSSProperties } from "react";

export type LoadingVariant =
  | "page"
  | "workspace"
  | "table"
  | "form"
  | "detail"
  | "document"
  | "attachment"
  | "directory";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={`skeleton skeleton-block ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function InlineLoading() {
  return (
    <span className="inline-loading" aria-hidden="true">
      <Skeleton />
      <Skeleton />
    </span>
  );
}

function Lines({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-lines">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} style={{ width: i === count - 1 ? "66%" : "100%" }} />
      ))}
    </div>
  );
}

function Content({
  variant,
  rows,
}: {
  variant: Exclude<LoadingVariant, "workspace">;
  rows: number;
}) {
  if (variant === "table" || variant === "directory")
    return (
      <div
        className={`skeleton-rows ${variant === "directory" ? "skeleton-directory" : ""}`}
      >
        {Array.from({ length: rows }, (_, i) => (
          <div className="skeleton-row" key={i}>
            <Skeleton className="skeleton-avatar" />
            <Lines count={2} />
            {variant === "table" && (
              <>
                <Skeleton className="skeleton-cell" />
                <Skeleton className="skeleton-cell" />
              </>
            )}
          </div>
        ))}
      </div>
    );
  if (variant === "document")
    return (
      <div className="skeleton-document">
        <Skeleton className="skeleton-control" />
        <div className="skeleton-document-tools">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} />
          ))}
        </div>
        <Lines count={8} />
      </div>
    );
  if (variant === "attachment")
    return (
      <div className="skeleton-attachment">
        <Skeleton className="skeleton-file" />
        <Lines count={2} />
      </div>
    );
  return (
    <>
      {variant === "page" && (
        <div className="skeleton-heading">
          <Skeleton style={{ width: "26%" }} />
          <Skeleton className="skeleton-title" />
          <Skeleton style={{ width: "58%" }} />
        </div>
      )}
      <div className="skeleton-surface">
        <div className="skeleton-heading">
          <Skeleton className="skeleton-subtitle" />
          <Skeleton style={{ width: "56%" }} />
        </div>
        <div className="skeleton-form-grid">
          {Array.from({ length: variant === "detail" ? 4 : 6 }, (_, i) => (
            <div className="skeleton-field" key={i}>
              <Skeleton className="skeleton-label" />
              <Skeleton className="skeleton-control" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function LoadingSkeleton({
  variant = "page",
  label = "Loading content",
  rows = 4,
}: {
  variant?: LoadingVariant;
  label?: string;
  rows?: number;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      data-loading-variant={variant}
      className={`loading-skeleton loading-skeleton-${variant}`}
    >
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className={variant === "workspace" ? "skeleton-workspace" : undefined}
      >
        {variant === "workspace" ? (
          <>
            <aside className="skeleton-primary">
              <Skeleton className="skeleton-mark" />
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton className="skeleton-nav-icon" key={i} />
              ))}
            </aside>
            <aside className="skeleton-rail">
              <Skeleton className="skeleton-subtitle" />
              <Lines count={6} />
            </aside>
            <main className="skeleton-workspace-content">
              <div className="skeleton-workspace-header">
                <Skeleton style={{ width: 160 }} />
                <Skeleton style={{ width: 96 }} />
              </div>
              <div className="skeleton-workspace-page">
                <Content variant="page" rows={rows} />
              </div>
            </main>
          </>
        ) : (
          <Content variant={variant} rows={rows} />
        )}
      </div>
    </div>
  );
}

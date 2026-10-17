import { useId, type ReactNode } from "react";

export function CatalogPanel({
  title,
  description,
  count,
  actions,
  toolbar,
  footer,
  busy,
  className = "",
  children,
}: {
  title: string;
  description: string;
  count?: ReactNode;
  actions?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      className={`catalog-card ${className}`}
      aria-labelledby={id}
      aria-busy={busy}
    >
      <div className="catalog-card-header">
        <div>
          <h2 id={id}>
            {title}
            {count !== undefined && <span className="count-tag">{count}</span>}
          </h2>
          <p>{description}</p>
        </div>
        {actions}
      </div>
      {toolbar}
      {children}
      {footer}
    </section>
  );
}

export function TableLoading({
  label,
  rows = 3,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div className="catalog-loading" role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div className="skeleton catalog-loading-row" key={index} />
        ))}
      </div>
    </div>
  );
}

import { useId, type ReactNode } from "react";
import { LoadingSkeleton } from "./Skeleton";
import { Icon, type IconName } from "./Icon";

export function PanelNote({
  children,
  icon = "shield",
}: {
  children: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="panel-note">
      <Icon name={icon} size={15} />
      <p>{children}</p>
    </div>
  );
}

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
  return <LoadingSkeleton variant="table" label={label} rows={rows} />;
}

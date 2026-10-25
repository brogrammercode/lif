import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { PendingBadge } from "./PendingProvider";

// Sibling links keep normal navigation unfiltered and make the pending queue
// independently accessible to keyboard and screen-reader users.
export function PendingNavLink({
  to,
  pendingTo,
  count,
  label,
  className,
  end,
  children,
}: {
  to: string;
  pendingTo: string;
  count?: number;
  label: string;
  className?: string;
  end?: boolean;
  children: ReactNode;
}) {
  const visible = typeof count === "number" && count > 0;
  return (
    <div
      className={`pending-nav-group ${className === "primary-nav-item" ? "pending-nav-primary" : className === "secondary-nav-item" ? "pending-nav-secondary" : "pending-nav-tab"}${visible ? " has-count" : ""}`}
    >
      <NavLink to={to} end={end} className={className}>
        {children}
      </NavLink>
      {visible && (
        <Link
          className="pending-nav-count"
          to={pendingTo}
          aria-label={`View ${count} pending ${label}`}
        >
          <PendingBadge count={count} />
        </Link>
      )}
    </div>
  );
}

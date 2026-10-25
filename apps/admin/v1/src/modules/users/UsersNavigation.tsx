import {
  PendingBadge,
  usePending,
  usePendingEntities,
} from "../pending/PendingProvider";
import { NavLink, useLocation, useSearchParams } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { InlineError } from "../../components/feedback/StateCard";
import { personalPath } from "./users.constant";
import { useUsers } from "./UsersProvider";
import { userName, isDriverAccount } from "./users.type";

export function UsersNavigation() {
  const {
    result,
    loading,
    error,
    query,
    search,
    reload,
    setPage,
    accountType,
    filter,
  } = useUsers();
  const pending = usePending();
  usePendingEntities("users", result?.users.map((user) => user.id) ?? []);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const vehicles = location.pathname.endsWith("/vehicle-verification");
  const rides = location.pathname.endsWith("/rides");
  return (
    <div className="users-directory">
      {params.get("pending_only") === "true" && (
        <div className="users-directory-message">
          Vehicle reviews pending{" "}
          <Button
            variant="ghost"
            onClick={() =>
              setParams((current) => {
                const p = new URLSearchParams(current);
                p.delete("pending_only");
                return p;
              })
            }
          >
            Show all accounts
          </Button>
        </div>
      )}
      <label className="users-type-filter">
        Account type
        <select
          className="field"
          value={accountType}
          onChange={(e) => filter(e.target.value)}
        >
          <option value="all">All accounts</option>
          <option value="user">Users</option>
          <option value="driver">Drivers</option>
        </select>
      </label>
      <div className="users-search">
        <label htmlFor="users-search" className="sr-only">
          Search users by ID, name, email, or phone
        </label>
        <input
          id="users-search"
          className="field"
          type="search"
          maxLength={100}
          placeholder="Find a user…"
          value={query}
          onChange={(event) => search(event.target.value)}
        />
        <button
          className="icon-button"
          aria-label="Refresh users"
          disabled={loading}
          onClick={reload}
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
      <nav className="users-list" aria-label="Users" aria-busy={loading}>
        {loading ? (
          <p className="users-directory-message" role="status">
            Loading users…
          </p>
        ) : error ? (
          <>
            <InlineError message={error} />
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          </>
        ) : result?.users.length ? (
          result.users.map((user) => (
            <NavLink
              key={user.id}
              to={
                (rides
                  ? `/users/${encodeURIComponent(user.id)}/rides`
                  : vehicles && isDriverAccount(user)
                    ? `/users/${encodeURIComponent(user.id)}/vehicle-verification`
                    : personalPath(user.id)) +
                (params.get("pending_only") === "true"
                  ? "?pending_only=true"
                  : "")
              }
              className="user-nav-item"
            >
              <span className="user-nav-heading">
                <span className="user-nav-name" title={userName(user)}>
                  {userName(user)}
                </span>
                <PendingBadge
                  count={
                    pending?.data?.entities.users[user.id]?.vehicle_verification
                  }
                />
                <Badge
                  tone={
                    user.role === "DRIVER" || user.partner_activated_at
                      ? "active"
                      : "inactive"
                  }
                >
                  {user.role === "DRIVER" || user.partner_activated_at
                    ? "Driver"
                    : "User"}
                </Badge>
              </span>
              <span className="user-nav-id" title={user.id}>
                {user.id}
              </span>
            </NavLink>
          ))
        ) : (
          <p className="users-directory-message" role="status">
            {query.trim() ? "No matching users." : "No users yet."}
          </p>
        )}
      </nav>
      {result && (
        <div className="users-pagination">
          <span>
            {result.total} {result.total === 1 ? "user" : "users"}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="icon-button"
              aria-label="Previous users"
              disabled={loading || result.page <= 1}
              onClick={() => setPage(result.page - 1)}
            >
              <Icon name="arrowLeft" size={14} />
            </button>
            <span aria-live="polite">
              {result.page}/
              {Math.max(1, Math.ceil(result.total / result.page_size))}
            </span>
            <button
              className="icon-button"
              aria-label="Next users"
              disabled={
                loading || result.page * result.page_size >= result.total
              }
              onClick={() => setPage(result.page + 1)}
            >
              <Icon name="arrowRight" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

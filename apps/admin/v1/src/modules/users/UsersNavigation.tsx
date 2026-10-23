import { NavLink, useLocation } from "react-router-dom";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { InlineError } from "../../components/feedback/StateCard";
import { personalPath } from "./users.constant";
import { useUsers } from "./UsersProvider";
import { userName } from "./users.type";

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
  const location = useLocation();
  const vehicles = location.pathname.endsWith("/vehicle-verification");
  return (
    <div className="users-directory">
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
                vehicles
                  ? `/users/${encodeURIComponent(user.id)}/vehicle-verification`
                  : personalPath(user.id)
              }
              className="user-nav-item"
            >
              <span className="user-nav-heading">
                <span className="user-nav-name" title={userName(user)}>
                  {userName(user)}
                </span>
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

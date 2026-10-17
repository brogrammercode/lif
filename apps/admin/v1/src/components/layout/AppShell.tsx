import { useState } from "react";
import { Link, NavLink, Outlet, useMatch } from "react-router-dom";
import { useAuth } from "../../modules/auth/AuthProvider";
import { signOut } from "../../modules/auth/auth.api";
import { WORKSPACE_PATH } from "../../modules/auth/auth.constant";
import { safeMessage } from "../../lib/api-client";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { InlineError } from "../feedback/StateCard";
import { UsersProvider, useUsers } from "../../modules/users/UsersProvider";
import { UsersNavigation } from "../../modules/users/UsersNavigation";
import { USERS_PATH, personalPath } from "../../modules/users/users.constant";
import { userName } from "../../modules/users/users.type";
import { ADMIN_ACCESS_PATH } from "../../modules/admin-access/admin-access.constant";

export function AppShell() {
  const usersSection = Boolean(useMatch("/users/*"));
  return (
    <UsersProvider active={usersSection}>
      <WorkspaceShell />
    </UsersProvider>
  );
}

function WorkspaceShell() {
  const { user } = useAuth();
  const usersSection = Boolean(useMatch("/users/*"));
  const adminSection = Boolean(useMatch("/admin/*"));
  const partnerSection = Boolean(useMatch("/partner-program/*"));
  const selectedId = useMatch("/users/:userId/*")?.params.userId;
  const { result } = useUsers();
  const selected = result?.users.find((item) => item.id === selectedId);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    "Administrator";
  return (
    <div
      className={`workspace${usersSection ? " has-users" : adminSection || partnerSection ? " has-admin" : ""}`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="primary-rail" aria-label="Primary navigation">
        <Link
          className="rail-brand"
          to={WORKSPACE_PATH}
          aria-label="1More Admin home"
        >
          <img
            src="/logo.png"
            alt=""
            className="h-10 w-10 rounded-[10px] object-cover"
          />
        </Link>
        <nav aria-label="Primary navigation">
          <NavLink to="/app" className="primary-nav-item">
            <Icon name="app" size={24} />
            <span>App</span>
          </NavLink>
          <NavLink to={USERS_PATH} className="primary-nav-item">
            <Icon name="users" size={24} />
            <span>Users</span>
          </NavLink>
          <NavLink to="/admin" className="primary-nav-item">
            <Icon name="shield" size={24} />
            <span>Admin</span>
          </NavLink>
          <NavLink to="/partner-program" className="primary-nav-item">
            <Icon name="layers" size={24} />
            <span>Partner program</span>
          </NavLink>
        </nav>
        <div className="rail-account">
          <Avatar user={user} />
          <button
            className="icon-button"
            aria-label="Sign out"
            onClick={() => setConfirmLogout(true)}
          >
            <Icon name="logout" size={20} />
          </button>
        </div>
      </aside>
      <aside
        className={`secondary-rail${usersSection ? " users-rail" : adminSection || partnerSection ? " admin-rail" : ""}`}
        aria-label={
          usersSection
            ? "User navigation"
            : partnerSection
              ? "Partner program navigation"
              : adminSection
                ? "Admin navigation"
                : "App navigation"
        }
      >
        <div className="secondary-heading">
          <span>
            {usersSection
              ? "Users"
              : partnerSection
                ? "Partner program"
                : adminSection
                  ? "Admin"
                  : "App"}
          </span>
          <span className="tiny-tag">MANAGE</span>
        </div>
        <p className="secondary-caption">
          {usersSection
            ? "Find an account to manage."
            : partnerSection
              ? "Configure partner onboarding."
              : adminSection
                ? "Manage your workspace access."
                : "Build a better experience."}
        </p>
        {usersSection ? (
          <UsersNavigation />
        ) : partnerSection ? (
          <nav aria-label="Partner program navigation">
            <NavLink
              to="/partner-program/requirements"
              className="secondary-nav-item"
            >
              <Icon name="layers" size={19} />
              <span>Requirements</span>
              <Icon name="chevronRight" size={14} />
            </NavLink>
          </nav>
        ) : adminSection ? (
          <nav aria-label="Admin navigation">
            <NavLink to="/admin/access" className="secondary-nav-item">
              <Icon name="shield" size={19} />
              <span>Access</span>
              <Icon name="chevronRight" size={14} />
            </NavLink>
          </nav>
        ) : (
          <nav aria-label="App navigation">
            <NavLink to="/app/user" className="secondary-nav-item">
              <Icon name="users" size={19} />
              <span>User</span>
              <Icon name="chevronRight" size={14} />
            </NavLink>
          </nav>
        )}
        <div className="secondary-bottom">
          <span className="flex items-center gap-2 text-brand">
            <Icon name="shield" size={16} />
            Admin workspace
          </span>
          <p>Every change. A better journey.</p>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="breadcrumbs">
            <span>
              {usersSection
                ? "Users"
                : partnerSection
                  ? "Partner program"
                  : adminSection
                    ? "Admin"
                    : "App"}
            </span>
            <Icon name="chevronRight" size={14} />
            <span
              className="text-ink truncate"
              title={usersSection ? selectedId : undefined}
            >
              {usersSection
                ? selected
                  ? userName(selected)
                  : selectedId || "Select a user"
                : partnerSection
                  ? "Requirements"
                  : adminSection
                    ? "Access"
                    : "User"}
            </span>
          </div>
          <div className="header-account">
            <div>
              <p>{name}</p>
              <span>{user.email}</span>
            </div>
            <Avatar user={user} />
            <button
              className="icon-button mobile-logout"
              aria-label="Sign out"
              onClick={() => setConfirmLogout(true)}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>
        <nav
          className="page-tabs"
          aria-label={
            usersSection
              ? "User details"
              : partnerSection
                ? "Requirement settings"
                : adminSection
                  ? "Access settings"
                  : "User settings"
          }
        >
          {usersSection ? (
            <NavLink to={selectedId ? personalPath(selectedId) : USERS_PATH}>
              Personal
            </NavLink>
          ) : partnerSection ? (
            <>
              <NavLink to="/partner-program/requirements/details">
                Details
              </NavLink>
              <NavLink to="/partner-program/requirements/documents">
                Documents
              </NavLink>
            </>
          ) : adminSection ? (
            <>
              <NavLink to={ADMIN_ACCESS_PATH}>1More Admin</NavLink>
              <NavLink to="/admin/access/activity">Audit log</NavLink>
            </>
          ) : (
            <>
              <NavLink to={WORKSPACE_PATH}>Vehicle Categories</NavLink>
              <NavLink to="/app/user/vehicle-models">Vehicle Models</NavLink>
            </>
          )}
        </nav>
        <main id="main-content" className="workspace-content">
          <Outlet />
        </main>
        <footer className="workspace-footer">
          <span>1More Admin</span>
          <span>Made for the way you move.</span>
        </footer>
      </div>
      {confirmLogout && (
        <Dialog
          small
          title="Sign out of 1More Admin?"
          description="You can return to your workspace with your approved Google account."
          busy={busy}
          onClose={() => {
            setConfirmLogout(false);
            setError(null);
          }}
        >
          {error && <InlineError message={error} />}
          <div className="dialog-footer">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmLogout(false)}
            >
              Cancel
            </Button>
            <Button
              busy={busy}
              onClick={() => {
                setBusy(true);
                setError(null);
                void signOut()
                  .catch((cause: unknown) => setError(safeMessage(cause)))
                  .finally(() => setBusy(false));
              }}
            >
              Sign out
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

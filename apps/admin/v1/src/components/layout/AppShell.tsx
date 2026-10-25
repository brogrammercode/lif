import { PendingNavLink } from "../../modules/pending/PendingNavLink";
import {
  PendingProvider,
  PendingBadge,
  usePending,
  usePendingEntities,
} from "../../modules/pending/PendingProvider";
import { useState } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useMatch,
  useSearchParams,
} from "react-router-dom";
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
import { userName, isDriverAccount } from "../../modules/users/users.type";
import { ADMIN_ACCESS_PATH } from "../../modules/admin-access/admin-access.constant";

export function AppShell() {
  const usersSection = Boolean(useMatch("/users/*"));
  return (
    <PendingProvider>
      <UsersProvider active={usersSection}>
        <WorkspaceShell />
      </UsersProvider>
    </PendingProvider>
  );
}

function WorkspaceShell() {
  const { user } = useAuth();
  const usersSection = Boolean(useMatch("/users/*"));
  const adminSection = Boolean(useMatch("/admin/*"));
  const supportSection = Boolean(useMatch("/support/*"));
  const partnerSection = Boolean(useMatch("/partner-program/*"));
  const partnerApplications = Boolean(
    useMatch("/partner-program/applications/*"),
  );
  const selectedId = useMatch("/users/:userId/*")?.params.userId;
  const { selectedUser: selected } = useUsers();
  const pending = usePending();
  const [params] = useSearchParams();
  const pendingSuffix =
    params.get("pending_only") === "true" ? "?pending_only=true" : "";
  const appQueue = pending?.data?.tabs.vehicle_models
    ? "/app/user/vehicle-models?pending_only=true"
    : "/app/user/ride-reviews?pending_only=true";
  const partnerQueue = pending?.data?.tabs.applications
    ? "/partner-program/applications?pending_only=true"
    : pending?.data?.tabs.confirmations
      ? "/partner-program/applications/confirmations?pending_only=true"
      : "/partner-program/applications/exit-requests?pending_only=true";
  usePendingEntities("users", selectedId ? [selectedId] : []);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const name =
    [user.first_name, user.last_name].filter(Boolean).join(" ") ||
    "Administrator";
  return (
    <div
      className={`workspace${usersSection ? " has-users" : adminSection || partnerSection || supportSection ? " has-admin" : ""}`}
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
          <PendingNavLink
            to="/app"
            pendingTo={appQueue}
            count={pending?.data?.sections.app}
            label="app items"
            className="primary-nav-item"
          >
            <Icon name="app" size={24} />
            <span>App</span>
          </PendingNavLink>
          <PendingNavLink
            to="/users"
            pendingTo="/users?pending_only=true"
            count={pending?.data?.sections.users}
            label="vehicle reviews"
            className="primary-nav-item"
          >
            <Icon name="users" size={24} />
            <span>Users</span>
          </PendingNavLink>
          <PendingNavLink
            to="/admin"
            pendingTo="/admin/access/registration-emails"
            count={pending?.data?.sections.admin}
            label="registration emails"
            className="primary-nav-item"
          >
            <Icon name="shield" size={24} />
            <span>Admin</span>
          </PendingNavLink>
          <PendingNavLink
            to="/partner-program"
            pendingTo={partnerQueue}
            count={pending?.data?.sections.partner_program}
            label="partner items"
            className="primary-nav-item"
          >
            <Icon name="layers" size={24} />
            <span>Partner program</span>
          </PendingNavLink>
          <NavLink to="/support" className="primary-nav-item">
            <Icon name="settings" size={24} />
            <span>Support</span>
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
        className={`secondary-rail${usersSection ? " users-rail" : adminSection || partnerSection || supportSection ? " admin-rail" : ""}`}
        aria-label={
          usersSection
            ? "User navigation"
            : supportSection
              ? "Support navigation"
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
              : supportSection
                ? "Support"
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
            : supportSection
              ? "Configure help for riders and drivers."
              : partnerSection
                ? "Configure partner onboarding."
                : adminSection
                  ? "Manage your workspace access."
                  : "Build a better experience."}
        </p>
        {usersSection ? (
          <UsersNavigation />
        ) : supportSection ? (
          <nav aria-label="Support navigation">
            <NavLink to="/support/configure" className="secondary-nav-item">
              <Icon name="settings" size={19} />
              <span>Configure</span>
              <Icon name="chevronRight" size={14} />
            </NavLink>
          </nav>
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
            <PendingNavLink
              to="/partner-program/applications"
              pendingTo={partnerQueue}
              count={pending?.data?.sections.partner_program}
              label="partner items"
              className="secondary-nav-item"
            >
              <Icon name="users" size={19} />
              <span>Applications</span>
              <Icon name="chevronRight" size={14} />
            </PendingNavLink>
          </nav>
        ) : adminSection ? (
          <nav aria-label="Admin navigation">
            <PendingNavLink
              to="/admin/access"
              pendingTo="/admin/access/registration-emails"
              count={pending?.data?.sections.admin}
              label="registration emails"
              className="secondary-nav-item"
            >
              <Icon name="shield" size={19} />
              <span>Access</span>
              <Icon name="chevronRight" size={14} />
            </PendingNavLink>
          </nav>
        ) : (
          <nav aria-label="App navigation">
            <PendingNavLink
              to="/app/user"
              pendingTo={appQueue}
              count={pending?.data?.sections.app}
              label="app items"
              className="secondary-nav-item"
            >
              <Icon name="users" size={19} />
              <span>User</span>
              <Icon name="chevronRight" size={14} />
            </PendingNavLink>
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
                : supportSection
                  ? "Support"
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
                : supportSection
                  ? "Configure"
                  : partnerSection
                    ? partnerApplications
                      ? "Applications"
                      : "Requirements"
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
              : supportSection
                ? "Support configuration"
                : partnerSection
                  ? partnerApplications
                    ? "Application settings"
                    : "Requirement settings"
                  : adminSection
                    ? "Access settings"
                    : "User settings"
          }
        >
          {usersSection ? (
            <>
              <NavLink
                to={
                  (selectedId ? personalPath(selectedId) : USERS_PATH) +
                  pendingSuffix
                }
              >
                Personal
              </NavLink>
              {selectedId && (
                <NavLink
                  to={`/users/${encodeURIComponent(selectedId)}/rides${pendingSuffix}`}
                >
                  Rides
                </NavLink>
              )}
              {selectedId && selected && isDriverAccount(selected) && (
                <NavLink
                  to={`/users/${encodeURIComponent(selectedId)}/vehicle-verification${pendingSuffix}`}
                >
                  Vehicle Verification{" "}
                  <PendingBadge
                    count={
                      pending?.data?.entities.users[selectedId]
                        ?.vehicle_verification
                    }
                  />
                </NavLink>
              )}
            </>
          ) : supportSection ? (
            <NavLink to="/support/configure/contact">Contact</NavLink>
          ) : partnerSection ? (
            partnerApplications ? (
              <>
                <PendingNavLink
                  to="/partner-program/applications"
                  pendingTo="/partner-program/applications?pending_only=true"
                  count={pending?.data?.tabs.applications}
                  label="applications"
                  end
                >
                  Applications
                </PendingNavLink>
                <PendingNavLink
                  to="/partner-program/applications/confirmations"
                  pendingTo="/partner-program/applications/confirmations?pending_only=true"
                  count={pending?.data?.tabs.confirmations}
                  label="confirmations"
                >
                  Confirmations
                </PendingNavLink>
                <PendingNavLink
                  to="/partner-program/applications/exit-requests"
                  pendingTo="/partner-program/applications/exit-requests?pending_only=true"
                  count={pending?.data?.tabs.exit_requests}
                  label="exit requests"
                >
                  Exit Request &amp; Dues
                </PendingNavLink>
              </>
            ) : (
              <>
                <NavLink to="/partner-program/requirements/details">
                  Details
                </NavLink>
                <NavLink to="/partner-program/requirements/documents">
                  Documents
                </NavLink>
                <NavLink to="/partner-program/requirements/policy">
                  Policy
                </NavLink>
                <NavLink to="/partner-program/requirements/confirmation">
                  Confirmation
                </NavLink>
              </>
            )
          ) : adminSection ? (
            <>
              <NavLink to={ADMIN_ACCESS_PATH}>1More Admin</NavLink>
              <NavLink to="/admin/access/activity">Audit log</NavLink>
              <PendingNavLink
                to="/admin/access/registration-emails"
                pendingTo="/admin/access/registration-emails"
                count={pending?.data?.tabs.registration_emails}
                label="registration emails"
              >
                Registration emails
              </PendingNavLink>
            </>
          ) : (
            <>
              <NavLink to={WORKSPACE_PATH}>Vehicle Categories</NavLink>
              <PendingNavLink
                to="/app/user/vehicle-models"
                pendingTo="/app/user/vehicle-models?pending_only=true"
                count={pending?.data?.tabs.vehicle_models}
                label="catalog requests"
              >
                Vehicle Models
              </PendingNavLink>
              <NavLink to="/app/user/fare-policy">Fare Policy</NavLink>
              <PendingNavLink
                to="/app/user/ride-reviews"
                pendingTo="/app/user/ride-reviews?pending_only=true"
                count={pending?.data?.tabs.ride_reviews}
                label="ride reviews"
              >
                Ride Reviews
              </PendingNavLink>
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

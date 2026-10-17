import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import {
  ManagementToolbar,
  FilterSelect,
  ManagementPagination,
} from "../../components/ui/ManagementControls";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon, type IconName } from "../../components/ui/Icon";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import { Toast } from "../../components/feedback/Toast";
import { safeMessage } from "../../lib/api-client";
import { useAuth } from "../auth/AuthProvider";
import { getAccess } from "./admin-access.api";
import {
  accessName,
  type AccessList,
  type AccessPerson,
  type AccessStatus,
} from "./admin-access.type";
import { AccessDialog } from "./AccessDialogs";
import { LoginLocation } from "./LoginLocation";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );

export function AdminAccessPage() {
  const { user } = useAuth();
  const [result, setResult] = useState<AccessList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccessStatus>("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ target: AccessPerson | null } | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  const refresh = useCallback(() => {
    loadController.current?.abort();
    setLoading(true);
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true);
    setError(null);
    void getAccess(search, status, page, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(safeMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [search, status, page, revision]);
  const stats: {
    label: string;
    value: number | undefined;
    detail: string;
    icon: IconName;
  }[] = [
    {
      label: "Administrators",
      value: result?.stats.total_admins,
      detail: "People with workspace access",
      icon: "users",
    },
    {
      label: "Active accounts",
      value: result?.stats.active_admins,
      detail: "Approved to use 1More Admin",
      icon: "shield",
    },
    {
      label: "Awaiting Google sign-in",
      value: result?.stats.awaiting_sign_in,
      detail: "Access granted, Google not linked",
      icon: "clock",
    },
  ];
  const pendingSearch = query.trim() !== search;
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="ADMIN ACCESS"
        context="Workspace permissions"
        title="1More Admin"
        description="Give the right people access to your admin workspace."
      >
        <Button onClick={() => setEditor({ target: null })}>
          <Icon name="plus" size={18} />
          Grant access
        </Button>
      </PageHeading>
      <section
        className="stats-grid access-stats"
        aria-label="Administrator overview"
      >
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <span className="stat-icon">
                <Icon name={stat.icon} size={19} />
              </span>
            </div>
            {stat.value === undefined && !error ? (
              <div className="skeleton mt-4 h-8 w-14" />
            ) : (
              <strong>{stat.value?.toString().padStart(2, "0") ?? "—"}</strong>
            )}
            <p>{stat.detail}</p>
          </article>
        ))}
      </section>
      <CatalogPanel
        title="Workspace administrators"
        description="Manage access with a verified Google account email."
        count={result?.total ?? "…"}
        busy={loading || pendingSearch}
      >
        <ManagementToolbar
          value={query}
          onChange={setQuery}
          placeholder="Search by name, email or ID"
          refresh={refresh}
          busy={loading}
        >
          <FilterSelect
            label="Account status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as AccessStatus);
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </FilterSelect>
        </ManagementToolbar>
        <div role="status" className="sr-only">
          {loading || pendingSearch
            ? "Loading administrators"
            : `${result?.total ?? 0} administrators found`}
        </div>
        {error ? (
          <div className="catalog-feedback">
            <InlineError message={error} />
            <Button variant="secondary" onClick={refresh}>
              Try again
            </Button>
          </div>
        ) : loading || pendingSearch ? (
          <TableLoading label="Loading administrators" />
        ) : !result?.admins.length ? (
          <StateCard
            title={
              search || status !== "all"
                ? "No matching administrators"
                : "No administrators found"
            }
            message="Try another search or refresh the list."
          >
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setStatus("all");
                setPage(1);
                refresh();
              }}
            >
              Reset filters
            </Button>
          </StateCard>
        ) : (
          <div className="table-scroll">
            <table className="access-table">
              <caption className="sr-only">
                Accounts with 1More Admin access
              </caption>
              <thead>
                <tr>
                  <th scope="col">Administrator</th>
                  <th scope="col">Account status</th>
                  <th scope="col">Google account</th>
                  <th scope="col">Access granted</th>
                  <th scope="col">Last admin login</th>
                  <th scope="col">Login location</th>
                  <th scope="col" className="col-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.admins.map((admin) => (
                  <tr key={admin.id}>
                    <td>
                      <div className="access-person">
                        <Avatar user={admin} />
                        <div>
                          <strong>
                            {accessName(admin)}
                            {admin.id === user?.id && (
                              <span className="access-you">You</span>
                            )}
                          </strong>
                          <span>
                            {admin.email || "No email on this account"}
                          </span>
                          <small>ID: {admin.id}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge active={admin.status === "ACTIVE"}>
                        {admin.status === "ACTIVE" ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                    <td>
                      <span className="access-detail">
                        {admin.has_google_account
                          ? "Linked"
                          : "Awaiting sign-in"}
                      </span>
                      {admin.status === "SUSPENDED" && (
                        <small className="access-subtext">
                          Sign-in blocked
                        </small>
                      )}
                    </td>
                    <td>
                      <span className="access-detail">
                        {admin.granted_at
                          ? formatDate(admin.granted_at)
                          : "Existing access"}
                      </span>
                      <small className="access-subtext">
                        {admin.granted_by
                          ? `By ${accessName(admin.granted_by)}`
                          : admin.granted_at
                            ? "Provisioned directly"
                            : "Granted before access tracking"}
                      </small>
                    </td>
                    <td>
                      <span className="access-detail">
                        {admin.last_admin_login_at
                          ? new Date(admin.last_admin_login_at).toLocaleString()
                          : "Not recorded"}
                      </span>
                    </td>
                    <td>
                      <LoginLocation location={admin.last_login_location} />
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        disabled={admin.id === user?.id}
                        title={
                          admin.id === user?.id
                            ? "Another administrator must remove your access."
                            : `Remove admin access for ${accessName(admin)}`
                        }
                        onClick={() => setEditor({ target: admin })}
                      >
                        {admin.id === user?.id
                          ? "Your access"
                          : "Remove access"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && !error && (
          <ManagementPagination
            data={result}
            disabled={loading || pendingSearch}
            onPage={setPage}
          />
        )}
      </CatalogPanel>
      {editor && (
        <AccessDialog
          target={editor.target}
          onClose={() => setEditor(null)}
          onConflict={refresh}
          onSaved={(message) => {
            setEditor(null);
            setToast(message);
            refresh();
          }}
        />
      )}
      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

import { useState } from "react";
import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import { Badge } from "../../components/ui/Badge";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import {
  ManagementToolbar,
  FilterSelect,
  ManagementPagination,
} from "../../components/ui/ManagementControls";
import { useAdminResource, useDebouncedText } from "../../lib/useAdminResource";
import { accessName, type AccessIdentity } from "./admin-access.type";
type Activity = {
  id: string;
  request_id: string;
  actor: AccessIdentity | null;
  method: string;
  path: string;
  action: string;
  status_code: number | null;
  started_at: string;
  completed_at: string | null;
  ip_address: string | null;
};
export function AdminActivityPage() {
  const [query, setQuery] = useState("");
  const search = useDebouncedText(query);
  const [outcome, setOutcome] = useState("all");
  const [activity, setActivity] = useState("changes");
  const [page, setPage] = useState(1);
  const resource = useAdminResource<{
    activities: Activity[];
    total: number;
    page: number;
    page_size: number;
    retention_days?: number | null;
  }>(
    `/admin/activity?${new URLSearchParams({ query: search, outcome, activity, page: String(page) })}`,
  );
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="ADMIN ACCESS"
        context="Workspace activity"
        title="Audit log"
        description="Review administrator activity and request outcomes across your workspace."
      />
      <CatalogPanel
        title="Workspace activity"
        description="Changes and session actions are shown first. Use the activity filter to include reads and private-file access."
        count={resource.data?.total ?? "…"}
        busy={resource.loading}
        toolbar={
          <ManagementToolbar
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search action, administrator or request ID"
            refresh={resource.refresh}
            busy={resource.loading}
          >
            <FilterSelect
              label="Activity type"
              value={activity}
              onChange={(event) => {
                setActivity(event.target.value);
                setPage(1);
              }}
            >
              <option value="changes">Changes &amp; session actions</option>
              <option value="reads">Read activity</option>
              <option value="all">All activity</option>
            </FilterSelect>
            <FilterSelect
              label="Activity outcome"
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All outcomes</option>
              <option value="success">Succeeded</option>
              <option value="failure">Failed</option>
              <option value="pending">Outcome not recorded</option>
            </FilterSelect>
          </ManagementToolbar>
        }
        footer={
          resource.data &&
          resource.data.total > 0 &&
          !resource.error && (
            <ManagementPagination
              data={resource.data}
              disabled={resource.loading}
              onPage={setPage}
            />
          )
        }
      >
        {resource.error ? (
          <div className="catalog-feedback">
            <InlineError message={resource.error} />
          </div>
        ) : resource.loading ? (
          <TableLoading label="Loading activity" />
        ) : !resource.data?.activities.length ? (
          <StateCard
            title="No activity found"
            message="No entries match these filters. Choose All activity to include reads, or clear your search."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Administrator request audit history
              </caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Administrator</th>
                  <th scope="col">Action</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Request ID</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.activities.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.started_at).toLocaleString()}</td>
                    <td>
                      <strong className="cell-title">
                        {row.actor ? accessName(row.actor) : "Not identified"}
                      </strong>
                      <small className="cell-detail">
                        {row.actor?.id ?? row.ip_address ?? ""}
                      </small>
                    </td>
                    <td>
                      <strong className="cell-title">{row.action}</strong>
                      <span className="cell-detail">
                        {row.method} {row.path}
                      </span>
                    </td>
                    <td>
                      {row.status_code === null ? (
                        <Badge tone="warning">Outcome not recorded</Badge>
                      ) : (
                        <Badge
                          tone={row.status_code < 400 ? "active" : "danger"}
                        >
                          {row.status_code === 499
                            ? "Connection closed"
                            : row.status_code < 400
                              ? "Succeeded"
                              : "Failed"}{" "}
                          · {row.status_code}
                        </Badge>
                      )}
                    </td>
                    <td className="cell-id">{row.request_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CatalogPanel>
      {resource.data?.retention_days === null && (
        <p className="catalog-note">Audit history has no automatic expiry.</p>
      )}
    </div>
  );
}

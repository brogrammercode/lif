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
  const [page, setPage] = useState(1);
  const resource = useAdminResource<{
    activities: Activity[];
    total: number;
    page: number;
    page_size: number;
  }>(
    `/admin/activity?${new URLSearchParams({ query: search, outcome, page: String(page) })}`,
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
        description="Search recorded actions, sign-ins and request outcomes."
        count={resource.data?.total ?? "…"}
        busy={resource.loading}
        toolbar={
          <ManagementToolbar
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search actor, route or request ID"
            refresh={resource.refresh}
            busy={resource.loading}
          >
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
              <option value="pending">In progress</option>
            </FilterSelect>
          </ManagementToolbar>
        }
        footer={
          resource.data &&
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
            message="Recorded admin requests will appear here."
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
                        {row.actor
                          ? accessName(row.actor)
                          : "Unauthenticated session request"}
                      </strong>
                      <small className="cell-detail">
                        {row.actor?.id ?? row.ip_address ?? ""}
                      </small>
                    </td>
                    <td>
                      <strong className="cell-title">{row.method}</strong>
                      <span className="cell-detail">{row.path}</span>
                    </td>
                    <td>
                      {row.status_code === null ? (
                        <Badge tone="warning">In progress</Badge>
                      ) : (
                        <Badge
                          tone={row.status_code < 400 ? "active" : "danger"}
                        >
                          {row.status_code < 400 ? "Succeeded" : "Failed"} ·{" "}
                          {row.status_code}
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
    </div>
  );
}

import { useEffect, useState } from "react";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { PageHeading } from "../../components/layout/PageHeading";
import {
  CatalogPanel,
  TableLoading,
  PanelNote,
} from "../../components/ui/CatalogPanel";
import { Badge } from "../../components/ui/Badge";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import {
  ManagementToolbar,
  FilterSelect,
  ManagementPagination,
} from "../../components/ui/ManagementControls";
import { useAdminResource, useDebouncedText } from "../../lib/useAdminResource";
import { useVisibleRefresh } from "../../lib/useVisibleRefresh";
import { accessName } from "./admin-access.type";
import {
  readActivityPage,
  type Activity,
  type ActivityPage,
} from "./admin-activity.type";
export function AdminActivityPage() {
  const [selectedSnapshot, setSelected] = useState<Activity | null>(null);
  const [query, setQuery] = useState("");
  const search = useDebouncedText(query);
  const [outcome, setOutcome] = useState("all");
  const [activity, setActivity] = useState("all");
  const [page, setPage] = useState(1);
  const resourcePath = `/admin/activity?${new URLSearchParams({ query: search, outcome, activity, page: String(page) })}`;
  const resource = useAdminResource<ActivityPage>(
    resourcePath,
    readActivityPage,
  );
  // Retain rows during refresh only for the same query. A changed filter/page
  // must not label the previous query's entries as its own results.
  const data = resource.dataPath === resourcePath ? resource.data : null;
  const error = resource.errorPath === resourcePath ? resource.error : null;
  const selected =
    data?.activities.find((row) => row.id === selectedSnapshot?.id) ??
    selectedSnapshot;
  useEffect(() => {
    // Retention or deletion can reduce the page count while a historical page
    // is open. Follow the server's clamped page so live-first-page behavior and
    // subsequent pagination do not keep requesting the obsolete page number.
    if (data && data.page !== page) setPage(data.page);
  }, [data, page]);
  useVisibleRefresh(resource.refresh, resource.loading, page === 1);
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
        description="Page visits, sign-ins, file access and changes. Filter by activity or outcome."
        count={data?.total ?? "…"}
        busy={resource.loading}
        actions={
          <span className="audit-live-copy">
            <span
              className={`audit-live-dot${error ? " has-error" : ""}`}
              aria-hidden="true"
            />
            {error
              ? "Update failed"
              : resource.loading && data
                ? "Updating activity"
                : page === 1
                  ? "Updates every 30 seconds"
                  : "Historical activity"}
          </span>
        }
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
          <>
            {data && data.total > 0 && (
              <ManagementPagination
                data={data}
                disabled={resource.loading}
                onPage={setPage}
              />
            )}
            <PanelNote>Audit entries expire after 7 days.</PanelNote>
          </>
        }
      >
        {error && data && (
          <div className="catalog-feedback">
            <InlineError
              message={`Could not update activity. Showing the last loaded results. ${error}`}
            />
          </div>
        )}
        {error && !data ? (
          <StateCard error title="Could not load activity" message={error}>
            <Button variant="secondary" onClick={resource.refresh}>
              Retry
            </Button>
          </StateCard>
        ) : !data ? (
          <TableLoading label="Loading activity" />
        ) : !data.activities.length ? (
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
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.activities.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.started_at).toLocaleString()}</td>
                    <td>
                      <strong className="cell-title">
                        {row.actor ? accessName(row.actor) : "Not identified"}
                      </strong>
                      <small className="cell-detail">
                        {row.actor?.email ?? row.ip_address ?? ""}
                      </small>
                    </td>
                    <td>
                      <strong className="cell-title">{row.action}</strong>
                      <span className="cell-detail">
                        {row.resource ?? "Workspace activity"}
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
                    <td>
                      <ActionMenu
                        label={"audit entry " + row.request_id}
                        items={[
                          {
                            label: "View log details",
                            icon: "layers",
                            onSelect: () => setSelected(row),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CatalogPanel>
      {selected && (
        <Dialog
          compact
          title={selected.action}
          description={selected.resource ?? "Audit entry"}
          onClose={() => setSelected(null)}
        >
          <dl className="trip-dialog-body audit-detail">
            {(
              [
                [
                  "Administrator",
                  selected.actor
                    ? accessName(selected.actor)
                    : "Not identified",
                ],
                ["Email", selected.actor?.email ?? "Not available"],
                ["Recorded", new Date(selected.started_at).toLocaleString()],
                ["Request", selected.method + " " + selected.path],
                [
                  "Outcome",
                  selected.status_code === null
                    ? "Not recorded"
                    : String(selected.status_code),
                ],
                ["Request ID", selected.request_id],
                ["IP address", selected.ip_address ?? "Not recorded"],
                [
                  "Expires",
                  new Date(
                    Date.parse(selected.started_at) + 7 * 86400000,
                  ).toLocaleString(),
                ],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="dialog-footer">
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Close
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

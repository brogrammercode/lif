import {
  PendingBadge,
  usePending,
  usePendingEntities,
} from "../pending/PendingProvider";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import {
  ManagementToolbar,
  ManagementPagination,
  FilterSelect,
} from "../../components/ui/ManagementControls";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { StateCard } from "../../components/feedback/StateCard";
import {
  useAdminResource,
  useDebouncedText,
  type Paged,
} from "../../lib/useAdminResource";
import { PARTNER_API } from "./partner-program.api";
import {
  partnerStatus,
  partnerTone,
  type PartnerApplicationSummary,
} from "./partner-program.type";
import { PartnerApplicationReview } from "./PartnerApplicationReview";

const statuses = [
  "all",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "CONFIRMATION_SUBMITTED",
  "CONFIRMATION_CHANGES_REQUESTED",
  "COMPLETED",
  "ACTIVATED",
  "EXITED",
];

export function PartnerApplicationsPage({
  section,
}: {
  section: "applications" | "confirmations";
}) {
  const [query, setQuery] = useState("");
  const text = useDebouncedText(query);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingOnly = searchParams.get("pending_only") === "true";
  useEffect(() => {
    setPage(1);
    if (pendingOnly) {
      setStatus("all");
      setQuery("");
    }
  }, [pendingOnly]);
  const selected = searchParams.get("application_id");
  const pending = usePending();
  const setSelected = (id: string | null) =>
    setSearchParams((current) => {
      const params = new URLSearchParams(current);
      if (id) params.set("application_id", id);
      else params.delete("application_id");
      return params;
    });
  const resource = useAdminResource<Paged<PartnerApplicationSummary>>(
    PARTNER_API +
      "/applications?" +
      new URLSearchParams({
        section,
        query: text,
        status,
        page: String(page),
        ...(pendingOnly ? { pending_only: "true" } : {}),
      }),
  );
  usePendingEntities(
    "applications",
    selected ? [selected] : (resource.data?.rows.map((app) => app.id) ?? []),
  );
  const title = section === "applications" ? "Applications" : "Confirmations";
  if (selected)
    return (
      <PartnerApplicationReview
        key={`${section}:${selected}`}
        id={selected}
        section={section}
        onBack={() => {
          setSelected(null);
          resource.refresh();
        }}
      />
    );
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="PARTNER PROGRAM"
        context="Applications"
        title={title}
        description={
          section === "applications"
            ? "Review each partner's submitted details and documents, and request corrections where needed."
            : "Review accepted confirmations, approve the final document, and manage delivery and activation."
        }
      />
      {pendingOnly && (
        <div className="workspace-notice">
          Showing items that need admin attention.{" "}
          <Button
            variant="ghost"
            onClick={() =>
              setSearchParams((current) => {
                const p = new URLSearchParams(current);
                p.delete("pending_only");
                return p;
              })
            }
          >
            Show all
          </Button>
        </div>
      )}
      <CatalogPanel
        title={
          section === "applications"
            ? "Partner applications"
            : "Partner confirmations"
        }
        description={
          section === "applications"
            ? "Follow each applicant from submission through driver activation."
            : "Accepted confirmations and their review progress."
        }
        count={resource.data?.total ?? "..."}
        busy={resource.loading}
        toolbar={
          <ManagementToolbar
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search applicants, emails or IDs"
            refresh={resource.refresh}
            busy={resource.loading}
          >
            <FilterSelect
              label="Application status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value === "all" ? "All statuses" : partnerStatus(value)}
                </option>
              ))}
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
          <StateCard
            error
            title="Applications could not be loaded"
            message={resource.error}
          >
            <Button variant="secondary" onClick={resource.refresh}>
              Try again
            </Button>
          </StateCard>
        ) : resource.loading ? (
          <TableLoading label={"Loading " + title.toLowerCase()} />
        ) : !resource.data?.rows.length ? (
          <StateCard
            title="No matching applications"
            message="Submitted applications will appear here. Try changing your search or status filter."
          >
            {(query || status !== "all") && (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setPage(1);
                }}
              >
                Clear filters
              </Button>
            )}
          </StateCard>
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Partner {title.toLowerCase()}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Applicant</th>
                  <th scope="col">Application</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col" className="col-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {resource.data.rows.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <strong className="cell-title">
                        {[app.user.first_name, app.user.last_name]
                          .filter(Boolean)
                          .join(" ") || app.contact_email}
                      </strong>
                      <small className="cell-detail">{app.contact_email}</small>
                      <small className="cell-detail">
                        {app.whatsapp_phone}
                      </small>
                    </td>
                    <td>
                      <span className="cell-id">{app.id}</span>
                      <small className="cell-detail">User {app.user_id}</small>
                    </td>
                    <td>
                      <PendingBadge
                        count={
                          pending?.data?.entities.applications[app.id]?.[
                            section === "applications"
                              ? "fields"
                              : "confirmations"
                          ]
                        }
                        label={
                          section === "applications"
                            ? "fields to review"
                            : "items requiring attention"
                        }
                      />
                      <Badge tone={partnerTone(app.status)}>
                        {partnerStatus(app.status)}
                      </Badge>
                    </td>
                    <td>
                      {new Date(app.submitted_at).toLocaleDateString()}
                      <small className="cell-detail">
                        {new Date(app.submitted_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button
                          variant="ghost"
                          onClick={() => setSelected(app.id)}
                          aria-label={"Review application " + app.id}
                        >
                          <Icon name="edit" size={16} />
                          Review
                        </Button>
                      </div>
                    </td>
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

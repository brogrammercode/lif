import { useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import {
  ManagementToolbar,
  FilterSelect,
  ManagementPagination,
} from "../../components/ui/ManagementControls";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import {
  useAdminResource,
  useDebouncedText,
  type Paged,
} from "../../lib/useAdminResource";
import { apiRequest, safeMessage } from "../../lib/api-client";
import { partnerStatus, partnerTone } from "./partner-program.type";
import { PartnerExitReview } from "./PartnerExitReview";
import type { PartnerExit } from "./partner-exit.type";
import "../../styles/partner-program.css";
export const EXIT_API = "/admin/partner-program/exit-requests";

export function PartnerExitsPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const search = useDebouncedText(query);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(
    params.get("request_id"),
  );
  const [creating, setCreating] = useState(!!params.get("application_id"));
  const [applicationId, setApplicationId] = useState(
    params.get("application_id") ?? "",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const creatingRequest = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const resource = useAdminResource<Paged<PartnerExit>>(
    `${EXIT_API}?${new URLSearchParams({ query: search, status, page: String(page) })}`,
  );
  function closeCreate() {
    setCreating(false);
    setError(null);
    setParams({}, { replace: true });
  }
  if (selected)
    return (
      <PartnerExitReview
        key={selected}
        id={selected}
        onBack={() => {
          setSelected(null);
          setParams({}, { replace: true });
          resource.refresh();
        }}
      />
    );
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="PARTNER PROGRAM"
        context="Applications"
        title="Exit Request & Dues"
        description="Review driver exits, record dues and issue the final settlement PDF."
      >
        <Button
          onClick={() => {
            setCreating(true);
            setReason("");
            setError(null);
          }}
        >
          Create exit request
        </Button>
      </PageHeading>
      <CatalogPanel
        title="Driver exit requests"
        description="Completing an exit disables driver operations and releases the settlement PDF in the app."
        count={resource.data?.total ?? "…"}
        busy={resource.loading}
        toolbar={
          <ManagementToolbar
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPage(1);
            }}
            placeholder="Search driver, email or ID"
            refresh={resource.refresh}
            busy={resource.loading}
          >
            <FilterSelect
              label="Exit status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {["all", "REQUESTED", "REVIEWING", "REJECTED", "COMPLETED"].map(
                (v) => (
                  <option value={v} key={v}>
                    {v === "all" ? "All statuses" : partnerStatus(v)}
                  </option>
                ),
              )}
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
            <Button variant="secondary" onClick={resource.refresh}>
              Try again
            </Button>
          </div>
        ) : resource.loading ? (
          <TableLoading label="Loading exit requests" />
        ) : !resource.data?.rows.length ? (
          <StateCard
            title="No exit requests"
            message="Drivers can request an exit from their app. You can also create a request for an activated application."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Driver exits and dues</caption>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Requested</th>
                  <th>Dues</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        {[
                          row.application.user.first_name,
                          row.application.user.last_name,
                        ]
                          .filter(Boolean)
                          .join(" ") || row.application.contact_email}
                      </strong>
                      <small className="cell-detail">
                        {row.application.contact_email}
                      </small>
                      <small className="cell-detail">
                        ID {row.application.user_id}
                      </small>
                    </td>
                    <td>{new Date(row.created_at).toLocaleDateString()}</td>
                    <td>
                      {row.dues_amount === null
                        ? "Not recorded"
                        : `${row.currency} ${row.dues_amount}`}
                      <small className="cell-detail">
                        {partnerStatus(row.dues_direction)}
                      </small>
                    </td>
                    <td>
                      <Badge tone={partnerTone(row.status)}>
                        {partnerStatus(row.status)}
                      </Badge>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => setSelected(row.id)}
                      >
                        Review exit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CatalogPanel>
      {creating && (
        <Dialog
          small
          title="Create driver exit request"
          description="Start an exit for an activated partner. Driver access remains available until you complete the review."
          busy={busy}
          onClose={closeCreate}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (creatingRequest.current) return;
              creatingRequest.current = true;
              setBusy(true);
              setError(null);
              void apiRequest<PartnerExit>(EXIT_API, {
                method: "POST",
                data: {
                  application_id: applicationId.trim(),
                  reason: reason.trim(),
                  version: 0,
                },
              })
                .then((row) => {
                  closeCreate();
                  setSelected(row.id);
                  resource.refresh();
                })
                .catch((cause) => setError(safeMessage(cause)))
                .finally(() => {
                  creatingRequest.current = false;
                  setBusy(false);
                });
            }}
            className="space-y-4"
          >
            {error && <InlineError message={error} />}
            <Field
              id="exit-application"
              label="Application ID"
              hint="Use the activated application’s ID, not the user ID. You can also start an exit from its application review."
            >
              <input
                id="exit-application"
                className="field"
                value={applicationId}
                maxLength={100}
                required
                disabled={busy}
                onChange={(event) => setApplicationId(event.target.value)}
              />
            </Field>
            <Field id="exit-reason" label="Reason for exit">
              <textarea
                id="exit-reason"
                className="field"
                value={reason}
                minLength={10}
                maxLength={2000}
                required
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <div className="dialog-footer">
              <Button variant="secondary" disabled={busy} onClick={closeCreate}>
                Cancel
              </Button>
              <Button type="submit" busy={busy}>
                Create request
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}

import { ActionMenu } from "../../components/ui/ActionMenu";
import { VehicleIdentity } from "../../components/ui/VehicleIdentity";
import {
  TripRoute,
  TripPeople,
  TripFacts,
  TripSection,
} from "../users/TripDetails";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import {
  InlineError,
  LoadingState,
  StateCard,
} from "../../components/feedback/StateCard";
import { Button } from "../../components/ui/Button";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Icon } from "../../components/ui/Icon";
import { Dialog } from "../../components/ui/Dialog";
import { personName, moneyLabel } from "../users/ride-presentation";
import { Field } from "../../components/ui/Field";
import { Badge } from "../../components/ui/Badge";
import { ManagementPagination } from "../../components/ui/ManagementControls";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";
import { ApiError, apiRequest } from "../../lib/api-client";
import type { TripReview, TripReviewPage } from "./configuration.api";
import { decodeTripReviews } from "./configuration.validation";

const reviewLabel = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
const reviewTime = (value: string) =>
  new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });

export function TripReviewsPage() {
  const [params, setParams] = useSearchParams();
  const pendingOnly = params.get("pending_only") === "true";
  const [status, setStatus] = useState(
    params.get("pending_only") === "true" ? "PENDING" : "",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const resource = useAdminResource<TripReviewPage>(
    `/admin/trip-reviews?page=${page}${status ? `&status=${status}` : ""}`,
    decodeTripReviews,
  );
  useEffect(() => {
    if (pendingOnly) {
      setStatus("PENDING");
    } else {
      setStatus((current) => (current === "PENDING" ? "" : current));
    }
    setPage(1);
  }, [pendingOnly]);
  const save = useAdminSave();
  const { clearError } = save;
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [blocked, setBlocked] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (resource.data) {
      setBlocked({});
      clearError();
    }
  }, [resource.data, clearError]);
  async function resolve(row: TripReview, next: string) {
    const note = (notes[row.id] ?? "").trim();
    if (note.length < 5 || blocked[row.id]) return;
    await save.run(
      async (signal) => {
        try {
          await apiRequest(
            `/admin/trip-reviews/${encodeURIComponent(row.id)}`,
            {
              method: "PATCH",
              signal,
              data: { expected_version: row.version, status: next, note },
            },
          );
        } catch (cause) {
          if (
            cause instanceof ApiError &&
            ["REVIEW_CONFLICT", "REVIEW_CLOSED"].includes(cause.code)
          ) {
            setBlocked((current) => ({ ...current, [row.id]: true }));
          }
          throw cause;
        }
      },
      () => {
        setNotes((current) => ({ ...current, [row.id]: "" }));
        resource.refresh();
      },
    );
  }
  const selected = resource.data?.items.find((row) => row.id === selectedId);
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="App / User"
        title="Ride Reviews"
        description="Review unpaid fares, cancellations and no-shows. Resolve each report using the trip evidence."
      />
      <CatalogPanel
        title="Ride reports"
        description="Review reports and record decisions in one place."
        count={resource.data?.total}
        busy={resource.loading}
        toolbar={
          <div className="review-toolbar">
            <Field id="trip-review-filter" label="Review status">
              <select
                id="trip-review-filter"
                className="field"
                value={status}
                disabled={save.busy}
                onChange={(e) => {
                  setStatus(e.target.value);
                  if (e.target.value !== "PENDING")
                    setParams(
                      (current) => {
                        const p = new URLSearchParams(current);
                        p.delete("pending_only");
                        return p;
                      },
                      { replace: true },
                    );
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {[
                  "PENDING",
                  "REQUESTED",
                  "DISPUTED",
                  "APPROVED",
                  "WAIVED",
                  "REJECTED",
                  "SETTLED",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value === "PENDING" ? "Needs review" : reviewLabel(value)}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="secondary"
              disabled={save.busy || resource.loading}
              busy={resource.loading}
              onClick={resource.refresh}
            >
              <Icon name="refresh" size={16} />
              Refresh reviews
            </Button>
          </div>
        }
        footer={
          resource.data && !resource.error && resource.data.total > 0 ? (
            <ManagementPagination
              data={resource.data}
              disabled={save.busy || resource.loading}
              onPage={setPage}
            />
          ) : undefined
        }
      >
        {save.error && !selected && (
          <div className="catalog-feedback">
            <InlineError message={save.error} />
          </div>
        )}
        {resource.loading ? (
          <LoadingState variant="table" label="Loading ride reviews" />
        ) : resource.error ? (
          <StateCard
            error
            title="Could not load ride reviews"
            message={resource.error}
          >
            <Button onClick={resource.refresh}>Retry</Button>
          </StateCard>
        ) : resource.data?.items.length === 0 ? (
          <StateCard
            title={status ? "No matching reviews" : "No ride reviews"}
            message={
              status
                ? "Choose another status to see more reports."
                : "Reports will appear here when submitted from a trip."
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>Passenger / Driver</th>
                  <th>Vehicle</th>
                  <th>Report</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {resource.data?.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.ride.pickup_address}</strong>
                      <span className="table-subtitle">
                        To {row.ride.dropoff_address}
                      </span>
                      <span className="table-subtitle">
                        {reviewTime(row.created_at)}
                      </span>
                    </td>
                    <td>
                      <strong>{personName(row.ride.rider)}</strong>
                      <span className="table-subtitle">
                        {personName(row.ride.driver?.user)}
                      </span>
                    </td>
                    <td>
                      <VehicleIdentity vehicle={row.ride.vehicle} />
                    </td>
                    <td>
                      {reviewLabel(row.kind)}
                      <span
                        className="table-subtitle report-reason"
                        title={row.reason}
                      >
                        {row.reason}
                      </span>
                    </td>
                    <td>{moneyLabel(row.fee_amount)}</td>
                    <td>
                      <Badge
                        tone={
                          ["REQUESTED", "DISPUTED", "APPROVED"].includes(
                            row.status,
                          )
                            ? "warning"
                            : "inactive"
                        }
                      >
                        {reviewLabel(row.status)}
                      </Badge>
                    </td>
                    <td>
                      <ActionMenu
                        label={"report " + row.id}
                        items={[
                          {
                            label: "Review report",
                            icon: "edit",
                            onSelect: () => {
                              setSelectedId(row.id);
                              clearError();
                            },
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
          title={reviewLabel(selected.kind) + " report"}
          description={reviewTime(selected.created_at)}
          busy={save.busy}
          onClose={() => {
            setSelectedId(null);
            clearError();
          }}
        >
          <div className="trip-dialog-body">
            <div className="trip-summary">
              <Badge
                tone={
                  ["REQUESTED", "DISPUTED", "APPROVED"].includes(
                    selected.status,
                  )
                    ? "warning"
                    : "inactive"
                }
              >
                {reviewLabel(selected.status)}
              </Badge>
              <div>
                <span>Reported charge</span>
                <strong>{moneyLabel(selected.fee_amount)}</strong>
              </div>
            </div>
            <TripRoute
              pickup={selected.ride.pickup_address}
              dropoff={selected.ride.dropoff_address}
            />
            <div className="trip-report-reasons">
              <div>
                <span>Reported reason</span>
                <p>{selected.reason}</p>
              </div>
              {selected.dispute_reason && (
                <div>
                  <span>Passenger dispute</span>
                  <p>{selected.dispute_reason}</p>
                </div>
              )}
            </div>
            <TripSection title="People & vehicle">
              <TripPeople
                rider={selected.ride.rider}
                driver={selected.ride.driver?.user}
              />
              <div className="trip-vehicle">
                <VehicleIdentity vehicle={selected.ride.vehicle} />
              </div>
            </TripSection>
            <details className="trip-disclosure">
              <summary>Trip evidence ({selected.ride.events.length})</summary>
              <TripFacts
                columns={3}
                items={[
                  [
                    "Reported by",
                    personName(
                      selected.reported_by ??
                        (selected.reported_by_id === selected.ride.rider?.id
                          ? selected.ride.rider
                          : selected.reported_by_id ===
                              selected.ride.driver?.user.id
                            ? selected.ride.driver.user
                            : null),
                    ),
                  ],
                  [
                    "Driver accepted",
                    selected.ride.matched_at
                      ? reviewTime(selected.ride.matched_at)
                      : "Not assigned",
                  ],
                  [
                    "Arrival recorded",
                    selected.ride.arrived_at
                      ? reviewTime(selected.ride.arrived_at)
                      : "Not recorded",
                  ],
                ]}
              />

              <div className="trip-evidence-list">
                {selected.ride.events.map((event) => (
                  <div key={event.id}>
                    <strong>{reviewLabel(event.event_type)}</strong>
                    <time>{reviewTime(event.created_at)}</time>
                    {event.event_type === "CALL_ATTEMPT" && (
                      <p className="field-hint">
                        Call requested; connection is not verified.
                      </p>
                    )}
                    {evidenceFacts(event.metadata).map(([label, value]) => (
                      <p key={label} className="field-hint">
                        {label}: {value}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
              <p className="trip-reference">
                Trip {selected.ride_id} / Report {selected.id} / Version{" "}
                {selected.version}
              </p>
            </details>
            {selected.resolution_note && (
              <div className="trip-resolution">
                <strong>Resolution</strong>
                <p>{selected.resolution_note}</p>
              </div>
            )}
            {blocked[selected.id] && (
              <InlineError message="This report changed. Reload it before making another decision." />
            )}
            {save.error && <InlineError message={save.error} />}
            {!["WAIVED", "REJECTED", "SETTLED"].includes(selected.status) && (
              <div className="trip-section trip-review-decision">
                <Field
                  id={"review-" + selected.id}
                  label="Review note"
                  hint="Required. At least 5 characters."
                >
                  <textarea
                    id={"review-" + selected.id}
                    className="field"
                    rows={2}
                    maxLength={2000}
                    disabled={save.busy}
                    value={notes[selected.id] ?? ""}
                    onChange={(e) =>
                      setNotes((v) => ({ ...v, [selected.id]: e.target.value }))
                    }
                  />
                </Field>
                <p className="field-hint">
                  Verify receipt before recording settlement. Charges belong to
                  the affected driver.
                </p>
              </div>
            )}
          </div>
          <div className="dialog-footer">
            {!["WAIVED", "REJECTED", "SETTLED"].includes(selected.status) &&
              (selected.status === "APPROVED"
                ? ["REJECTED", "WAIVED", "SETTLED"]
                : ["REJECTED", "WAIVED", "APPROVED"]
              ).map((next) => (
                <Button
                  key={next}
                  variant={
                    next === "APPROVED" || next === "SETTLED"
                      ? "primary"
                      : "secondary"
                  }
                  disabled={
                    save.busy ||
                    resource.loading ||
                    blocked[selected.id] ||
                    (notes[selected.id] ?? "").trim().length < 5
                  }
                  onClick={() => void resolve(selected, next)}
                >
                  {
                    (
                      {
                        APPROVED: "Approve charge",
                        WAIVED: "Waive charge",
                        REJECTED: "Reject report",
                        SETTLED: "Record settlement",
                      } as Record<string, string>
                    )[next]
                  }
                </Button>
              ))}
            {blocked[selected.id] && (
              <Button
                variant="secondary"
                disabled={save.busy || resource.loading}
                onClick={resource.refresh}
              >
                Reload report
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={save.busy}
              onClick={() => {
                setSelectedId(null);
                clearError();
              }}
            >
              Close
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
function evidenceFacts(metadata: unknown): [string, string][] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return [];
  const m = metadata as Record<string, unknown>;
  const labels: Record<string, string> = {
    distance_m: "Distance from pickup (m)",
    location_age_s: "GPS age (s)",
    accuracy_m: "GPS accuracy (m)",
    proposed_fee: "Proposed fee",
    fee_amount: "Amount",
    reason: "Reason",
    reason_code: "Reason",
    gps_verified: "GPS verified",
    arrival_radius_m: "Allowed arrival distance (m)",
    waited_seconds: "Waiting time (s)",
    rider_confirmed: "Passenger confirmed",
    driver_verified: "Driver verified",
  };
  return Object.entries(labels).flatMap(([key, label]) =>
    m[key] != null && ["string", "number", "boolean"].includes(typeof m[key])
      ? ([
          [
            label,
            typeof m[key] === "boolean"
              ? m[key]
                ? "Yes"
                : "No"
              : key === "reason_code"
                ? reviewLabel(String(m[key]))
                : String(m[key]),
          ],
        ] as [string, string][])
      : [],
  );
}

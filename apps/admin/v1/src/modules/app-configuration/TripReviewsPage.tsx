import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
import {
  personName,
  moneyLabel,
  type RidePerson,
} from "../users/ride-presentation";
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
              onClick={resource.refresh}
            >
              <Icon
                name={resource.loading ? "spinner" : "refresh"}
                className={resource.loading ? "animate-spin" : ""}
                size={16}
              />
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
          <LoadingState />
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
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelectedId(row.id);
                          clearError();
                        }}
                      >
                        Review report
                      </Button>
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
          reader
          title={reviewLabel(selected.kind) + " report"}
          description={reviewTime(selected.created_at)}
          busy={save.busy}
          onClose={() => {
            setSelectedId(null);
            clearError();
          }}
        >
          <div className="ride-detail-body">
            <div className="trip-review-heading">
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
              <strong>{moneyLabel(selected.fee_amount)}</strong>
            </div>
            <div className="trip-review-route">
              <div>
                <span>Pickup</span>
                <p>{selected.ride.pickup_address}</p>
              </div>
              <Icon name="arrowRight" size={16} />
              <div>
                <span>Drop-off</span>
                <p>{selected.ride.dropoff_address}</p>
              </div>
            </div>
            <div className="review-facts">
              {(
                [
                  ["Passenger", selected.ride.rider],
                  ["Driver", selected.ride.driver?.user],
                ] as [string, RidePerson | null | undefined][]
              ).map(([label, p]) => (
                <div key={label}>
                  <span>{label}</span>
                  <p>
                    {p ? (
                      <Link
                        className="review-text-link"
                        to={"/users/" + encodeURIComponent(p.id) + "/personal"}
                      >
                        {personName(p)}
                      </Link>
                    ) : (
                      personName(p)
                    )}
                  </p>
                  <p>{p?.phone_e164 ?? p?.email}</p>
                </div>
              ))}
              <div>
                <span>Reported by</span>
                <p>
                  {selected.reported_by
                    ? personName(selected.reported_by)
                    : selected.reported_by_id === selected.ride.rider?.id
                      ? personName(selected.ride.rider)
                      : selected.reported_by_id ===
                          selected.ride.driver?.user.id
                        ? personName(selected.ride.driver.user)
                        : "Account no longer available"}
                </p>
              </div>
              <div>
                <span>Vehicle</span>
                <p>
                  {selected.ride.vehicle
                    ? selected.ride.vehicle.make +
                      " " +
                      selected.ride.vehicle.model
                    : "Not assigned"}
                </p>
                <p>{selected.ride.vehicle?.plate_number}</p>
              </div>
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
              <div>
                <span>Driver accepted</span>
                <p>
                  {selected.ride.matched_at
                    ? reviewTime(selected.ride.matched_at)
                    : "Not assigned"}
                </p>
              </div>
              <div>
                <span>Arrival recorded</span>
                <p>
                  {selected.ride.arrived_at
                    ? reviewTime(selected.ride.arrived_at)
                    : "Not recorded"}
                </p>
              </div>
            </div>
            {selected.ride.events?.length > 0 && (
              <details className="trip-evidence">
                <summary>Trip evidence ({selected.ride.events.length})</summary>
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
              </details>
            )}
            {selected.resolution_note && (
              <div className="workspace-notice">
                <strong>Resolution</strong>
                <p>{selected.resolution_note}</p>
              </div>
            )}
            {blocked[selected.id] && (
              <InlineError message="This report changed. Reload it before making another decision." />
            )}
            {save.error && <InlineError message={save.error} />}
            {!["WAIVED", "REJECTED", "SETTLED"].includes(selected.status) && (
              <div className="trip-review-decision">
                <Field
                  id={"review-" + selected.id}
                  label="Review note"
                  hint="Explain your decision in at least 5 characters."
                >
                  <textarea
                    id={"review-" + selected.id}
                    className="field"
                    rows={3}
                    maxLength={2000}
                    disabled={save.busy}
                    value={notes[selected.id] ?? ""}
                    onChange={(e) =>
                      setNotes((v) => ({ ...v, [selected.id]: e.target.value }))
                    }
                  />
                </Field>
                <p className="field-hint">
                  Approval records an amount owed to the affected driver. Record
                  settlement only after verifying receipt. Fees are never added
                  to another trip.
                </p>
              </div>
            )}
            <details className="trip-evidence">
              <summary>Reference</summary>
              <p className="field-hint">
                Trip {selected.ride_id} · Report {selected.id} · Version{" "}
                {selected.version}
              </p>
            </details>
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
              onClick={() => setSelectedId(null)}
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

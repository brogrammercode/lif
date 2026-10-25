import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import {
  InlineError,
  LoadingState,
  StateCard,
} from "../../components/feedback/StateCard";
import { Button } from "../../components/ui/Button";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Icon } from "../../components/ui/Icon";
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
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const resource = useAdminResource<TripReviewPage>(
    `/admin/trip-reviews?page=${page}${status ? `&status=${status}` : ""}`,
    decodeTripReviews,
  );
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
  return (
    <div className="personal-page">
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
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {[
                  "REQUESTED",
                  "DISPUTED",
                  "APPROVED",
                  "WAIVED",
                  "REJECTED",
                  "SETTLED",
                ].map((value) => (
                  <option key={value} value={value}>
                    {reviewLabel(value)}
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
        <div className="review-guidance">
          <Icon name="shield" size={18} />
          <div>
            <p>
              Fees belong to the affected driver and are never added to another
              ride.
            </p>
            <details>
              <summary>Review guidelines</summary>
              <p>
                An approval records a pending obligation. Mark settled only
                after verifying receipt by the original driver. A call attempt
                records that calling was requested; it does not prove
                connection. Review valid reasons, late/refusing drivers and
                disputes before approving a fee.
              </p>
            </details>
          </div>
        </div>
        {save.error && (
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
          resource.data?.items.map((row) => (
            <article className="trip-review" key={row.id}>
              <header className="trip-review-heading">
                <div>
                  <h3>{reviewLabel(row.kind)}</h3>
                  <p className="field-hint">
                    Trip {row.ride_id} · Version {row.version}
                  </p>
                </div>
                <div className="trip-review-amount">
                  <strong>
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                    }).format(Number(row.fee_amount))}
                  </strong>
                  <Badge
                    tone={
                      ["SETTLED", "APPROVED"].includes(row.status)
                        ? "active"
                        : ["DISPUTED", "REQUESTED"].includes(row.status)
                          ? "warning"
                          : row.status === "REJECTED"
                            ? "danger"
                            : "inactive"
                    }
                  >
                    {reviewLabel(row.status)}
                  </Badge>
                </div>
              </header>
              <div className="trip-review-route">
                <div>
                  <span>Pickup</span>
                  <p>{row.ride.pickup_address}</p>
                </div>
                <Icon name="arrowRight" size={16} />
                <div>
                  <span>Drop-off</span>
                  <p>{row.ride.dropoff_address}</p>
                </div>
              </div>
              <div className="review-facts">
                <div>
                  <span>Reported reason</span>
                  <p>{row.reason}</p>
                </div>
                {row.dispute_reason && (
                  <div>
                    <span>Dispute</span>
                    <p>{row.dispute_reason}</p>
                  </div>
                )}
                <div>
                  <span>Driver accepted</span>
                  <p>
                    {row.ride.matched_at
                      ? reviewTime(row.ride.matched_at)
                      : "Not assigned"}
                  </p>
                </div>
                <div>
                  <span>Arrival recorded</span>
                  <p>
                    {row.ride.arrived_at
                      ? reviewTime(row.ride.arrived_at)
                      : "Not recorded"}
                  </p>
                </div>
              </div>
              <div className="trip-review-participants">
                <Link
                  className="review-text-link"
                  to={
                    "/users/" +
                    encodeURIComponent(row.ride.rider_id) +
                    "/personal"
                  }
                >
                  View rider <Icon name="arrowRight" size={14} />
                </Link>
                <span>
                  Reported by {row.reported_by_id} · Driver profile{" "}
                  {row.driver_id ?? "None"}
                </span>
              </div>
              {row.ride.events?.length > 0 && (
                <details className="trip-evidence">
                  <summary>Review trip evidence</summary>
                  <div className="trip-evidence-list">
                    {row.ride.events.map((event) => (
                      <div key={event.id}>
                        <strong>{reviewLabel(event.event_type)}</strong>
                        <time>{reviewTime(event.created_at)}</time>
                        {event.metadata != null && (
                          <pre>{JSON.stringify(event.metadata, null, 2)}</pre>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {row.resolution_note && (
                <div className="workspace-notice">
                  <strong>Resolution</strong>
                  <p>{row.resolution_note}</p>
                </div>
              )}
              {blocked[row.id] && (
                <p className="field-hint">
                  Refresh reviews before making another decision on this report.
                </p>
              )}
              {!["WAIVED", "REJECTED", "SETTLED"].includes(row.status) && (
                <div className="trip-review-decision">
                  <Field
                    id={"review-" + row.id}
                    label="Review note"
                    hint="Explain the evidence and the decision (at least 5 characters)."
                  >
                    <textarea
                      id={"review-" + row.id}
                      className="field"
                      rows={3}
                      maxLength={2000}
                      value={notes[row.id] ?? ""}
                      onChange={(e) =>
                        setNotes((v) => ({ ...v, [row.id]: e.target.value }))
                      }
                    />
                  </Field>
                  <div className="review-actions">
                    {(row.status === "APPROVED"
                      ? ["REJECTED", "WAIVED", "SETTLED"]
                      : ["REJECTED", "WAIVED", "APPROVED"]
                    ).map((next) => (
                      <Button
                        key={next}
                        variant={next === "APPROVED" ? "primary" : "secondary"}
                        disabled={
                          save.busy ||
                          blocked[row.id] ||
                          (notes[row.id] ?? "").trim().length < 5
                        }
                        onClick={() => void resolve(row, next)}
                      >
                        {next === "SETTLED"
                          ? "Record verified settlement"
                          : {
                              APPROVED: "Approve charge",
                              WAIVED: "Waive charge",
                              REJECTED: "Reject report",
                            }[next]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </CatalogPanel>
    </div>
  );
}

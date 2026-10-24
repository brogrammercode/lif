import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import {
  InlineError,
  LoadingState,
  StateCard,
} from "../../components/feedback/StateCard";
import { Button } from "../../components/ui/Button";
import { EditorSection } from "../../components/ui/EditorSection";
import { Field } from "../../components/ui/Field";
import { Badge } from "../../components/ui/Badge";
import { ManagementPagination } from "../../components/ui/ManagementControls";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";
import { ApiError, apiRequest } from "../../lib/api-client";
import type { TripReview, TripReviewPage } from "./configuration.api";
import { decodeTripReviews } from "./configuration.validation";

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
        description="Review unpaid fares, cancellation and no-show evidence. Fees belong to the affected driver and are never added to another ride."
      />
      <div className="personal-card editor-form">
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
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <p className="field-hint">
          An approval records a pending obligation. Mark settled only after
          verifying receipt by the original driver. A call attempt records that
          calling was requested; it does not prove connection. Review valid
          reasons, late/refusing drivers and disputes before approving a fee.
        </p>
        {save.error && <InlineError message={save.error} />}
        <Button
          variant="secondary"
          disabled={save.busy || resource.loading}
          onClick={resource.refresh}
        >
          Refresh reviews
        </Button>
      </div>
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
          title="No ride reviews"
          message="Reports will appear here when submitted from a trip."
        />
      ) : (
        resource.data?.items.map((row, index) => (
          <div className="personal-card editor-form" key={row.id}>
            <EditorSection
              step={String(index + 1).padStart(2, "0")}
              title={`${row.kind.replaceAll("_", " ")} · INR ${row.fee_amount}`}
              description={`Trip ${row.ride_id} · Version ${row.version}`}
            >
              <Badge>{row.status}</Badge>
              <p>
                {row.ride.pickup_address} → {row.ride.dropoff_address}
              </p>
              <p>
                <Link
                  to={`/users/${encodeURIComponent(row.ride.rider_id)}/personal`}
                >
                  View rider
                </Link>{" "}
                · Reported by {row.reported_by_id} · Affected driver profile{" "}
                {row.driver_id ?? "None"}
              </p>
              <div className="form-grid">
                <div>
                  <span className="field-hint">Reported reason</span>
                  <p>{row.reason}</p>
                </div>
                {row.dispute_reason && (
                  <div>
                    <span className="field-hint">Dispute</span>
                    <p>{row.dispute_reason}</p>
                  </div>
                )}
              </div>
              <p className="field-hint">
                Accepted:{" "}
                {row.ride.matched_at
                  ? new Date(row.ride.matched_at).toLocaleString()
                  : "Not assigned"}{" "}
                · Arrival:{" "}
                {row.ride.arrived_at
                  ? new Date(row.ride.arrived_at).toLocaleString()
                  : "Not recorded"}
              </p>
              {row.ride.events?.length > 0 && (
                <details>
                  <summary>Review trip evidence</summary>
                  {row.ride.events.map((event) => (
                    <div key={event.id}>
                      <strong>{event.event_type.replaceAll("_", " ")}</strong> ·{" "}
                      {new Date(event.created_at).toLocaleString()}
                      {event.metadata != null && (
                        <pre className="field-hint whitespace-pre-wrap">
                          {JSON.stringify(event.metadata, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </details>
              )}
              {row.resolution_note && <p>{row.resolution_note}</p>}
              {blocked[row.id] && (
                <p className="field-hint">
                  Refresh reviews before making another decision on this report.
                </p>
              )}
              {!["WAIVED", "REJECTED", "SETTLED"].includes(row.status) && (
                <>
                  <Field
                    id={`review-${row.id}`}
                    label="Review note"
                    hint="Explain the evidence and the decision (at least 5 characters)."
                  >
                    <textarea
                      id={`review-${row.id}`}
                      className="field"
                      rows={3}
                      maxLength={2000}
                      value={notes[row.id] ?? ""}
                      onChange={(e) =>
                        setNotes((v) => ({ ...v, [row.id]: e.target.value }))
                      }
                    />
                  </Field>
                  <div className="dialog-footer">
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
                </>
              )}
            </EditorSection>
          </div>
        ))
      )}
      {resource.data && !resource.error && (
        <ManagementPagination
          data={resource.data}
          disabled={save.busy || resource.loading}
          onPage={setPage}
        />
      )}
    </div>
  );
}

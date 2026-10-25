import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { ManagementPagination } from "../../components/ui/ManagementControls";
import { LoadingState, StateCard } from "../../components/feedback/StateCard";
import { useAdminResource } from "../../lib/useAdminResource";
import { userName, type UserSummary } from "./users.type";

import {
  personName,
  statusLabel,
  timeLabel,
  moneyLabel,
  type RidePerson,
} from "./ride-presentation";
type Ride = {
  id: string;
  status: string;
  created_at: string;
  requested_at: string | null;
  matched_at: string | null;
  arrived_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  pickup_address: string;
  dropoff_address: string;
  cancel_reason: string | null;
  estimated_distance_m: number | null;
  actual_distance_m: number | null;
  estimated_fare: string | null;
  final_fare: string | null;
  currency: string;
  rider: RidePerson;
  driver: { user: RidePerson } | null;
  vehicle: {
    make: string;
    model: string;
    plate_number: string;
    vehicle_category: { name: string } | null;
  } | null;
  payment: { status: string; collection_method: string | null } | null;
};
type Rides = {
  user: UserSummary;
  role: "rider" | "driver";
  items: Ride[];
  total: number;
  page: number;
  page_size: number;
};
function decode(value: unknown): Rides {
  const v = value as Rides;
  const nullableText = (s: unknown) => s == null || typeof s === "string";
  const person = (p: RidePerson | null) =>
    p &&
    typeof p.id === "string" &&
    [p.first_name, p.last_name, p.email, p.phone_e164].every(nullableText);
  const date = (d: unknown) =>
    d == null || (typeof d === "string" && Number.isFinite(Date.parse(d)));
  const amount = (a: unknown) =>
    a == null ||
    (((typeof a === "string" && a.trim() !== "") || typeof a === "number") &&
      Number.isFinite(Number(a)) &&
      Number(a) >= 0);
  const distance = (d: unknown) =>
    d == null || (typeof d === "number" && Number.isFinite(d) && d >= 0);
  if (
    !v ||
    !Array.isArray(v.items) ||
    !person(v.user) ||
    !["rider", "driver"].includes(v.role) ||
    !Number.isInteger(v.total) ||
    !Number.isInteger(v.page) ||
    !Number.isInteger(v.page_size) ||
    v.total < 0 ||
    v.page < 1 ||
    v.page_size < 1 ||
    v.page_size > 100 ||
    v.items.length > v.page_size ||
    !v.items.every(
      (r) =>
        r &&
        typeof r.id === "string" &&
        typeof r.pickup_address === "string" &&
        typeof r.dropoff_address === "string" &&
        person(r.rider) &&
        typeof r.status === "string" &&
        typeof r.currency === "string" &&
        /^[A-Z]{3}$/.test(r.currency) &&
        typeof r.created_at === "string" &&
        [
          r.created_at,
          r.requested_at,
          r.matched_at,
          r.arrived_at,
          r.started_at,
          r.completed_at,
          r.cancelled_at,
        ].every(date) &&
        [r.estimated_fare, r.final_fare].every(amount) &&
        [r.estimated_distance_m, r.actual_distance_m].every(distance) &&
        nullableText(r.cancel_reason) &&
        (r.driver == null || person(r.driver.user)) &&
        (r.vehicle == null ||
          ([r.vehicle.make, r.vehicle.model, r.vehicle.plate_number].every(
            (s) => typeof s === "string",
          ) &&
            (r.vehicle.vehicle_category == null ||
              typeof r.vehicle.vehicle_category.name === "string"))) &&
        (r.payment == null ||
          (typeof r.payment.status === "string" &&
            nullableText(r.payment.collection_method))),
    )
  )
    throw new Error("The ride list could not be read. Refresh to try again.");
  return v;
}
export function UserRidesPage() {
  const { userId } = useParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Ride | null>(null);
  useEffect(() => {
    setPage(1);
    setSelected(null);
  }, [userId]);
  const resource = useAdminResource<Rides>(
    `/admin/users/${encodeURIComponent(userId ?? "")}/rides?page=${page}&status=${status}`,
    decode,
  );
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="Users / Rides"
        title="Rides"
        description={
          resource.data
            ? `${resource.data.role === "driver" ? "Rides assigned to" : "Rides booked by"} ${userName(resource.data.user)}.`
            : "Bookings, trip progress and payment details for this account."
        }
      />
      <CatalogPanel
        description="Trip records and payment status."
        title="Ride history"
        count={resource.data?.total}
        busy={resource.loading}
        toolbar={
          <div className="review-toolbar">
            <Field id="user-rides-status" label="Trip status">
              <select
                id="user-rides-status"
                className="field"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                  setSelected(null);
                }}
              >
                {["all", "active", "completed", "cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Button
              variant="secondary"
              onClick={resource.refresh}
              disabled={resource.loading}
            >
              Refresh rides
            </Button>
          </div>
        }
        footer={
          resource.data && resource.data.total > 0 ? (
            <ManagementPagination
              data={resource.data}
              disabled={resource.loading}
              onPage={setPage}
            />
          ) : undefined
        }
      >
        {resource.loading ? (
          <LoadingState />
        ) : resource.error ? (
          <StateCard
            error
            title="Could not load rides"
            message={resource.error}
          >
            <Button onClick={resource.refresh}>Retry</Button>
          </StateCard>
        ) : !resource.data?.items.length ? (
          <StateCard
            title="No rides to show"
            message="Booked or assigned rides will appear here. Try another status filter."
          />
        ) : (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Trip</th>
                  <th>
                    {resource.data.role === "driver" ? "Passenger" : "Driver"}
                  </th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Fare</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {resource.data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.pickup_address}</strong>
                      <span className="table-subtitle">
                        To {r.dropoff_address}
                      </span>
                      <span className="table-subtitle">
                        {timeLabel(r.requested_at ?? r.created_at)}
                      </span>
                    </td>
                    <td>
                      {personName(
                        resource.data?.role === "driver"
                          ? r.rider
                          : r.driver?.user,
                      )}
                    </td>
                    <td>
                      {r.vehicle ? (
                        <>
                          {r.vehicle.make} {r.vehicle.model}
                          <span className="table-subtitle">
                            {r.vehicle.plate_number}
                          </span>
                        </>
                      ) : (
                        "Not assigned"
                      )}
                    </td>
                    <td>
                      <Badge
                        tone={
                          r.status === "COMPLETED"
                            ? "active"
                            : r.status === "CANCELLED"
                              ? "danger"
                              : "inactive"
                        }
                      >
                        {statusLabel(r.status)}
                      </Badge>
                    </td>
                    <td>
                      {moneyLabel(r.final_fare ?? r.estimated_fare, r.currency)}
                      <span className="table-subtitle">
                        {r.payment
                          ? statusLabel(r.payment.status)
                          : "No payment recorded"}
                      </span>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => setSelected(r)}
                      >
                        View ride
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
          title="Ride details"
          description={`${selected.pickup_address} to ${selected.dropoff_address}`}
          onClose={() => setSelected(null)}
        >
          <div className="ride-detail-body">
            <div className="review-facts">
              {[
                ["Trip status", statusLabel(selected.status)],
                [
                  "Booked",
                  timeLabel(selected.requested_at ?? selected.created_at),
                ],
                ["Driver accepted", timeLabel(selected.matched_at)],
                ["Arrived", timeLabel(selected.arrived_at)],
                ["Started", timeLabel(selected.started_at)],
                ["Completed", timeLabel(selected.completed_at)],
                [
                  selected.final_fare == null ? "Estimated fare" : "Final fare",
                  moneyLabel(
                    selected.final_fare ?? selected.estimated_fare,
                    selected.currency,
                  ),
                ],
                [
                  "Payment",
                  selected.payment
                    ? `${statusLabel(selected.payment.status)} · ${statusLabel(selected.payment.collection_method ?? "Not set")}`
                    : "Not recorded",
                ],
                [
                  "Distance",
                  selected.actual_distance_m ?? selected.estimated_distance_m,
                ],
              ]
                .filter(
                  ([key, value]) =>
                    ![
                      "Driver accepted",
                      "Arrived",
                      "Started",
                      "Completed",
                    ].includes(String(key)) || value !== "Not recorded",
                )
                .map(([k, v]) => (
                  <div key={k}>
                    <span>{k}</span>
                    <p>
                      {k === "Distance"
                        ? v == null
                          ? "Not recorded"
                          : `${(Number(v) / 1000).toFixed(1)} km`
                        : v}
                    </p>
                  </div>
                ))}
              {[
                ["Passenger", selected.rider],
                ["Driver", selected.driver?.user],
              ].map(([label, p]) => {
                const person = p as RidePerson | undefined;
                return (
                  <div key={String(label)}>
                    <span>{String(label)}</span>
                    <p>
                      {person ? (
                        <Link
                          className="review-text-link"
                          to={`/users/${encodeURIComponent(person.id)}/personal`}
                        >
                          {personName(person)}
                        </Link>
                      ) : (
                        "Not assigned"
                      )}
                    </p>
                    <p>{person?.phone_e164 ?? person?.email}</p>
                  </div>
                );
              })}
              {selected.vehicle && (
                <div>
                  <span>Vehicle</span>
                  <p>
                    {selected.vehicle.make} {selected.vehicle.model}
                  </p>
                  <p>{selected.vehicle.plate_number}</p>
                  {selected.vehicle.vehicle_category && (
                    <p>{selected.vehicle.vehicle_category.name}</p>
                  )}
                </div>
              )}
              {selected.cancel_reason && (
                <div>
                  <span>Cancellation reason</span>
                  <p>{selected.cancel_reason}</p>
                </div>
              )}
            </div>
            <details className="trip-evidence">
              <summary>Reference</summary>
              <p>Trip ID: {selected.id}</p>
            </details>
          </div>
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

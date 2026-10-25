import {
  VehicleIdentity,
  type DisplayVehicle,
} from "../../components/ui/VehicleIdentity";
import { TripRoute, TripPeople, TripFacts, TripSection } from "./TripDetails";
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
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
  vehicle:
    | (DisplayVehicle & { make: string; model: string; plate_number: string })
    | null;
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
                      <VehicleIdentity vehicle={r.vehicle} />
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
        <Dialog compact title="Ride details" onClose={() => setSelected(null)}>
          <div className="trip-dialog-body">
            <div className="trip-summary">
              <Badge
                tone={
                  selected.status === "COMPLETED"
                    ? "active"
                    : selected.status === "CANCELLED"
                      ? "danger"
                      : "inactive"
                }
              >
                {statusLabel(selected.status)}
              </Badge>
              <div>
                <span>
                  {selected.final_fare == null
                    ? "Estimated fare"
                    : "Final fare"}
                </span>
                <strong>
                  {moneyLabel(
                    selected.final_fare ?? selected.estimated_fare,
                    selected.currency,
                  )}
                </strong>
              </div>
            </div>
            <TripRoute
              pickup={selected.pickup_address}
              dropoff={selected.dropoff_address}
            />
            <TripFacts
              columns={3}
              items={[
                [
                  "Booked",
                  timeLabel(selected.requested_at ?? selected.created_at),
                ],
                [
                  "Distance",
                  (selected.actual_distance_m ??
                    selected.estimated_distance_m) == null
                    ? "Not recorded"
                    : (
                        (selected.actual_distance_m ??
                          selected.estimated_distance_m)! / 1000
                      ).toFixed(1) + " km",
                ],
                [
                  "Payment",
                  selected.payment
                    ? statusLabel(selected.payment.status) +
                      " · " +
                      statusLabel(
                        selected.payment.collection_method ?? "Not set",
                      )
                    : "Not recorded",
                ],
              ]}
            />
            <TripSection title="People & vehicle">
              <TripPeople
                rider={selected.rider}
                driver={selected.driver?.user}
              />
              <div className="trip-vehicle">
                <VehicleIdentity vehicle={selected.vehicle} />
              </div>
            </TripSection>
            {selected.cancel_reason && (
              <TripSection title="Cancellation reason">
                <p>{selected.cancel_reason}</p>
              </TripSection>
            )}
            <details className="trip-disclosure">
              <summary>Trip timeline & reference</summary>
              <TripFacts
                items={(
                  [
                    ["Driver accepted", selected.matched_at],
                    ["Arrived", selected.arrived_at],
                    ["Started", selected.started_at],
                    ["Completed", selected.completed_at],
                    ["Cancelled", selected.cancelled_at],
                  ] as [string, string | null][]
                )
                  .filter(([, value]) => value)
                  .map(([label, value]) => [label, timeLabel(value)])}
              />
              <p className="trip-reference">Trip ID: {selected.id}</p>
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

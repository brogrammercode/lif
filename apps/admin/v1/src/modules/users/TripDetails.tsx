import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { personName, type RidePerson } from "./ride-presentation";

export function TripRoute({
  pickup,
  dropoff,
}: {
  pickup: string;
  dropoff: string;
}) {
  return (
    <div className="trip-route">
      <div>
        <i aria-hidden="true" />
        <div>
          <span>Pickup</span>
          <p>{pickup}</p>
        </div>
      </div>
      <div>
        <i aria-hidden="true" />
        <div>
          <span>Drop-off</span>
          <p>{dropoff}</p>
        </div>
      </div>
    </div>
  );
}

export function TripPeople({
  rider,
  driver,
}: {
  rider?: RidePerson | null;
  driver?: RidePerson | null;
}) {
  return (
    <dl className="trip-people">
      {(
        [
          ["Passenger", rider],
          ["Driver", driver],
        ] as const
      ).map(([label, person]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
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
            {(person?.phone_e164 || person?.email) && (
              <span>{person.phone_e164 || person.email}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function TripFacts({
  items,
  columns = 2,
}: {
  items: [string, ReactNode][];
  columns?: 2 | 3;
}) {
  return (
    <dl className={`trip-facts${columns === 3 ? " has-three-columns" : ""}`}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function TripSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="trip-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

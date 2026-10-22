import type { ReactNode } from "react";

export function PartnerReviewDetails({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="partner-review-details form-grid">
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value === null || value === undefined || value === "" ? (
              <span className="text-muted">Not provided</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export const reviewDate = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not recorded";

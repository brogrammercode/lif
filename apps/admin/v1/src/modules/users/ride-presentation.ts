import type { UserSummary } from "./users.type";
export type RidePerson = Pick<
  UserSummary,
  "id" | "first_name" | "last_name" | "email"
> & { phone_e164?: string | null };
export const personName = (p: RidePerson | null | undefined) =>
  p
    ? [p.first_name, p.last_name].filter(Boolean).join(" ") ||
      p.email ||
      "Unnamed account"
    : "Not assigned";
export const statusLabel = (s: string) =>
  s
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (c) => c.toUpperCase());
export const timeLabel = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not recorded";
export const moneyLabel = (
  value: string | number | null | undefined,
  currency = "INR",
) =>
  value == null
    ? "Not set"
    : new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
        Number(value),
      );

import type { UserSummary } from "../users/users.type";

export type AccessIdentity = Pick<
  UserSummary,
  "id" | "first_name" | "last_name" | "email" | "avatar_url"
>;
export type AccessPerson = UserSummary & {
  role: "ADMIN";
  updated_at: string;
  access_version: string | null;
  last_login_at: string | null;
  last_admin_login_at: string | null;
  last_login_location: LoginLocation | null;
  has_google_account: boolean;
  granted_at: string | null;
  granted_by: AccessIdentity | null;
};
export type LoginLocation = {
  source: "BROWSER" | "IP" | "UNAVAILABLE";
  permission: "granted" | "denied" | "unavailable" | "timeout";
  recorded_at: string;
  ip_address: string | null;
  ip_origin: "REQUEST" | "BROWSER_REPORTED" | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  city: string | null;
  region: string | null;
  country: string | null;
  isp: string | null;
};
export type AccessStatus = "all" | "ACTIVE" | "SUSPENDED";
export type AccessList = {
  admins: AccessPerson[];
  total: number;
  page: number;
  page_size: number;
  stats: {
    total_admins: number;
    active_admins: number;
    awaiting_sign_in: number;
  };
};
export const accessName = (user: AccessIdentity) =>
  [user.first_name, user.last_name].filter(Boolean).join(" ") ||
  user.email ||
  "Unnamed account";

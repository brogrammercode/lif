import type { ImageUpload } from "../../lib/image-upload";

export type UserSummary = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  partner_activated_at?: string | null;
  role: "RIDER" | "DRIVER" | "SUPPORT" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
};
export type UserDetails = UserSummary & {
  phone_e164: string | null;
  last_known_latitude: number | null;
  last_known_longitude: number | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  last_admin_login_at: string | null;
};
export type PersonalInput = Pick<
  UserDetails,
  "first_name" | "last_name" | "phone_e164" | "avatar_url"
> & { image_upload?: ImageUpload };
export type UserList = {
  users: UserSummary[];
  total: number;
  page: number;
  page_size: number;
};
export const userName = (user: UserSummary) =>
  [user.first_name, user.last_name].filter(Boolean).join(" ") ||
  user.email ||
  "Unnamed user";

export const isDriverAccount = (user: UserSummary) =>
  user.role === "DRIVER" || Boolean(user.partner_activated_at);

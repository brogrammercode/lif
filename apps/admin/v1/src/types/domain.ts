import type { ImageUpload } from "../lib/image-upload";

export type AdminUser = {
  id: string;
  role: "ADMIN";
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
};
export type VehicleFamily = "BIKE" | "SCOOTER" | "AUTO" | "SEDAN" | "SUV";
export type VehicleCategory = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  parent_name: string | null;
  vehicle_type: VehicleFamily;
  capacity: number;
  base_fare: number;
  per_kilometer: number;
  per_minute: number;
  is_active: boolean;
  effective_active: boolean;
  is_selectable: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  _count: { children: number; vehicles: number; quotes?: number };
};
export type CategoryInput = Pick<
  VehicleCategory,
  | "name"
  | "description"
  | "image_url"
  | "parent_id"
  | "vehicle_type"
  | "capacity"
  | "base_fare"
  | "per_kilometer"
  | "per_minute"
  | "is_active"
  | "sort_order"
> & { image_upload?: ImageUpload };
export type BrowserSession = { access_token: string; user: AdminUser };

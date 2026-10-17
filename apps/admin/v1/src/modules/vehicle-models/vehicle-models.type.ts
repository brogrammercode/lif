export type CatalogStatus = "REQUESTED" | "VERIFIED" | "REJECTED";
export type CatalogPerson = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};
export type Brand = {
  id: string;
  name: string;
  description: string | null;
  country: string | null;
  website_url: string | null;
  logo_url: string | null;
  status: CatalogStatus;
  is_active: boolean;
  rejection_reason: string | null;
  requested_by: CatalogPerson | null;
  reviewed_by: CatalogPerson | null;
  reviewed_at: string | null;
  updated_at: string;
  _count?: { models: number };
};
export type VehicleModel = {
  id: string;
  brand_id: string;
  brand: Pick<Brand, "id" | "name"> &
    Partial<Pick<Brand, "status" | "is_active">>;
  name: string;
  description: string | null;
  vehicle_type: string;
  fuel_type: string;
  seating_capacity: number;
  year_from: number | null;
  year_to: number | null;
  logo_url: string | null;
  status: CatalogStatus;
  is_active: boolean;
  rejection_reason: string | null;
  requested_by: CatalogPerson | null;
  reviewed_by: CatalogPerson | null;
  reviewed_at: string | null;
  updated_at: string;
};

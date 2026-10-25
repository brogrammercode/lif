import { apiRequest } from "../../lib/api-client";
import { privateFile } from "../partner-program/partner-program.api";
import type { UserSummary } from "./users.type";
import type { DisplayVehicle } from "../../components/ui/VehicleIdentity";
export type VehicleField = {
  key: string;
  label: string;
  value: string;
  display: string;
  status: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};
export type VerificationVehicle = DisplayVehicle & {
  id: string;
  make: string;
  model: string;
  plate_number: string;
  status: string;
  created_at: string;
  updated_at: string;
  verification_version: number;
  is_eligible?: boolean;
  verification_fields: VehicleField[];
  brand: {
    name?: string;
    logo_url?: string | null;
    status: string;
    is_active: boolean;
  } | null;
  catalog_model: {
    name?: string;
    logo_url?: string | null;
    status: string;
    is_active: boolean;
  } | null;
  verification_assets: { id: string; file_name: string; field_key: string }[];
};
export const getVehicleVerifications = (id: string, signal: AbortSignal) =>
  apiRequest<{ user: UserSummary; vehicles: VerificationVehicle[] }>(
    `/admin/users/${encodeURIComponent(id)}/vehicle-verification`,
    { signal },
  );
export const reviewVehicleField = (
  userId: string,
  vehicle: VerificationVehicle,
  key: string,
  decision: "APPROVED" | "REJECTED",
  reason: string | undefined,
  signal: AbortSignal,
) =>
  apiRequest<VerificationVehicle>(
    `/admin/users/${encodeURIComponent(userId)}/vehicle-verification/${encodeURIComponent(vehicle.id)}/review`,
    {
      method: "PATCH",
      timeoutMs: 60000,
      signal,
      data: {
        expected_version: vehicle.verification_version,
        field_key: key,
        decision,
        rejection_reason: reason,
      },
    },
  );
export const vehiclePrivateFile = (id: string, signal?: AbortSignal) =>
  privateFile(id, signal, "/vehicle-verification/assets");

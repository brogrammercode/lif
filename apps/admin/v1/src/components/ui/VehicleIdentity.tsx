import type { ReactNode } from "react";
import { EntityImage } from "./EntityImage";
import { Badge } from "./Badge";
import type { IconName } from "./Icon";

export type DisplayVehicle = {
  make?: string;
  model?: string;
  plate_number?: string;
  type?: string;
  brand?: { name?: string; logo_url?: string | null } | null;
  catalog_model?: { name?: string; logo_url?: string | null } | null;
  vehicle_category?: {
    name: string;
    image_url?: string | null;
    vehicle_type?: string;
  } | null;
};

export function VehicleIdentity({
  vehicle,
  name,
  detail,
  logo,
  family,
  badges,
  fallback,
}: {
  vehicle?: DisplayVehicle | null;
  name?: ReactNode;
  detail?: string | null;
  logo?: string | null;
  family?: string;
  badges?: ReactNode;
  fallback?: IconName;
}) {
  const title =
    name ??
    ([vehicle?.make, vehicle?.model].filter(Boolean).join(" ") ||
      "Vehicle not assigned");
  return (
    <div className="vehicle-identity">
      <EntityImage
        src={logo ?? vehicle?.catalog_model?.logo_url ?? null}
        fallbackSources={[
          vehicle?.brand?.logo_url,
          vehicle?.vehicle_category?.image_url,
        ]}
        family={
          family ?? vehicle?.type ?? vehicle?.vehicle_category?.vehicle_type
        }
        fallback={fallback}
        contain
      />
      <div className="vehicle-identity-copy">
        <strong className="vehicle-identity-name">{title}</strong>
        {(detail ?? vehicle?.plate_number) && (
          <span className="vehicle-identity-detail">
            {detail ?? vehicle?.plate_number}
          </span>
        )}
        {(badges || vehicle?.vehicle_category?.name) && (
          <div className="vehicle-identity-badges">
            {badges ?? (
              <Badge tone="inactive">{vehicle?.vehicle_category?.name}</Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

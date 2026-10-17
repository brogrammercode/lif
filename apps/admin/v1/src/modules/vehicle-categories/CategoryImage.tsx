import { EntityImage } from "../../components/ui/EntityImage";
import type { VehicleFamily } from "../../types/domain";
export function CategoryImage({
  src,
  family,
}: {
  src: string | null;
  family: VehicleFamily;
}) {
  return (
    <EntityImage
      src={src}
      fallback={family === "BIKE" || family === "SCOOTER" ? "bike" : "car"}
    />
  );
}

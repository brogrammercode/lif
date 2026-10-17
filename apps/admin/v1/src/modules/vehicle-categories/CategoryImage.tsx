import { useEffect, useState } from "react";
import { Icon } from "../../components/ui/Icon";
import type { VehicleFamily } from "../../types/domain";
export function CategoryImage({
  src,
  family,
}: {
  src: string | null;
  family: VehicleFamily;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <span className="category-image">
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon
          name={family === "BIKE" || family === "SCOOTER" ? "bike" : "car"}
          size={24}
        />
      )}
    </span>
  );
}

import { useState } from "react";
import { Icon, type IconName } from "./Icon";

export function EntityImage({
  src,
  fallback,
  family,
  contain = false,
}: {
  src: string | null;
  fallback?: IconName;
  family?: string;
  contain?: boolean;
}) {
  const normalizedFamily = family?.trim().toUpperCase();
  // Keying the image by its source resets a failed URL when a new image is saved.
  return (
    <ImageContent
      key={src}
      src={src}
      fallback={
        fallback ??
        (normalizedFamily === "BIKE" || normalizedFamily === "SCOOTER"
          ? "bike"
          : "car")
      }
      contain={contain}
    />
  );
}
function ImageContent({
  src,
  fallback,
  contain,
}: {
  src: string | null;
  fallback: IconName;
  contain: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`category-image${contain ? " entity-image-contain" : ""}`}>
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Icon name={fallback} size={24} />
      )}
    </span>
  );
}

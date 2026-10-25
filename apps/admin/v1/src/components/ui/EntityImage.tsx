import { useState } from "react";
import { Icon, type IconName } from "./Icon";

export function EntityImage({
  src,
  fallback,
  family,
  contain = false,
  fallbackSources = [],
}: {
  src: string | null;
  fallback?: IconName;
  family?: string;
  contain?: boolean;
  fallbackSources?: (string | null | undefined)[];
}) {
  const normalizedFamily = family?.trim().toUpperCase();
  const sources = [
    ...new Set([src, ...fallbackSources].filter((s): s is string => !!s)),
  ];
  return (
    <ImageContent
      key={sources.join("|")}
      sources={sources}
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
  sources,
  fallback,
  contain,
}: {
  sources: string[];
  fallback: IconName;
  contain: boolean;
}) {
  const [index, setIndex] = useState(0);
  const src = sources[index];
  return (
    <span
      className={`category-image entity-avatar${contain ? " entity-image-contain" : ""}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setIndex((value) => value + 1)}
        />
      ) : (
        <Icon name={fallback} size={20} />
      )}
    </span>
  );
}

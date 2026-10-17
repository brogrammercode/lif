import type { LoginLocation as Location } from "./admin-access.type";

export function LoginLocation({
  location,
}: {
  location: Location | null | undefined;
}) {
  if (!location)
    return (
      <div className="login-location">
        <span>Not recorded</span>
        <small className="cell-detail">Available after the next sign-in.</small>
      </div>
    );
  const coordinates = location.latitude !== null && location.longitude !== null;
  const label = [location.city, location.region, location.country]
    .filter(Boolean)
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(", ");
  const position = coordinates
    ? `${location.latitude!.toFixed(5)}, ${location.longitude!.toFixed(5)}`
    : null;
  const source =
    location.source === "BROWSER"
      ? "Browser permission"
      : location.source === "IP"
        ? "Approximate IP location"
        : "Location unavailable";
  return (
    <div className="login-location">
      <strong className="cell-title">
        {label ||
          (location.source === "BROWSER" ? position : null) ||
          "Location unavailable"}
      </strong>
      <small className="cell-detail">
        {source}
        {location.source === "BROWSER" && location.accuracy_m !== null
          ? ` · ±${Math.round(location.accuracy_m)} m`
          : ""}
      </small>
      {location.isp && <small className="cell-detail">{location.isp}</small>}
      {location.ip_address && (
        <small className="cell-detail">
          IP: {location.ip_address}
          {location.ip_origin === "BROWSER_REPORTED"
            ? " (browser-reported)"
            : ""}
        </small>
      )}
      {coordinates && (
        <a
          href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=${location.source === "IP" ? 11 : 16}/${location.latitude}/${location.longitude}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {location.source === "IP" ? "View approximate area" : "View location"}
        </a>
      )}
    </div>
  );
}

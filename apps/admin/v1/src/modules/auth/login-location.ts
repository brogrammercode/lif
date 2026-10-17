type BrowserLocation = {
  permission: "granted" | "denied" | "unavailable" | "timeout";
  latitude?: number;
  longitude?: number;
  accuracy_m?: number;
  public_ip?: string;
};

function requestPosition(): Promise<BrowserLocation> {
  if (!window.isSecureContext || !navigator.geolocation)
    return Promise.resolve({ permission: "unavailable" });
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: BrowserLocation) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    // The native permission prompt can outlive the geolocation API timeout.
    // Keep sign-in usable even when the prompt receives no answer.
    const timer = window.setTimeout(
      () => finish({ permission: "timeout" }),
      10000,
    );
    try {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          finish({
            permission: "granted",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy_m: position.coords.accuracy,
          }),
        (error) =>
          finish({
            permission:
              error.code === 1
                ? "denied"
                : error.code === 3
                  ? "timeout"
                  : "unavailable",
          }),
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 },
      );
    } catch {
      finish({ permission: "unavailable" });
    }
  });
}

export async function captureLoginLocation(): Promise<BrowserLocation> {
  const location = await requestPosition();
  if (location.permission === "granted") return location;
  // This reports the browser's public IP when the API sees a local dev proxy.
  // The server prefers its observed public IP and labels client-reported IPs.
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch("https://api64.ipify.org?format=json", {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    if (response.ok) {
      const body: unknown = await response.json();
      if (
        body &&
        typeof body === "object" &&
        "ip" in body &&
        typeof body.ip === "string" &&
        validIp(body.ip)
      )
        location.public_ip = body.ip;
    }
  } catch {
    /* Optional network metadata must not prevent authentication. */
  } finally {
    window.clearTimeout(timer);
  }
  return location;
}

function validIp(value: string) {
  if (!/^[0-9a-f:.]{3,45}$/i.test(value)) return false;
  if (!value.includes(":"))
    return (
      value.split(".").length === 4 &&
      value
        .split(".")
        .every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
    );
  try {
    new URL(`https://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}

import { WORKSPACE_PATH } from "./auth.constant";

export function loginDestination(state: unknown): string {
  const path = (state as { returnTo?: unknown } | null)?.returnTo;
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    /[\\\u0000-\u0020]/.test(path)
  )
    return WORKSPACE_PATH;
  try {
    const base = "https://admin.invalid";
    const url = new URL(path, base);
    if (
      url.origin !== base ||
      url.pathname.startsWith("//") ||
      url.pathname.replace(/\/+$/, "") === "/login"
    )
      return WORKSPACE_PATH;
    return url.pathname + url.search + url.hash;
  } catch {
    return WORKSPACE_PATH;
  }
}

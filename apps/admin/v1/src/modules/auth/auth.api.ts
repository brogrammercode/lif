import { apiRequest, readBrowserSession } from "../../lib/api-client";
import {
  clearSession,
  rememberSignedInSession,
  withBrowserSessionLock,
} from "../../lib/session";
import { AUTH_PATHS } from "./auth.constant";
import { captureLoginLocation } from "./login-location";
import { SESSION_REQUEST_TIMEOUT_MS } from "../../lib/network.constant";

export async function signInWithGoogle(idToken: string) {
  const browserLocation = await captureLoginLocation();
  return withBrowserSessionLock(async () => {
    const session = readBrowserSession(
      await apiRequest<unknown>(AUTH_PATHS.GOOGLE, {
        method: "POST",
        data: { id_token: idToken, browser_location: browserLocation },
        anonymous: true,
        timeoutMs: SESSION_REQUEST_TIMEOUT_MS,
      }),
    );
    rememberSignedInSession(session.access_token, session.user);
    return session.user;
  });
}
export async function signOut() {
  return withBrowserSessionLock(async () => {
    await apiRequest(AUTH_PATHS.LOGOUT, { method: "POST", anonymous: true });
    try {
      window.google?.accounts.id.disableAutoSelect();
    } finally {
      clearSession(true);
    }
  });
}

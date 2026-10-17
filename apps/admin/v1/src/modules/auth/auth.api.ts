import { apiRequest, readBrowserSession } from "../../lib/api-client";
import {
  clearSession,
  rememberAccessToken,
  withBrowserSessionLock,
} from "../../lib/session";
import { AUTH_PATHS } from "./auth.constant";

export async function signInWithGoogle(idToken: string) {
  return withBrowserSessionLock(async () => {
    const session = readBrowserSession(
      await apiRequest<unknown>(AUTH_PATHS.GOOGLE, {
        method: "POST",
        data: { id_token: idToken },
        anonymous: true,
      }),
    );
    rememberAccessToken(session.access_token, session.user);
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

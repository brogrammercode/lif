import type { AdminUser } from "../types/domain";

let accessToken: string | null = null;
let sessionVersion = 0;
let mutationQueue: Promise<unknown> = Promise.resolve();
export const SESSION_ENDED = "lif-admin-session-ended";
export const SESSION_UPDATED = "lif-admin-session-updated";
const SESSION_CHANNEL = "lif-admin-session";
const RESTORE_BLOCKED_KEY = "onemore-admin-restore-blocked";
export const isSessionRestoreBlocked = () => {
  try {
    return localStorage.getItem(RESTORE_BLOCKED_KEY) === "1";
  } catch {
    return false;
  }
};
const sessionChannel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel(SESSION_CHANNEL);
export const getAccessToken = () => accessToken;
export const getSessionVersion = () => sessionVersion;
export function withBrowserSessionLock<T>(
  request: () => Promise<T>,
): Promise<T> {
  const run = async (): Promise<T> => {
    if (navigator.locks)
      return await navigator.locks.request(SESSION_CHANNEL, request);
    return request();
  };
  const result = mutationQueue.then(run, run);
  mutationQueue = result.catch(() => undefined);
  return result;
}
export const rememberAccessToken = (value: string, user?: AdminUser) => {
  try {
    localStorage.removeItem(RESTORE_BLOCKED_KEY);
  } catch {
    // Session credentials remain in memory when browser storage is unavailable.
  }
  accessToken = value;
  if (user)
    window.dispatchEvent(new CustomEvent(SESSION_UPDATED, { detail: user }));
};
// An explicit sign-in starts a new identity epoch. Responses issued before it
// must not clear or refresh this newly established session.
export const rememberSignedInSession = (value: string, user: AdminUser) => {
  sessionVersion++;
  rememberAccessToken(value, user);
};
export const accessTokenExpiresSoon = () => {
  if (!accessToken) return false;
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return true;
    const decoded: { exp?: number } = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return (
      typeof decoded.exp !== "number" ||
      decoded.exp * 1000 <= Date.now() + 60_000
    );
  } catch {
    return true;
  }
};
export const clearSession = (broadcast = false) => {
  accessToken = null;
  sessionVersion++;
  window.dispatchEvent(new Event(SESSION_ENDED));
  if (broadcast) sessionChannel?.postMessage(SESSION_ENDED);
};
export const endUnrestorableSession = () => {
  try {
    localStorage.setItem(RESTORE_BLOCKED_KEY, "1");
  } catch {
    // Still end the current session if storage is blocked.
  }
  clearSession(true);
};
if (sessionChannel)
  sessionChannel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === SESSION_ENDED) clearSession();
  };

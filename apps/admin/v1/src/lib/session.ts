import type { AdminUser } from "../types/domain";

let accessToken: string | null = null;
let sessionVersion = 0;
let mutationQueue: Promise<unknown> = Promise.resolve();
export const SESSION_ENDED = "lif-admin-session-ended";
export const SESSION_UPDATED = "lif-admin-session-updated";
const SESSION_CHANNEL = "lif-admin-session";
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
  accessToken = value;
  if (user)
    window.dispatchEvent(new CustomEvent(SESSION_UPDATED, { detail: user }));
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
if (sessionChannel)
  sessionChannel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data === SESSION_ENDED) clearSession();
  };

import {
  accessTokenExpiresSoon,
  clearSession,
  endUnrestorableSession,
  getAccessToken,
  getSessionVersion,
  isSessionRestoreBlocked,
  rememberAccessToken,
  withBrowserSessionLock,
} from "./session";
import type { BrowserSession } from "../types/domain";
import {
  NETWORK_COPY,
  REQUEST_TIMEOUT_MS,
  SESSION_CLEANUP_TIMEOUT_MS,
} from "./network.constant";

// Production uses the host's /api rewrite so refresh cookies stay first party.
const API_BASE = import.meta.env.PROD
  ? "/api/v2"
  : (import.meta.env.VITE_API_BASE_URL?.trim() || "/api/v2").replace(
      /\/+$/,
      "",
    );
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.status = status;
    this.code = code;
  }
}
type RequestOptions = {
  method?: string;
  data?: unknown;
  anonymous?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export function readBrowserSession(value: unknown): BrowserSession {
  if (!value || typeof value !== "object")
    throw new ApiError(NETWORK_COPY.INVALID_RESPONSE, 502);
  const session = value as Partial<BrowserSession>;
  const user = session.user;
  if (
    typeof session.access_token !== "string" ||
    !session.access_token ||
    !user ||
    typeof user !== "object" ||
    user.role !== "ADMIN" ||
    typeof user.id !== "string" ||
    !user.id ||
    [user.first_name, user.last_name, user.email, user.avatar_url].some(
      (field) => field !== null && typeof field !== "string",
    )
  ) {
    throw new ApiError(NETWORK_COPY.INVALID_RESPONSE, 502);
  }
  return session as BrowserSession;
}

async function send<T>(
  path: string,
  options: RequestOptions = {},
  token?: string | null,
): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abort();
  else options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(
    () =>
      controller.abort(new DOMException(NETWORK_COPY.TIMEOUT, "TimeoutError")),
    options.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.data === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body:
        options.data === undefined ? undefined : JSON.stringify(options.data),
      signal: controller.signal,
    });
    const parsed: unknown = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new ApiError(
        response.status >= 500
          ? NETWORK_COPY.SERVER_ERROR
          : NETWORK_COPY.INVALID_RESPONSE,
        response.status >= 400 ? response.status : 502,
      );
    const body = parsed as {
      status?: unknown;
      message?: unknown;
      error_code?: unknown;
      data?: T;
    };
    if (!response.ok || body.status !== "success")
      throw new ApiError(
        response.status >= 500
          ? NETWORK_COPY.SERVER_ERROR
          : typeof body.message === "string"
            ? body.message
            : NETWORK_COPY.REQUEST_ERROR,
        response.status,
        typeof body.error_code === "string" ? body.error_code : undefined,
      );
    if (!("data" in body))
      throw new ApiError(NETWORK_COPY.INVALID_RESPONSE, 502);
    return body.data as T;
  } catch (error) {
    if (options.signal?.aborted || error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted
        ? NETWORK_COPY.TIMEOUT
        : NETWORK_COPY.UNREACHABLE,
      0,
    );
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

let refreshing: Promise<BrowserSession | null> | null = null;
export function restoreBrowserSession(): Promise<BrowserSession | null> {
  if (isSessionRestoreBlocked()) return Promise.resolve(null);
  if (refreshing) return refreshing;
  const version = getSessionVersion();
  const result = withBrowserSessionLock(async () => {
    if (version !== getSessionVersion() || isSessionRestoreBlocked())
      return null;
    try {
      return readBrowserSession(
        await send<unknown>("/admin/auth/refresh", {
          method: "POST",
          anonymous: true,
        }),
      );
    } catch {
      if (version !== getSessionVersion()) return null;
      endUnrestorableSession();
      try {
        await send("/admin/auth/logout", {
          method: "POST",
          anonymous: true,
          timeoutMs: SESSION_CLEANUP_TIMEOUT_MS,
        });
      } catch {
        // Local sign-out already completed; the API may be unavailable.
      }
      return null;
    }
  });
  refreshing = result
    .then((session) => {
      if (
        !session ||
        version !== getSessionVersion() ||
        isSessionRestoreBlocked()
      )
        return null;
      rememberAccessToken(session.access_token, session.user);
      return session;
    })
    .catch(() => {
      if (version === getSessionVersion()) endUnrestorableSession();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  options.signal?.throwIfAborted();
  if (!options.anonymous && accessTokenExpiresSoon()) {
    if (!(await restoreBrowserSession()))
      throw new ApiError(NETWORK_COPY.SESSION_ENDED, 401);
  }
  options.signal?.throwIfAborted();
  const version = getSessionVersion();
  try {
    return await send<T>(
      path,
      options,
      options.anonymous ? null : getAccessToken(),
    );
  } catch (error) {
    if (
      !options.anonymous &&
      error instanceof ApiError &&
      error.status === 401
    ) {
      if (version !== getSessionVersion()) throw error;
      const session = await restoreBrowserSession();
      if (session) {
        options.signal?.throwIfAborted();
        try {
          return await send<T>(path, options, session.access_token);
        } catch (retryError) {
          if (
            retryError instanceof ApiError &&
            (retryError.status === 401 ||
              retryError.code === "ADMIN_ACCESS_DENIED" ||
              retryError.code === "USER_INACTIVE")
          )
            clearSession(true);
          throw retryError;
        }
      }
    }
    if (
      error instanceof ApiError &&
      (error.code === "ADMIN_ACCESS_DENIED" || error.code === "USER_INACTIVE")
    )
      clearSession(true);
    throw error;
  }
}
export const safeMessage = (error: unknown) =>
  error instanceof Error ? error.message : NETWORK_COPY.UNKNOWN_ERROR;

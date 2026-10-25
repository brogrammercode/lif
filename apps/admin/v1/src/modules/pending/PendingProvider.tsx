import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "../../lib/api-client";
type Counts = {
  total: number;
  sections: Record<string, number>;
  tabs: Record<string, number>;
  queues: Record<string, number>;
  entities: {
    users: Record<string, { vehicle_verification: number }>;
    applications: Record<string, { fields: number; confirmations: number }>;
  };
};
type Scope = { users?: string[]; applications?: string[] };
type State = {
  data: Counts | null;
  stale: boolean;
  register: (key: string, scope: Scope | null) => void;
};
const Context = createContext<State | null>(null);
function decode(value: unknown): Counts {
  const v = value as Counts;
  const numbers = (r: unknown) =>
    r &&
    typeof r === "object" &&
    !Array.isArray(r) &&
    Object.values(r).every((x) => Number.isSafeInteger(x) && Number(x) >= 0);
  if (
    !v ||
    !numbers(v.sections) ||
    !numbers(v.tabs) ||
    !numbers(v.queues) ||
    !Number.isSafeInteger(v.total) ||
    v.total < 0 ||
    !v.entities ||
    !v.entities.users ||
    !v.entities.applications ||
    !Object.values(v.entities.users).every(numbers) ||
    !Object.values(v.entities.applications).every(numbers)
  )
    throw new Error("Pending counts unavailable");
  return v;
}
export function PendingProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Counts | null>(null),
    [stale, setStale] = useState(false);
  const [scopes, setScopes] = useState<Record<string, Scope>>({});
  const register = useCallback(
    (key: string, scope: Scope | null) =>
      setScopes((current) => {
        const next = { ...current };
        if (scope) next[key] = scope;
        else delete next[key];
        return next;
      }),
    [],
  );
  const query = useMemo(() => {
    const all = Object.values(scopes);
    const users = [...new Set(all.flatMap((s) => s.users ?? []))]
      .sort()
      .slice(0, 50);
    const apps = [...new Set(all.flatMap((s) => s.applications ?? []))]
      .sort()
      .slice(0, 50 - users.length);
    return new URLSearchParams({
      user_ids: users.join(","),
      application_ids: apps.join(","),
    }).toString();
  }, [scopes]);
  const version = useRef(0);
  useEffect(() => {
    let active = true,
      inFlight = false,
      queued = false;
    const controller = new AbortController();
    const requestVersion = ++version.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function refresh() {
      if (!active || document.hidden) return;
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      try {
        const next = decode(
          await apiRequest<unknown>("/admin/pending-counts?" + query, {
            signal: controller.signal,
          }),
        );
        if (active && version.current === requestVersion) {
          setData(next);
          setStale(false);
        }
      } catch {
        if (active && !controller.signal.aborted) setStale(true);
      } finally {
        inFlight = false;
        if (queued && active) {
          queued = false;
          schedule();
        }
      }
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 250);
    }
    schedule();
    const interval = setInterval(() => void refresh(), 60000);
    window.addEventListener("admin:mutation", schedule);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("admin:mutation", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [query]);
  return (
    <Context.Provider value={{ data, stale, register }}>
      {children}
    </Context.Provider>
  );
}
export function usePending() {
  return useContext(Context);
}
export function usePendingEntities(
  type: "users" | "applications",
  ids: string[],
) {
  const pending = usePending();
  const register = pending?.register;
  const id = useId();
  const key = [...new Set(ids)].sort().join(",");
  useEffect(() => {
    if (!register) return;
    register(id, { [type]: key ? key.split(",") : [] });
    return () => register(id, null);
  }, [id, key, type, register]);
}
export function PendingBadge({
  count,
  label = "pending",
}: {
  count: number | undefined;
  label?: string;
}) {
  const pending = usePending();
  if (count == null || count === 0) return null;
  return (
    <span
      className={"pending-badge" + (pending?.stale ? " is-stale" : "")}
      title={`${count} ${label}${pending?.stale ? " (last known count; refresh pending)" : ""}`}
      aria-label={`${count} ${label}${pending?.stale ? ", last known count" : ""}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

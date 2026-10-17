import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, safeMessage } from "./api-client";
export type Paged<T> = {
  rows: T[];
  total: number;
  page: number;
  page_size: number;
};
export function useAdminResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiRequest<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(safeMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return { data, loading, error, refresh, setData };
}
export function useDebouncedText(value: string) {
  const [text, setText] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setText(value.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [value]);
  return text;
}
export function useAdminSave() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function run(
    action: (signal: AbortSignal) => Promise<unknown>,
    saved: () => void,
  ) {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    try {
      await action(controller.signal);
      if (!controller.signal.aborted) saved();
    } catch (cause) {
      if (!controller.signal.aborted) setError(safeMessage(cause));
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return { busy, error, run };
}

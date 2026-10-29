import { useEffect, useRef } from "react";

// Keep live directories current without overlapping slow reads or polling a
// hidden tab. Manual refresh remains available independently of this timer.
export function useVisibleRefresh(
  refresh: () => void,
  busy: boolean,
  enabled = true,
) {
  const pending = useRef(busy);
  const lastAttempt = useRef(Date.now());
  pending.current = busy;
  useEffect(() => {
    if (!busy) lastAttempt.current = Date.now();
  }, [busy]);
  useEffect(() => {
    if (!enabled) return;
    lastAttempt.current = Date.now();
    const update = () => {
      if (
        document.hidden ||
        pending.current ||
        Date.now() - lastAttempt.current < 15000
      )
        return;
      lastAttempt.current = Date.now();
      refresh();
    };
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh, enabled]);
}

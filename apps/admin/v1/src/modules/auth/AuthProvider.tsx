import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { restoreBrowserSession, safeMessage } from "../../lib/api-client";
import { SESSION_ENDED, SESSION_UPDATED } from "../../lib/session";
import type { AdminUser } from "../../types/domain";

type AuthState = {
  user: AdminUser | null;
  ready: boolean;
  error: string | null;
  retry: () => void;
  setUser: (user: AdminUser) => void;
};
const AuthContext = createContext<AuthState | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const authenticated = useCallback((value: AdminUser) => {
    requestVersion.current++;
    setUser(value);
    setError(null);
    setReady(true);
  }, []);
  const restore = useCallback(async () => {
    const version = ++requestVersion.current;
    setError(null);
    setReady(false);
    try {
      const session = await restoreBrowserSession();
      if (version === requestVersion.current) setUser(session?.user ?? null);
    } catch (cause) {
      if (version === requestVersion.current) setError(safeMessage(cause));
    } finally {
      if (version === requestVersion.current) setReady(true);
    }
  }, []);
  useEffect(() => {
    void restore();
    const ended = () => {
      requestVersion.current++;
      setUser(null);
      setError(null);
      setReady(true);
    };
    const updated = (event: Event) =>
      authenticated((event as CustomEvent<AdminUser>).detail);
    window.addEventListener(SESSION_ENDED, ended);
    window.addEventListener(SESSION_UPDATED, updated);
    return () => {
      requestVersion.current++;
      window.removeEventListener(SESSION_ENDED, ended);
      window.removeEventListener(SESSION_UPDATED, updated);
    };
  }, [restore, authenticated]);
  return (
    <AuthContext.Provider
      value={{
        user,
        ready,
        error,
        retry: () => void restore(),
        setUser: authenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required");
  return context;
}

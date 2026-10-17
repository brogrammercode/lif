import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { safeMessage } from "../../lib/api-client";
import { getUsers } from "./users.api";
import type { UserList, UserSummary } from "./users.type";

type DirectoryState = {
  result: UserList | null;
  loading: boolean;
  error: string | null;
  query: string;
  search: (query: string) => void;
  setPage: (page: number) => void;
  reload: () => void;
  updateUser: (user: UserSummary) => void;
};
const UsersContext = createContext<DirectoryState | null>(null);

export function UsersProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  const [result, setResult] = useState<UserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!active) return;
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setResult(null);
    const timer = window.setTimeout(() => {
      void getUsers(query.trim(), page, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setResult(value);
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setError(safeMessage(cause));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, query, page, revision]);
  const updateUser = useCallback((user: UserSummary) => {
    setResult((current) =>
      current
        ? {
            ...current,
            users: current.users.map((item) =>
              item.id === user.id ? user : item,
            ),
          }
        : current,
    );
  }, []);
  return (
    <UsersContext.Provider
      value={{
        result,
        loading,
        error,
        query,
        search: (value) => {
          setQuery(value);
          setPage(1);
        },
        setPage,
        reload: () => setRevision((value) => value + 1),
        updateUser,
      }}
    >
      {children}
    </UsersContext.Provider>
  );
}
export function useUsers() {
  const context = useContext(UsersContext);
  if (!context) throw new Error("UsersProvider is required");
  return context;
}

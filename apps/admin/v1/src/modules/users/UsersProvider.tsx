import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { safeMessage } from "../../lib/api-client";
import { getUsers, getUser } from "./users.api";
import { useMatch, useSearchParams } from "react-router-dom";
import type { UserList, UserSummary } from "./users.type";

type DirectoryState = {
  selectedUser: UserSummary | null;
  selectedLoading: boolean;
  selectedError: string | null;
  result: UserList | null;
  loading: boolean;
  error: string | null;
  query: string;
  accountType: string;
  filter: (value: string) => void;
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
  const [params] = useSearchParams();
  const pendingOnly = params.get("pending_only") === "true";
  const [result, setResult] = useState<UserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [accountType, setAccountType] = useState("all");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setPage(1);
    if (pendingOnly) {
      setAccountType("all");
      setQuery("");
    }
  }, [pendingOnly]);
  const selectedId = useMatch("/users/:userId/*")?.params.userId;
  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<
    string | undefined
  >();
  useEffect(() => {
    setSelectedRequestId(selectedId);
    setSelectedUser(null);
    setSelectedError(null);
    if (!active || !selectedId) {
      setSelectedLoading(false);
      return;
    }
    const controller = new AbortController();
    setSelectedLoading(true);
    void getUser(selectedId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setSelectedUser(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setSelectedError(safeMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSelectedLoading(false);
      });
    return () => controller.abort();
  }, [active, selectedId, revision]);
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
      void getUsers(
        query.trim(),
        page,
        controller.signal,
        accountType,
        pendingOnly,
      )
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
  }, [active, query, page, revision, accountType, pendingOnly]);
  const updateUser = useCallback((user: UserSummary) => {
    setSelectedUser((current) => (current?.id === user.id ? user : current));
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
        selectedUser: selectedUser?.id === selectedId ? selectedUser : null,
        selectedLoading:
          Boolean(selectedId) &&
          (selectedRequestId !== selectedId || selectedLoading),
        selectedError: selectedRequestId === selectedId ? selectedError : null,
        result,
        loading,
        error,
        query,
        accountType,
        filter: (value) => {
          setAccountType(value);
          setPage(1);
        },
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

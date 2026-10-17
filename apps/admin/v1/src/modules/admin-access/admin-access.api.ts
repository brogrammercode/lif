import { apiRequest } from "../../lib/api-client";
import { ACCESS_PAGE_SIZE, ADMIN_ACCESS_API } from "./admin-access.constant";
import type {
  AccessList,
  AccessPerson,
  AccessStatus,
} from "./admin-access.type";

export const getAccess = (
  query: string,
  status: AccessStatus,
  page: number,
  signal: AbortSignal,
) => {
  const params = new URLSearchParams({
    query,
    status,
    page: String(page),
    page_size: String(ACCESS_PAGE_SIZE),
  });
  return apiRequest<AccessList>(`${ADMIN_ACCESS_API}?${params}`, { signal });
};
export const grantAccess = (email: string, signal: AbortSignal) =>
  apiRequest<{ changed: boolean; admin: AccessPerson }>(ADMIN_ACCESS_API, {
    method: "POST",
    data: { email },
    signal,
    timeoutMs: 45_000,
  });
export const revokeAccess = (admin: AccessPerson, signal: AbortSignal) =>
  apiRequest<{ changed: boolean; id: string; role: string | null }>(
    `${ADMIN_ACCESS_API}/${encodeURIComponent(admin.id)}`,
    {
      method: "DELETE",
      data: { expected_access_version: admin.access_version },
      signal,
      timeoutMs: 45_000,
    },
  );

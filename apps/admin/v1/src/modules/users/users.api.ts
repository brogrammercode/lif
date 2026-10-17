import { apiRequest } from "../../lib/api-client";
import { USERS_API, USERS_PAGE_SIZE } from "./users.constant";
import type { PersonalInput, UserDetails, UserList } from "./users.type";
import { IMAGE_SAVE_TIMEOUT_MS } from "../../lib/network.constant";

export const getUsers = (query: string, page: number, signal: AbortSignal) => {
  const params = new URLSearchParams({
    query,
    page: String(page),
    page_size: String(USERS_PAGE_SIZE),
  });
  return apiRequest<UserList>(`${USERS_API}?${params}`, { signal });
};
export const getUser = (id: string, signal: AbortSignal) =>
  apiRequest<UserDetails>(`${USERS_API}/${encodeURIComponent(id)}`, { signal });
export const savePersonal = (
  user: UserDetails,
  data: PersonalInput,
  signal: AbortSignal,
) =>
  apiRequest<UserDetails>(`${USERS_API}/${encodeURIComponent(user.id)}`, {
    method: "PATCH",
    data: { ...data, expected_updated_at: user.updated_at },
    signal,
    timeoutMs: data.image_upload ? IMAGE_SAVE_TIMEOUT_MS : undefined,
  });

export const USERS_PATH = "/users";
export const USERS_API = "/admin/users";
export const USERS_PAGE_SIZE = 20;
export const personalPath = (id: string) =>
  `${USERS_PATH}/${encodeURIComponent(id)}/personal`;

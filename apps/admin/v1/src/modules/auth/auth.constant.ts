export const AUTH_PATHS = {
  GOOGLE: "/admin/auth/google",
  ME: "/admin/auth/me",
  LOGOUT: "/admin/auth/logout",
} as const;
export const WORKSPACE_PATH = "/app/user/vehicle-categories";
export const AUTH_COPY = {
  TITLE: "A smoother ride.\nBehind the scenes.",
  DESCRIPTION:
    "One place to shape the 1More Admin experience. Bring your categories, drivers, and riders together.",
  SIGN_IN_TITLE: "Welcome to 1More Admin",
  SIGN_IN_DESCRIPTION:
    "Sign in with your approved Google account to manage your workspace.",
  GOOGLE_UNAVAILABLE:
    "Google sign-in is unavailable. Check the web client ID and your connection, then retry.",
  ACCESS_NOTE:
    "This workspace is for approved administrators. Access is verified on every request.",
} as const;

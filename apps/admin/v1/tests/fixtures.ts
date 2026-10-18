import { test as base } from "@playwright/test";
export { expect } from "@playwright/test";

export const test = base.extend({
  context: async ({ context }, use) => {
    // Keep workspace checks independent of external font delivery.
    await context.route("https://fonts.googleapis.com/**", (route) =>
      route.fulfill({ contentType: "text/css", body: "" }),
    );
    await context.route("https://fonts.gstatic.com/**", (route) =>
      route.abort(),
    );
    // Individual page mocks take priority over this default cleanup response.
    await context.route("**/api/v2/admin/auth/logout", (route) =>
      route.fulfill({
        json: { status: "success", data: null, message: "Signed out" },
      }),
    );
    await use(context);
  },
});

import { test as base } from "@playwright/test";
import type { Page, Locator } from "@playwright/test";
export { expect } from "@playwright/test";

// Open the actual entity menu before selecting or inspecting an action.
export async function entityAction(
  scope: Page | Locator,
  name: string | RegExp,
  exact = true,
) {
  const item = scope.getByRole("menuitem", {
    name,
    exact,
    includeHidden: true,
  });
  const id = await item.locator("..").getAttribute("id");
  const trigger = scope.locator(`button[aria-controls="${id}"]`);
  if (
    !(await item
      .locator("..")
      .evaluate((node) => node.matches(":popover-open")))
  )
    await trigger.click();
  return item;
}

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

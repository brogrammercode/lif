import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { VehicleCategory } from "../src/types/domain";

const path = "/app/user/vehicle-categories";
const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;
const user = {
  id: "test-admin",
  role: "ADMIN",
  first_name: "Test",
  last_name: "Admin",
  email: "admin@example.test",
  avatar_url: null,
};
function category(
  id: string,
  name: string,
  parent?: VehicleCategory,
): VehicleCategory {
  return {
    id,
    code: id,
    name,
    description: "Comfortable everyday journeys.",
    image_url: null,
    parent_id: parent?.id ?? null,
    parent_name: parent?.name ?? null,
    vehicle_type: "SEDAN",
    capacity: 4,
    base_fare: 80,
    per_kilometer: 18,
    per_minute: 3,
    is_active: true,
    effective_active: true,
    is_selectable: true,
    sort_order: 0,
    created_at: "2026-10-16T10:00:00.000Z",
    updated_at: "2026-10-16T10:00:00.000Z",
    _count: { children: 0, vehicles: 0 },
  };
}
async function mockWorkspace(page: Page, options: { empty?: boolean } = {}) {
  let records: VehicleCategory[] = options.empty
    ? []
    : [
        category("sedan", "Sedan"),
        { ...category("bike", "Bike"), vehicle_type: "BIKE", capacity: 1 },
      ];
  let expire = false;
  let refreshes = 0;
  await page.route("**/api/v2/**", async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    const respond = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        json: {
          status: status < 400 ? "success" : "error",
          data,
          message: status < 400 ? "Saved" : "Access token expired",
        },
      });
    if (endpoint.endsWith("/auth/refresh")) {
      refreshes++;
      return respond({ access_token: token, user });
    }
    if (endpoint.endsWith("/auth/logout")) return respond(null);
    if (endpoint.includes("/vehicle-categories")) {
      if (expire) {
        expire = false;
        return respond(null, 401);
      }
      if (request.method() === "GET") return respond(records);
      const body = request.postDataJSON();
      if (request.method() === "POST") {
        const parent = records.find((record) => record.id === body.parent_id);
        const created = {
          ...category(`new-${records.length}`, body.name, parent),
          ...body,
        };
        if (parent) {
          parent._count.children++;
          parent.is_selectable = false;
        }
        records.push(created);
        return respond(created, 201);
      }
      if (request.method() === "PATCH") {
        const id = endpoint.split("/").at(-1);
        records = records.map((record) =>
          record.id === id
            ? { ...record, ...body, effective_active: body.is_active }
            : record,
        );
        return respond(records.find((record) => record.id === id));
      }
    }
    return respond(null, 404);
  });
  return {
    refreshes: () => refreshes,
    expireNext: () => {
      expire = true;
    },
  };
}

test("navigation, category creation, subcategory creation, search, editing and modal keyboard behavior", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.goto(path);
  await expect(
    page.getByRole("heading", { name: "Vehicle categories", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "App" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("City rides");
  await page
    .getByLabel("Vehicle family", { exact: true })
    .selectOption("SEDAN");
  await page.getByLabel("Passenger seats", { exact: true }).fill("4");
  await page.getByLabel("Base fare", { exact: true }).fill("95.50");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(
    page.getByRole("button", { name: "Edit City rides" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add subcategory under City rides" })
    .click();
  await expect(page.getByLabel("Parent category", { exact: true })).toHaveValue(
    "new-2",
  );
  await page.getByLabel("Category name", { exact: true }).fill("Comfort ride");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(
    page.getByRole("button", { name: "Edit Comfort ride", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search categories").fill("Comfort ride");
  await expect(
    page.getByRole("button", { name: "Edit Sedan", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit Comfort ride", exact: true })
    .click();
  await page.getByRole("switch", { name: "Enable category" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("table").getByText("Disabled", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filter category status").selectOption("enabled");
  await expect(page.getByText("No matching categories")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: "Edit Sedan", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
});

test("expired access token refreshes and retries without browser token storage", async ({
  page,
}) => {
  const workspace = await mockWorkspace(page);
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Edit Sedan", exact: true }),
  ).toBeVisible();
  workspace.expireNext();
  await page.getByRole("button", { name: "Refresh categories" }).click();
  await expect.poll(workspace.refreshes).toBe(2);
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
});

test("unauthenticated direct route returns to login", async ({ page }) => {
  await page.route("**/api/v2/admin/auth/refresh", (route) =>
    route.fulfill({
      status: 401,
      json: { status: "error", message: "Session ended" },
    }),
  );
  await page.goto(path);
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to 1More Admin" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add category", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: ".artifacts/admin-login.png", fullPage: true });
});

test("Google denial can be retried, successful login opens the workspace, and logout clears the session", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let callback: (response: { credential?: string }) => void;
    window.google = {
      accounts: {
        id: {
          initialize: (options) => {
            callback = options.callback;
          },
          renderButton: (element) => {
            const button = document.createElement("button");
            button.textContent = "Continue with Google";
            button.onclick = () =>
              callback({ credential: "test-only-identity" });
            element.replaceChildren(button);
          },
          disableAutoSelect: () => undefined,
        },
      },
    };
  });
  let attempts = 0;
  await page.route("**/api/v2/**", (route) => {
    const endpoint = new URL(route.request().url()).pathname;
    if (endpoint.endsWith("/auth/google")) {
      attempts++;
      return route.fulfill(
        attempts === 1
          ? {
              status: 403,
              json: {
                status: "error",
                error_code: "ADMIN_ACCESS_DENIED",
                message: "This account does not have admin access.",
              },
            }
          : {
              json: { status: "success", data: { access_token: token, user } },
            },
      );
    }
    if (endpoint.endsWith("/auth/refresh"))
      return route.fulfill({
        status: 401,
        json: { status: "error", message: "No session" },
      });
    return route.fulfill({
      json: {
        status: "success",
        data: endpoint.endsWith("/vehicle-categories")
          ? [category("sedan", "Sedan")]
          : null,
      },
    });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "does not have admin access",
  );
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
});

test("desktop and mobile workspace remain bounded, including editor dialog", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Edit Sedan", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".artifacts/admin-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.screenshot({
    path: ".artifacts/admin-editor.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".artifacts/admin-mobile.png",
    fullPage: true,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  const dialog = await page.getByRole("dialog").boundingBox();
  expect(dialog?.width).toBeLessThan(390);
  await page.keyboard.press("Escape");
});

test("catalog requests retain their timeout when cancellation is enabled", async ({
  page,
}) => {
  await page.clock.install();
  await mockWorkspace(page);
  let pending = false;
  await page.route("**/api/v2/admin/vehicle-categories", () => {
    pending = true;
  });
  await page.goto(path);
  await expect.poll(() => pending).toBe(true);
  await page.clock.fastForward(25_100);
  await expect(page.getByRole("alert")).toContainText("too long to respond");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
});

test("a second unauthorized response ends the session after one retry", async ({
  page,
}) => {
  await mockWorkspace(page);
  let calls = 0;
  await page.route("**/api/v2/admin/vehicle-categories", (route) => {
    calls++;
    return route.fulfill({
      status: 401,
      json: { status: "error", message: "Session revoked" },
    });
  });
  await page.goto(path);
  await expect(page).toHaveURL(/\/login$/);
  expect(calls).toBeGreaterThanOrEqual(2);
  expect(calls).toBeLessThanOrEqual(3);
});

test("signing out updates other open tabs without storing credentials", async ({
  page,
  context,
}) => {
  await mockWorkspace(page);
  const other = await context.newPage();
  await mockWorkspace(other);
  await page.goto(path);
  await other.goto(path);
  await expect(
    other.getByRole("button", { name: "Edit Sedan", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(other).toHaveURL(/\/login$/);
  expect(
    await other.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
});

test("successful saves keep hierarchy consistent if the follow-up refresh fails", async ({
  page,
}) => {
  await mockWorkspace(page);
  let saved = false;
  await page.route("**/api/v2/admin/vehicle-categories", (route) => {
    if (route.request().method() === "POST") saved = true;
    if (saved && route.request().method() === "GET")
      return route.fulfill({ status: 503, json: { status: "error" } });
    return route.fallback();
  });
  await page.goto(path);
  await page
    .getByRole("button", { name: "Add subcategory under Sedan" })
    .click();
  await page.getByLabel("Category name", { exact: true }).fill("Comfort");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit Comfort", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 subcategory.*Group/)).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("could not complete");
});

test("rapid form submissions create a category once", async ({ page }) => {
  await mockWorkspace(page);
  let posts = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v2/admin/vehicle-categories", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      await gate;
    }
    return route.fallback();
  });
  await page.goto(path);
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page
    .getByLabel("Category name", { exact: true })
    .fill("Single creation");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect.poll(() => posts).toBe(1);
  await page.locator("form.editor-form").evaluate((form) => {
    form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(posts).toBe(1);
});

test("conflicting edits offer a deliberate reload of server state", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route("**/api/v2/admin/vehicle-categories/sedan", (route) =>
    route.fulfill({
      status: 409,
      json: {
        status: "error",
        error_code: "CATEGORY_CONFLICT",
        message: "Another admin changed this category. Refresh and try again.",
      },
    }),
  );
  await page.goto(path);
  await page.getByRole("button", { name: "Edit Sedan", exact: true }).click();
  await page
    .getByLabel("Category name", { exact: true })
    .fill("My pending edit");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Another admin");
  await expect(page.getByLabel("Category name", { exact: true })).toHaveValue(
    "My pending edit",
  );
  await page.getByRole("button", { name: "Reload latest category" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Edit Sedan", exact: true }).click();
  await expect(page.getByLabel("Category name", { exact: true })).toHaveValue(
    "Sedan",
  );
});

test("logout waits for an in-flight refresh and remains signed out", async ({
  page,
}) => {
  const workspace = await mockWorkspace(page);
  let refreshes = 0;
  let logouts = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v2/admin/auth/refresh", async (route) => {
    refreshes++;
    if (refreshes > 1) await gate;
    return route.fallback();
  });
  await page.route("**/api/v2/admin/auth/logout", (route) => {
    logouts++;
    return route.fallback();
  });
  await page.goto(path);
  await expect(
    page.getByRole("button", { name: "Edit Sedan", exact: true }),
  ).toBeVisible();
  workspace.expireNext();
  await page.getByRole("button", { name: "Refresh categories" }).click();
  await expect.poll(() => refreshes).toBe(2);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  expect(logouts).toBe(0);
  release();
  await expect(page).toHaveURL(/\/login$/);
  expect(logouts).toBe(1);
  await expect(
    page.getByRole("button", { name: "Add category", exact: true }),
  ).toHaveCount(0);
});

test("malformed response envelopes produce a recoverable error", async ({
  page,
}) => {
  await mockWorkspace(page);
  await page.route("**/api/v2/admin/vehicle-categories", (route) =>
    route.fulfill({ json: null }),
  );
  await page.goto(path);
  await expect(page.getByRole("alert")).toContainText("unexpected response");
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
});

test("invalid catalog records cannot crash the workspace", async ({ page }) => {
  await mockWorkspace(page);
  await page.route("**/api/v2/admin/vehicle-categories", (route) =>
    route.fulfill({ json: { status: "success", data: [{ id: "broken" }] } }),
  );
  await page.goto(path);
  await expect(page.getByRole("alert")).toContainText("unexpected response");
  await expect(
    page.getByRole("heading", { name: "Vehicle categories", exact: true }),
  ).toBeVisible();
});

test("invalid session data never grants access to the workspace", async ({
  page,
}) => {
  await page.route("**/api/v2/admin/auth/refresh", (route) =>
    route.fulfill({
      json: {
        status: "success",
        data: { access_token: token, user: { ...user, role: "RIDER" } },
      },
    }),
  );
  await page.goto(path);
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome to 1More Admin" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add category", exact: true }),
  ).toHaveCount(0);
});

test("an inactive account ends the browser session", async ({ page }) => {
  await mockWorkspace(page);
  await page.route("**/api/v2/admin/vehicle-categories", (route) =>
    route.fulfill({
      status: 403,
      json: {
        status: "error",
        error_code: "USER_INACTIVE",
        message: "This account is suspended",
      },
    }),
  );
  await page.goto(path);
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("button", { name: "Add category", exact: true }),
  ).toHaveCount(0);
});

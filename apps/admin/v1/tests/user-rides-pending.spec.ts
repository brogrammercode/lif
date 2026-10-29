import { entityAction } from "./fixtures";
import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
const admin = {
  id: "admin",
  role: "ADMIN",
  first_name: "Workspace",
  last_name: "Admin",
  email: "admin@example.test",
  avatar_url: null,
};
const token =
  "e30." +
  Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".fixture";
const account = (id: string) => ({
  id,
  first_name: id === "driver" ? "Amit" : "Riya",
  last_name: "Sharma",
  role: id === "driver" ? "DRIVER" : "RIDER",
  partner_activated_at: null,
  email: `${id}@example.test`,
  avatar_url: null,
  status: "ACTIVE",
  phone_e164: "+919999999999",
  created_at: "2026-10-25T06:00:00Z",
  updated_at: "2026-10-25T06:00:00Z",
  last_login_at: null,
  last_admin_login_at: null,
  last_known_latitude: null,
  last_known_longitude: null,
});
async function workspace(page: Page) {
  await page.route("https://vehicle.test/missing-model.svg", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  let invalidRide = false;
  let registrationFailed = true;
  let emailRetries = 0;
  const pendingCalls: string[] = [],
    ridesCalls: string[] = [];
  await page.route("**/api/v2/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const send = (data: unknown) =>
      route.fulfill({ json: { status: "success", data } });
    if (path.endsWith("/auth/refresh"))
      return send({ user: admin, access_token: token });
    if (path.endsWith("/auth/me")) return send(admin);
    if (
      path.endsWith("/admin/partner-program/exit-requests") &&
      route.request().method() === "POST"
    )
      return send({ id: "exit-created" });
    if (
      [
        "/admin/vehicle-brands",
        "/admin/vehicle-models",
        "/admin/partner-program/exit-requests",
      ].some((suffix) => path.endsWith(suffix))
    )
      return send({ rows: [], total: 0, page: 1, page_size: 20 });
    if (path.endsWith("/registration-emails/mail/retry")) {
      emailRetries++;
      registrationFailed = false;
      return send({ queued: 1 });
    }
    if (path.endsWith("/registration-emails"))
      return send({
        smtp_configured: true,
        total: registrationFailed ? 1 : 0,
        page: 1,
        page_size: 20,
        items: registrationFailed
          ? [
              {
                id: "mail",
                recipient: "admin@example.test",
                status: "FAILED",
                attempts: 1,
                last_error:
                  "SMTP authentication failed. Check the sender configuration.",
                created_at: "2026-10-25T06:00:00Z",
                updated_at: "2026-10-25T06:00:00Z",
                sent_at: null,
                user: {
                  id: "rider",
                  name: "Riya Sharma",
                  email: "rider@example.test",
                },
              },
            ]
          : [],
      });
    if (path.endsWith("/pending-counts")) {
      pendingCalls.push(url.search);
      return send({
        total: 9,
        sections: {
          app: 3,
          users: 2,
          partner_program: 4,
          admin: 0,
          support: 0,
        },
        tabs: {
          vehicle_models: 2,
          ride_reviews: 1,
          vehicle_verification: 2,
          applications: 2,
          confirmations: 1,
          exit_requests: 1,
        },
        queues: {
          brands: 1,
          models: 1,
          email_failures: 0,
          activation_locked: 0,
        },
        entities: {
          users: { driver: { vehicle_verification: 2 } },
          applications: {},
        },
      });
    }
    if (path.endsWith("/admin/users"))
      return send({
        users: [account("rider"), account("driver")],
        total: 2,
        page: 1,
        page_size: 20,
      });
    if (path.endsWith("/rides")) {
      ridesCalls.push(path);
      const id = path.includes("/driver/") ? "driver" : "rider";
      return send({
        user: account(id),
        role: id === "driver" ? "driver" : "rider",
        total: 1,
        page: 1,
        page_size: 20,
        items: [
          {
            id: "ride-reference",
            status: "COMPLETED",
            created_at: "2026-10-25T06:00:00Z",
            requested_at: "2026-10-25T06:00:00Z",
            matched_at: null,
            arrived_at: null,
            started_at: null,
            completed_at: "2026-10-25T06:30:00Z",
            cancelled_at: null,
            cancel_reason: null,
            pickup_address: "Railway Station",
            dropoff_address: "University",
            estimated_distance_m: 5000,
            actual_distance_m: 5200,
            estimated_fare: "80",
            final_fare: "85",
            currency: invalidRide ? { invalid: true } : "INR",
            rider: account("rider"),
            driver: { user: account("driver") },
            vehicle: {
              type: "SCOOTER",
              make: "TVS",
              model: "Jupiter",
              plate_number: "BR01AA1234",
              vehicle_category: { name: "Scooter" },
              catalog_model: {
                logo_url: "https://vehicle.test/missing-model.svg",
              },
              brand: { logo_url: "/logo.png" },
            },
            payment: { status: "PAID", collection_method: "CASH" },
          },
        ],
      });
    }
    if (path.endsWith("/vehicle-verification"))
      return send({ user: account("driver"), vehicles: [] });
    if (/\/admin\/users\/(rider|driver)$/.test(path))
      return send(account(path.split("/").at(-1)!));
    return send(null);
  });
  return {
    pendingCalls,
    ridesCalls,
    emailRetries: () => emailRetries,
    setInvalidRide: (value: boolean) => {
      invalidRide = value;
    },
  };
}
test("user rides show named participants and payment details; vehicle verification is driver-only even on a direct link", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = await workspace(page);
  await page.goto("/users/rider/rides");
  await expect(
    page.getByRole("heading", { name: "Rides", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "User details" })
      .getByRole("link", { name: "Vehicle Verification" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Amit Sharma", { exact: true }).last(),
  ).toBeVisible();
  await (await entityAction(page, "View ride")).click();
  await expect(
    page.getByRole("dialog").getByText("Paid · Cash", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: "Riya Sharma" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.goto("/users/rider/vehicle-verification");
  await expect(page).toHaveURL(/\/users\/rider\/personal$/);
  await page.goto("/users/driver/rides");
  await expect(
    page.getByText("Rides assigned to Amit Sharma.", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "User details" })
      .getByRole("link", { name: /Vehicle Verification/ }),
  ).toBeVisible();
  expect(state.ridesCalls).toContain("/api/v2/admin/users/driver/rides");
  expect(errors).toEqual([]);
});
test("pending badges share a bounded request and consistent navigation at narrow and desktop widths", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/users/driver/rides");
  await expect(
    page
      .getByRole("navigation", { name: "User details" })
      .getByLabel("2 pending"),
  ).toBeVisible();
  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(primary.getByLabel("3 pending", { exact: true })).toBeVisible();
  await expect(primary.getByLabel("4 pending", { exact: true })).toBeVisible();
  expect(state.pendingCalls.length).toBeLessThanOrEqual(3);
  expect(
    state.pendingCalls.some((query) =>
      new URLSearchParams(query).get("user_ids")?.includes("driver"),
    ),
  ).toBe(true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const group of await primary
      .locator(".pending-nav-group.has-count")
      .all()) {
      const label = await group
        .locator(".primary-nav-item > span")
        .boundingBox();
      const badge = await group.locator(".pending-nav-count").boundingBox();
      expect(label).not.toBeNull();
      expect(badge).not.toBeNull();
      expect(
        label!.x + label!.width <= badge!.x ||
          badge!.y + badge!.height <= label!.y,
      ).toBe(true);
    }
    await (await entityAction(page, "View ride")).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveClass(/dialog-compact/);
    await expect(dialog.locator(".trip-vehicle img")).toHaveAttribute(
      "src",
      "/logo.png",
    );
    expect(
      await dialog
        .locator(".trip-vehicle .entity-avatar")
        .evaluate((el) => getComputedStyle(el).borderRadius),
    ).toBe("50%");
    const bounds = await dialog.boundingBox();
    expect(bounds!.height).toBeLessThan(700);
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(901);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `.artifacts/admin-ui/user-rides-${width}.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("registration email failures show account details and provide a retry through the common catalog UI", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto("/admin/access/registration-emails");
  await expect(
    page.getByRole("heading", { name: "Registration emails", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: "Riya Sharma", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "SMTP authentication failed. Check the sender configuration.",
      { exact: true },
    ),
  ).toBeVisible();
  await (await entityAction(page, "Retry email")).click();
  await expect(
    page.getByRole("heading", { name: "No email deliveries to review" }),
  ).toBeVisible();
  expect(state.emailRetries()).toBe(1);
});

test("unavailable vehicle logos fall back to the actual two-wheeler family instead of a car", async ({
  page,
}) => {
  await workspace(page);
  await page.route("**/logo.png", (route) => route.abort());
  await page.goto("/users/driver/rides");
  const vehicle = page.getByRole("main").locator(".vehicle-identity");
  await expect(vehicle.locator(".lucide-bike")).toBeVisible();
  await expect(vehicle.locator("img")).toHaveCount(0);
  await expect(vehicle).toContainText("TVS Jupiter");
  await expect(vehicle.locator(".badge")).toHaveText("Scooter");
});

test("normal navigation shows the full directory; separate badges open pending filters that survive account and tab selection", async ({
  page,
}) => {
  await workspace(page);
  await page.goto("/users/driver/rides");
  const primary = page.getByRole("navigation", { name: "Primary navigation" });
  await primary.getByRole("link", { name: "Users", exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await primary
    .getByRole("link", { name: "View 2 pending vehicle reviews", exact: true })
    .click();
  await expect(page).toHaveURL(/\/users\?pending_only=true$/);
  await page
    .getByRole("navigation", { name: "Users", exact: true })
    .getByRole("link", { name: /Amit Sharma/ })
    .click();
  await expect(page).toHaveURL(/\/users\/driver\/personal\?pending_only=true$/);
  await page
    .getByRole("navigation", { name: "User details" })
    .getByRole("link", { name: "Rides", exact: true })
    .click();
  await expect(page).toHaveURL(/\/users\/driver\/rides\?pending_only=true$/);
  await primary.getByRole("link", { name: "App", exact: true }).click();
  const tabs = page.getByRole("navigation", { name: "User settings" });
  await expect(
    tabs.getByRole("link", { name: "Vehicle Models", exact: true }),
  ).toHaveAttribute("href", "/app/user/vehicle-models");
  await expect(
    tabs.getByRole("link", {
      name: "View 2 pending catalog requests",
      exact: true,
    }),
  ).toHaveAttribute("href", "/app/user/vehicle-models?pending_only=true");
  expect(await page.locator("a a").count()).toBe(0);
});

test("malformed ride responses stay recoverable and changing account clears the prior ride reader", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const state = await workspace(page);
  state.setInvalidRide(true);
  await page.goto("/users/rider/rides");
  await expect(
    page.getByRole("heading", { name: "Could not load rides", exact: true }),
  ).toBeVisible();
  state.setInvalidRide(false);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await (await entityAction(page, "View ride")).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  // Use SPA navigation so the route component is reused instead of a new document.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Users", exact: true })
    .getByRole("link", { name: /Amit Sharma/ })
    .click();
  await expect(page).toHaveURL(/\/users\/driver\/rides$/);
  await expect(
    page.getByText("Rides assigned to Amit Sharma.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("leaving pending-only catalog and exit views restores the normal filters without a full reload", async ({
  page,
}) => {
  await workspace(page);
  await page.goto("/app/user/vehicle-models?pending_only=true");
  const tabs = page.getByRole("navigation", { name: "User settings" });
  const filters = page.getByRole("combobox");
  await expect(filters.nth(0)).toHaveValue("REQUESTED");
  await expect(filters.nth(1)).toHaveValue("REQUESTED");
  await tabs.getByRole("link", { name: "Vehicle Models", exact: true }).click();
  await expect(filters.nth(0)).toHaveValue("all");
  await expect(filters.nth(1)).toHaveValue("all");
  await tabs
    .getByRole("link", { name: "View 2 pending catalog requests", exact: true })
    .click();
  await expect(filters.nth(0)).toHaveValue("REQUESTED");
  await page.goto(
    "/partner-program/applications/exit-requests?pending_only=true",
  );
  await expect(page.getByRole("combobox", { name: "Exit status" })).toHaveValue(
    "PENDING",
  );
  await page
    .getByRole("navigation", { name: "Application settings" })
    .getByRole("link", { name: "Exit Request & Dues", exact: true })
    .click();
  await expect(page.getByRole("combobox", { name: "Exit status" })).toHaveValue(
    "all",
  );
  await page.goto(
    "/partner-program/applications/exit-requests?pending_only=true&application_id=activated",
  );
  const create = page.getByRole("dialog", {
    name: "Create driver exit request",
  });
  await expect(create.getByLabel("Application ID")).toHaveValue("activated");
  await create
    .getByLabel("Reason for exit")
    .fill("The driver requested a permanent exit.");
  await create
    .getByRole("button", { name: "Create request", exact: true })
    .click();
  await expect(page).toHaveURL(/pending_only=true&request_id=exit-created$/);
  expect(new URL(page.url()).searchParams.has("application_id")).toBe(false);
});

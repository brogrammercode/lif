import { expect, test } from "./fixtures";
const admin = {
  id: "admin",
  role: "ADMIN",
  first_name: "Test",
  last_name: "Admin",
  email: "admin@example.test",
  avatar_url: null,
};
const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
test("driver account keeps private fields masked, reveals on demand and handles stale reviews", async ({
  page,
}) => {
  let revealed = 0,
    writes = 0;
  await page.route("**/api/v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (data: unknown, status = 200, message = "Loaded") =>
      route.fulfill({
        status,
        json: { status: status < 400 ? "success" : "error", data, message },
      });
    if (path.endsWith("/auth/refresh"))
      return send({ user: admin, access_token: token });
    if (path.endsWith("/auth/me")) return send(admin);
    if (path.endsWith("/admin/users"))
      return send({
        users: [
          {
            id: "driver",
            first_name: "Test",
            last_name: "Driver",
            email: "driver@example.test",
            role: "DRIVER",
            status: "ACTIVE",
            avatar_url: null,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      });
    if (path.endsWith("/driver-account"))
      return send({
        driver: { availability: "SUSPENDED", verification_status: "VERIFIED" },
        application: { status: "ACTIVATED" },
        approved_payout: null,
        payout_changes: [
          {
            id: "change",
            status: "PENDING",
            version: 1,
            summary: {
              holder_name: "Test Driver",
              account_number: "****7890",
              upi: "***@upi",
              ifsc: "ABCD0123456",
            },
            rejection_reason: null,
            created_at: new Date().toISOString(),
          },
        ],
      });
    if (path.endsWith("/driver-finances"))
      return send({
        summary: {
          cash_received: "40",
          upi_received: "10",
          collection_pending: "50",
          platform_payout: "0",
        },
        rows: [],
        total: 0,
        page: 1,
        page_size: 20,
        from: "2026-10-01",
        to: "2026-10-24",
        as_of: new Date().toISOString(),
      });
    if (path.endsWith("/private")) {
      revealed++;
      return send({
        id: "change",
        details: {
          holder_name: "Test Driver",
          account_number: "001234567890",
          ifsc: "ABCD0123456",
        },
      });
    }
    if (path.endsWith("/payout-changes/change")) {
      writes++;
      return send(null, 409, "This request changed. Reload before reviewing.");
    }
    return send([]);
  });
  await page.goto("/users/driver/driver-account");
  await expect(
    page.getByRole("heading", { name: "Driver account", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("001234567890", { exact: true })).toHaveCount(0);
  expect(revealed).toBe(0);
  await page.getByRole("button", { name: "Reveal private details" }).click();
  await expect(page.getByText("001234567890", { exact: true })).toBeVisible();
  expect(revealed).toBe(1);
  await page.getByRole("button", { name: "Hide private details" }).click();
  await expect(page.getByText("001234567890", { exact: true })).toHaveCount(0);
  await page.getByLabel("Review note").fill("Verified account ownership");
  await page.getByRole("button", { name: "Approve destination" }).click();
  await expect(
    page.getByRole("button", { name: "Approve destination" }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "Refresh account" }).click();
  await expect(page.getByLabel("Review note")).toHaveValue("");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("invalid monetary totals stay recoverable and never render as received currency", async ({
  page,
}) => {
  let broken = true;
  await page.route("**/api/v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (data: unknown) =>
      route.fulfill({ json: { status: "success", data, message: "Loaded" } });
    if (path.endsWith("/auth/refresh"))
      return send({ user: admin, access_token: token });
    if (path.endsWith("/auth/me")) return send(admin);
    if (path.endsWith("/admin/users"))
      return send({ users: [], total: 0, page: 1, page_size: 20 });
    if (path.endsWith("/driver-account"))
      return send({
        driver: { availability: "OFFLINE", verification_status: "VERIFIED" },
        application: null,
        payout_changes: [],
        approved_payout: null,
      });
    if (path.endsWith("/driver-finances"))
      return send({
        summary: { cash_received: broken ? "not-an-amount" : "40" },
        rows: [],
        total: 0,
        page: 1,
        page_size: 20,
        from: "2026-10-01",
        to: "2026-10-24",
        as_of: new Date().toISOString(),
      });
    return send([]);
  });
  await page.goto("/users/driver/driver-account");
  await expect(
    page.getByRole("heading", { name: "Statement unavailable" }),
  ).toBeVisible();
  await expect(
    page.getByText("INR not-an-amount", { exact: true }),
  ).toHaveCount(0);
  broken = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("INR 40", { exact: true })).toBeVisible();
});

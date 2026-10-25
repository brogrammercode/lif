import { expect, test } from "./fixtures";
const admin = {
  id: "admin",
  role: "ADMIN",
  first_name: "Test",
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
const driver = {
  id: "driver",
  role: "DRIVER",
  status: "ACTIVE",
  first_name: "Test",
  last_name: "Driver",
  email: "driver@example.test",
  avatar_url: null,
  phone_e164: null,
  last_known_latitude: null,
  last_known_longitude: null,
  created_at: "2026-10-25T00:00:00Z",
  updated_at: "2026-10-25T00:00:00Z",
  last_login_at: null,
  last_admin_login_at: null,
};
for (const width of [1440, 390]) {
  test(
    "driver account is deferred and old links return to Personal at " +
      width +
      "px",
    async ({ page }) => {
      const accountRequests: string[] = [];
      await page.route("**/api/v2/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        const send = (data: unknown) =>
          route.fulfill({
            json: { status: "success", data, message: "Loaded" },
          });
        if (path.endsWith("/auth/refresh"))
          return send({ user: admin, access_token: token });
        if (path.endsWith("/auth/me")) return send(admin);
        if (path.endsWith("/admin/users"))
          return send({ users: [driver], total: 1, page: 1, page_size: 20 });
        if (path.endsWith("/admin/users/driver")) return send(driver);
        if (path.endsWith("/vehicle-verification"))
          return send({ user: driver, vehicles: [] });
        if (/driver-account|driver-finances|payout-changes/.test(path))
          accountRequests.push(path);
        return send(null);
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/users/driver/driver-account");
      await expect(page).toHaveURL(/\/users\/driver\/personal$/);
      await expect(
        page.getByRole("heading", { name: "Personal", exact: true }),
      ).toBeVisible();
      const tabs = page.getByRole("navigation", {
        name: "User details",
        exact: true,
      });
      await expect(tabs.getByRole("link")).toHaveText([
        "Personal",
        "Rides",
        "Vehicle Verification",
      ]);
      await expect(
        page.getByRole("link", { name: "Driver Account", exact: true }),
      ).toHaveCount(0);
      await tabs
        .getByRole("link", { name: "Vehicle Verification", exact: true })
        .click();
      await expect(
        page.getByRole("heading", {
          name: "No vehicles submitted",
          exact: true,
        }),
      ).toBeVisible();
      expect(accountRequests).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    },
  );
}

import { expect, test } from "./fixtures";

const admin = {
  id: "skeleton-admin",
  role: "ADMIN",
  first_name: "Test",
  last_name: "Admin",
  email: "admin@example.test",
  avatar_url: null,
};
const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;

for (const sample of [
  {
    route: "/app/user/vehicle-categories",
    variant: "workspace",
    endpoint: "/auth/refresh",
  },
  {
    route: "/app/user/fare-policy",
    variant: "form",
    endpoint: "/admin/fare-policy",
  },
  {
    route: "/support/configure/contact",
    variant: "form",
    endpoint: "/support/configuration/contact",
  },
  {
    route: "/admin/access/activity",
    variant: "table",
    endpoint: "/admin/activity",
  },
  {
    route: "/partner-program/requirements/policy",
    variant: "document",
    endpoint: "/documents/POLICY",
  },
]) {
  test(`${sample.variant} loading for ${sample.route} uses shared bounded skeletons`, async ({
    page,
  }) => {
    await page.route("**/api/v2/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith(sample.endpoint)) return;
      return route.fulfill({
        json: {
          status: "success",
          data: path.endsWith("/auth/refresh")
            ? { user: admin, access_token: token }
            : [],
          message: "Loaded",
        },
      });
    });
    await page.goto(sample.route);
    const placeholder = page.locator(
      `[data-loading-variant="${sample.variant}"]`,
    );
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toHaveAttribute("role", "status");
    await expect(placeholder).toHaveAttribute("aria-busy", "true");
    await expect(
      page.locator(".animate-spin, .lucide-loader-circle"),
    ).toHaveCount(0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (sample.variant !== "workspace") {
        const bounds = await placeholder.boundingBox();
        expect(bounds!.height).toBeLessThan(700);
      }
      await page.screenshot({
        path: `.artifacts/admin-ui/skeleton-${sample.variant}-${sample.route.includes("support") ? "support" : "page"}-${width}.png`,
        fullPage: true,
      });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    const duration = await placeholder
      .locator(".skeleton")
      .first()
      .evaluate((element) => getComputedStyle(element).animationDuration);
    expect(parseFloat(duration)).toBeLessThanOrEqual(0.001);
  });
}

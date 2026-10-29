import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const admin = {
  id: "admin",
  role: "ADMIN",
  first_name: "Test",
  last_name: "Admin",
  email: "admin@example.test",
  avatar_url: null,
};
const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
function activityPage(
  action = "View vehicle models",
  status: number | null = 200,
) {
  return {
    activities: [
      {
        id: "entry",
        request_id: "entry-request",
        action,
        method: "GET",
        path: "/api/v2/admin/vehicle-models",
        resource: "Vehicle catalog",
        status_code: status,
        started_at: "2026-10-29T10:00:00Z",
        completed_at: status === null ? null : "2026-10-29T10:00:01Z",
        actor: admin,
        ip_address: null,
      },
    ],
    total: 1,
    page: 1,
    page_size: 20,
    retention_days: 7,
  };
}
async function auditWorkspace(page: Page) {
  const queries: URLSearchParams[] = [];
  await page.route("**/api/v2/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (data: unknown) =>
      route.fulfill({ json: { status: "success", data, message: "Loaded" } });
    if (url.pathname.endsWith("/auth/refresh"))
      return send({ user: admin, access_token: token });
    if (url.pathname.endsWith("/auth/me")) return send(admin);
    if (url.pathname.endsWith("/admin/activity")) {
      queries.push(url.searchParams);
      const rows = [
        {
          id: "approval",
          action: "Approve partner application",
          method: "POST",
          path: "/api/v2/admin/partner-program/applications/application-123/approve",
          status_code: 200,
        },
        {
          id: "read",
          action: "View partner applications",
          method: "GET",
          path: "/api/v2/admin/partner-program/applications",
          status_code: 200,
        },
        {
          id: "failure",
          action: "Review partner confirmation",
          method: "POST",
          path: "/api/v2/admin/partner-program/applications/application-123/confirmation-review",
          status_code: 409,
        },
        {
          id: "interrupted",
          action: "Upload final partner PDF",
          method: "POST",
          path: "/api/v2/admin/partner-program/assets",
          status_code: 499,
        },
      ]
        .filter(
          (row) =>
            (url.searchParams.get("activity") !== "changes" ||
              row.method !== "GET") &&
            (url.searchParams.get("activity") !== "reads" ||
              row.method === "GET") &&
            (url.searchParams.get("outcome") !== "failure" ||
              row.status_code >= 400),
        )
        .map((row) => ({
          ...row,
          request_id: row.id + "-request",
          actor: admin,
          started_at: "2026-10-25T08:44:44Z",
          completed_at: "2026-10-25T08:44:45Z",
          ip_address: null,
        }));
      return send({
        activities: rows,
        total: rows.length,
        page: 1,
        page_size: 20,
        retention_days: 7,
      });
    }
    return send([]);
  });
  return queries;
}

test("audit log highlights approvals and offers changes, read and outcome filters", async ({
  page,
}) => {
  const queries = await auditWorkspace(page);
  await page.goto("/admin/access/activity");
  await expect(
    page.getByText("Approve partner application", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("View partner applications", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Audit entries expire after 7 days.", { exact: false }),
  ).toBeVisible();
  expect(queries.at(-1)!.get("activity")).toBe("all");
  const note = page.locator(".catalog-card .panel-note p");
  await expect(note).toHaveCSS("font-size", "12px");
  await page
    .getByLabel("Activity type", { exact: true })
    .selectOption("changes");
  await expect(
    page.getByText("View partner applications", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Activity type", { exact: true }).selectOption("reads");
  await expect(
    page.getByText("View partner applications", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Approve partner application", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Activity type", { exact: true }).selectOption("all");
  await expect(
    page.getByText("Approve partner application", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Activity outcome", { exact: true })
    .selectOption("failure");
  await expect(
    page.locator(".badge").filter({ hasText: "Failed" }),
  ).toContainText("409");
  await expect(
    page.getByText("Connection closed", { exact: false }),
  ).toContainText("499");
  await page
    .getByRole("textbox", {
      name: "Search action, administrator or request ID",
    })
    .fill("APPROVE_PARTNER_APPLICATION");
  await expect
    .poll(() => queries.at(-1)!.get("query"))
    .toBe("APPROVE_PARTNER_APPLICATION");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `.artifacts/admin-ui/audit-consistent-${width}.png`,
      fullPage: true,
    });
  }
});

test("audit activity refreshes while visible, keeps loaded rows and pauses in a hidden tab", async ({
  page,
}) => {
  await page.clock.install();
  await auditWorkspace(page);
  let calls = 0;
  let latest = false;
  await page.route("**/api/v2/admin/activity?**", (route) => {
    calls++;
    return route.fulfill({
      json: {
        status: "success",
        data: {
          activities: [
            {
              id: "recent",
              request_id: "recent-request",
              action: latest
                ? "View vehicle models"
                : "View partner applications",
              method: "GET",
              path: "/api/v2/admin/vehicle-models",
              resource: "Vehicle catalog",
              status_code: 200,
              started_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              actor: admin,
              ip_address: null,
            },
          ],
          total: 1,
          page: 1,
          page_size: 20,
          retention_days: 7,
        },
      },
    });
  });
  await page.goto("/admin/access/activity");
  await expect(
    page.getByText("View partner applications", { exact: true }),
  ).toBeVisible();
  latest = true;
  await page.clock.fastForward(30100);
  await expect(
    page.getByText("View vehicle models", { exact: true }),
  ).toBeVisible();
  const beforeHidden = calls;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.fastForward(90100);
  expect(calls).toBe(beforeHidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => calls).toBeGreaterThan(beforeHidden);
});

test("malformed audit data remains recoverable instead of crashing the table", async ({
  page,
}) => {
  await auditWorkspace(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let broken: unknown = { ...activityPage(), activities: null };
  await page.route("**/api/v2/admin/activity?**", (route) =>
    route.fulfill({ json: { status: "success", data: broken } }),
  );
  await page.goto("/admin/access/activity");
  await expect(
    page.getByRole("heading", { name: "Could not load activity", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Activity data could not be verified. Refresh to try again.",
      { exact: true },
    ),
  ).toBeVisible();
  broken = {
    ...activityPage(),
    activities: [{ ...activityPage().activities[0], actor: "invalid" }],
  };
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Could not load activity", exact: true }),
  ).toBeVisible();
  broken = activityPage();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("View vehicle models", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("a changed audit filter does not show rows from the previous query", async ({
  page,
}) => {
  await auditWorkspace(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v2/admin/activity?**", async (route) => {
    const filtered =
      new URL(route.request().url()).searchParams.get("activity") === "reads";
    if (filtered) await gate;
    await route.fulfill({
      json: {
        status: "success",
        data: activityPage(
          filtered ? "View applications" : "Approve partner application",
        ),
      },
    });
  });
  await page.goto("/admin/access/activity");
  await expect(
    page.getByText("Approve partner application", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Activity type", { exact: true }).selectOption("reads");
  await expect(
    page.getByText("Approve partner application", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('[data-loading-variant="table"]')).toBeVisible();
  release();
  await expect(
    page.getByText("View applications", { exact: true }),
  ).toBeVisible();
});

test("a failed background update retains audit rows and refresh button dimensions", async ({
  page,
}) => {
  await page.clock.install();
  await auditWorkspace(page);
  let mode: "success" | "pending" | "failure" = "success";
  let calls = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v2/admin/activity?**", async (route) => {
    calls++;
    if (mode === "pending") await gate;
    await route.fulfill(
      mode === "failure"
        ? {
            status: 503,
            json: { status: "error", message: "Temporary service issue" },
          }
        : { json: { status: "success", data: activityPage() } },
    );
  });
  await page.goto("/admin/access/activity");
  await expect(
    page.getByText("View vehicle models", { exact: true }),
  ).toBeVisible();
  const button = page.locator(".catalog-toolbar > .button");
  const before = await button.boundingBox();
  mode = "pending";
  await page.clock.fastForward(20000);
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "true");
  expect((await button.boundingBox())!.width).toBeCloseTo(before!.width, 1);
  await expect(
    page.getByText("View vehicle models", { exact: true }),
  ).toBeVisible();
  const pendingCalls = calls;
  await page.clock.fastForward(10100);
  expect(calls).toBe(pendingCalls);
  mode = "failure";
  release();
  await expect(page.getByRole("alert")).toContainText(
    "Showing the last loaded results",
  );
  await expect(
    page.getByText("View vehicle models", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Update failed", { exact: true })).toBeVisible();
  mode = "success";
  await button.click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(button).not.toHaveAttribute("aria-busy", "true");
  const settledCalls = calls;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(calls).toBe(settledCalls);
});

test("audit detail outcomes update and an expired historical page follows the server clamp", async ({
  page,
}) => {
  await page.clock.install();
  await auditWorkspace(page);
  let completed = false;
  let clamped = false;
  const pages: string[] = [];
  await page.route("**/api/v2/admin/activity?**", (route) => {
    const requestedPage = new URL(route.request().url()).searchParams.get(
      "page",
    )!;
    pages.push(requestedPage);
    const data = activityPage("View vehicle models", completed ? 200 : null);
    return route.fulfill({
      json: {
        status: "success",
        data: {
          ...data,
          total: clamped ? 1 : 21,
          page: clamped ? 1 : Number(requestedPage),
        },
      },
    });
  });
  await page.goto("/admin/access/activity");
  await page
    .getByRole("button", {
      name: "Actions for audit entry entry-request",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "View log details", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".audit-detail")).toContainText("Not recorded");
  completed = true;
  await page.clock.fastForward(30100);
  await expect(dialog.locator(".audit-detail")).toContainText("200");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page.getByText("Historical activity", { exact: true }),
  ).toBeVisible();
  clamped = true;
  await page.locator(".catalog-toolbar > .button").click();
  await expect(
    page.getByText("Updates every 30 seconds", { exact: true }),
  ).toBeVisible();
  await expect.poll(() => pages.at(-1)).toBe("1");
});

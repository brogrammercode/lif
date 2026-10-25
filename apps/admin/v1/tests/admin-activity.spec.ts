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
        retention_days: null,
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
  ).toHaveCount(0);
  await expect(
    page.getByText("Audit history has no automatic expiry.", { exact: true }),
  ).toBeVisible();
  expect(queries.at(-1)!.get("activity")).toBe("changes");
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
});

import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

const token =
  "e30." +
  Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".signature";
const admin = {
  id: "admin",
  role: "ADMIN",
  first_name: "Admin",
  last_name: null,
  email: "admin@example.test",
  avatar_url: null,
};
const user = {
  id: "driver",
  role: "DRIVER",
  status: "ACTIVE",
  first_name: "Driver",
  last_name: "Applicant",
  email: "driver@example.test",
  avatar_url: null,
};
async function workspace(page: Page) {
  const state = {
    filter: "all",
    requests: [] as {
      field_key: string;
      decision: string;
      expected_version: number;
      rejection_reason?: string;
    }[],
    conflict: false,
    vehicle: {
      id: "vehicle",
      make: "Brand",
      model: "Bike",
      plate_number: "BR01AA1234",
      status: "UNDER_REVIEW",
      verification_version: 1,
      brand: { is_active: true, status: "VERIFIED" },
      catalog_model: { is_active: true, status: "VERIFIED" },
      verification_assets: [
        {
          id: "private-image",
          field_key: "insurance",
          file_name: "insurance.webp",
        },
      ],
      verification_fields: [
        {
          key: "color",
          label: "Color",
          value: "Red",
          display: "Red",
          status: "PENDING",
          rejection_reason: null,
          reviewed_at: null,
          reviewed_by: null,
        },
        {
          key: "insurance",
          label: "Insurance",
          value: "private-image",
          display: "private-image",
          status: "PENDING",
          rejection_reason: null,
          reviewed_at: null,
          reviewed_by: null,
        },
      ],
    },
  };
  await page.route("**/api/v2/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const send = (data: unknown) =>
      route.fulfill({ json: { status: "success", data } });
    if (url.pathname.endsWith("/auth/refresh"))
      return send({ access_token: token, user: admin });
    if (url.pathname.endsWith("/admin/users/driver")) return send(user);
    if (url.pathname.endsWith("/admin/users")) {
      state.filter = url.searchParams.get("account_type") ?? "all";
      return send({ users: [user], total: 1, page: 1, page_size: 20 });
    }
    if (url.pathname.endsWith("/review")) {
      if (state.conflict)
        return route.fulfill({
          status: 409,
          json: {
            status: "error",
            error_code: "VEHICLE_VERIFICATION_CONFLICT",
            message: "This vehicle changed.",
          },
        });
      const body = request.postDataJSON();
      state.requests.push(body);
      state.vehicle.verification_version++;
      const field = state.vehicle.verification_fields.find(
        (f) => f.key === body.field_key,
      )!;
      field.status = body.decision;
      field.rejection_reason = body.rejection_reason ?? null;
      return send(state.vehicle);
    }
    if (url.pathname.endsWith("/vehicle-verification"))
      return send({ user, vehicles: [state.vehicle] });
    if (url.pathname.endsWith("/assets/private-image"))
      return send({
        file_name: "insurance.webp",
        mime_type: "image/webp",
        data_url:
          "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",
      });
    return send(null);
  });
  await page.goto("/users/driver/vehicle-verification");
  await expect(
    page.getByRole("heading", { name: "Vehicle Verification", exact: true }),
  ).toBeVisible();
  return state;
}
test("vehicle selection and approval progress share a bounded registration panel", async ({
  page,
}) => {
  await workspace(page);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const panel = page.getByRole("region", {
      name: "Vehicle registrations",
      exact: false,
    });
    await expect(panel.getByLabel("Vehicle", { exact: true })).toHaveValue(
      "vehicle",
    );
    await expect(
      panel.getByRole("progressbar", { name: "Vehicle field approvals" }),
    ).toHaveAttribute("value", "0");
    await expect(
      page.getByRole("link", { name: "Driver Account", exact: true }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await panel.screenshot({
      path: `test-results/ui-vehicle-selector-${width}.png`,
    });
    await page
      .locator(".application-form")
      .screenshot({ path: `test-results/ui-vehicle-fields-${width}.png` });
  }
});

test("reviews grouped fields with version checks, reasons, and private inline previews", async ({
  page,
}) => {
  const state = await workspace(page);
  await expect(
    page.getByRole("heading", { name: "Vehicle details", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve field: Color", exact: true })
    .click();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0]).toMatchObject({
    field_key: "color",
    decision: "APPROVED",
    expected_version: 1,
  });
  await page
    .getByRole("button", { name: "Request correction: Insurance", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Rejection reason").fill("Upload a legible policy.");
  await dialog
    .getByRole("button", { name: "Request correction", exact: true })
    .click();
  await expect.poll(() => state.requests.length).toBe(2);
  expect(state.requests[1]).toMatchObject({
    expected_version: 2,
    decision: "REJECTED",
    rejection_reason: "Upload a legible policy.",
  });
  await page
    .getByRole("button", { name: "insurance.webp", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("img", { name: "insurance.webp" }),
  ).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const preview = page.getByRole("dialog");
    await expect(
      preview.getByRole("button", { name: "Download original", exact: true }),
    ).toBeVisible();
    await expect(
      preview.getByRole("button", { name: "Done", exact: true }),
    ).toBeVisible();
    expect(
      await preview.evaluate(
        (node) => node.scrollWidth <= node.clientWidth + 1,
      ),
    ).toBe(true);
    await preview.screenshot({
      path: `.artifacts/admin-ui/attachment-reader-${width}.png`,
    });
  }
});
test("offers Driver/User filtering and keeps the vehicle tab while switching users", async ({
  page,
}) => {
  const state = await workspace(page);
  await page
    .getByRole("combobox", { name: "Account type" })
    .selectOption("driver");
  await expect.poll(() => state.filter).toBe("driver");
  const navigation = page.getByRole("navigation", {
    name: "Users",
    exact: true,
  });
  await expect(navigation.getByText("Driver", { exact: true })).toBeVisible();
  await expect(navigation.getByRole("link")).toHaveAttribute(
    "href",
    "/users/driver/vehicle-verification",
  );
});
test("approved vehicle fields can be reopened with a required correction reason", async ({
  page,
}) => {
  const state = await workspace(page);
  state.vehicle.status = "ACTIVE";
  state.vehicle.verification_fields.forEach((f) => (f.status = "APPROVED"));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve field: Insurance", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Request correction: Insurance", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Rejection reason")
    .fill("Renew the expired insurance policy.");
  await dialog
    .getByRole("button", { name: "Request correction", exact: true })
    .click();
  await expect.poll(() => state.requests.length).toBe(1);
  expect(state.requests[0]).toMatchObject({
    field_key: "insurance",
    decision: "REJECTED",
    rejection_reason: "Renew the expired insurance policy.",
  });
});
test("stale reviews block additional writes until the latest vehicle is reloaded", async ({
  page,
}) => {
  const state = await workspace(page);
  state.conflict = true;
  await page
    .getByRole("button", { name: "Approve field: Color", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reload vehicles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve field: Color", exact: true }),
  ).toHaveCount(0);
  state.conflict = false;
  await page.getByRole("button", { name: "Reload vehicles" }).click();
  await expect(
    page.getByRole("button", { name: "Approve field: Color", exact: true }),
  ).toBeEnabled();
});

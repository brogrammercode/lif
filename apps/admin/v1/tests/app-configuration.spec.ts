import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const admin = {
  id: "admin-fixture",
  role: "ADMIN",
  first_name: "Test",
  last_name: "Admin",
  email: "admin@example.test",
  avatar_url: null,
};
const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.fixture`;
const categories = [
  { id: "economy", name: "Economy Sedan" },
  { id: "premium", name: "Premium Sedan" },
  { id: "child", name: "Airport Sedan" },
  { id: "disabled", name: "Disabled Sedan" },
];

for (const entry of [
  {
    name: "fare policy",
    route: "/app/user/fare-policy",
    endpoint: "/admin/fare-policy",
    broken: { version: 1, rates: null },
  },
  {
    name: "support contacts",
    route: "/support/configure/contact",
    endpoint: "/admin/support/configuration/contact",
    broken: null,
  },
  {
    name: "trip reviews",
    route: "/app/user/ride-reviews",
    endpoint: "/admin/trip-reviews",
    broken: { items: [{ id: "broken" }], total: 1, page: 1, page_size: 20 },
  },
]) {
  test(`malformed ${entry.name} data is recoverable and cannot crash or enable edits`, async ({
    page,
  }) => {
    await mockConfiguration(page);
    let broken = true;
    await page.route(`**/api/v2${entry.endpoint}**`, async (route) => {
      if (broken)
        return route.fulfill({
          json: { status: "success", data: entry.broken, message: "Loaded" },
        });
      if (entry.name === "trip reviews")
        return route.fulfill({
          json: {
            status: "success",
            data: { items: [], total: 0, page: 1, page_size: 20 },
            message: "Loaded",
          },
        });
      return route.fallback();
    });
    await page.goto(entry.route);
    await expect(
      page.getByText(
        "The server returned incomplete configuration data. Reload to try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Save fare policy|Save contacts|Approve charge/,
      }),
    ).toHaveCount(0);
    broken = false;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(
      page.getByText(
        "The server returned incomplete configuration data. Reload to try again.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name:
          entry.name === "fare policy"
            ? "Fare Policy"
            : entry.name === "support contacts"
              ? "Contact"
              : "No ride reviews",
        exact: true,
      }),
    ).toBeVisible();
  });
}
async function mockConfiguration(
  page: Page,
  options: {
    empty?: boolean;
    conflict?: boolean;
    catalog?: typeof categories;
    transformPolicy?: (policy: unknown) => unknown;
  } = {},
) {
  let version = options.empty ? 0 : 1;
  const writes: Record<string, unknown>[] = [];
  const policy = () => ({
    version,
    updated_at: version ? "2026-10-24T06:00:00Z" : null,
    updated_by: version ? admin : null,
    cash_enabled: true,
    direct_upi_enabled: true,
    online_payment_enabled: false,
    commission_percent: 0,
    free_cancellation_minutes: 2,
    free_pickup_wait_minutes: 5,
    cancellation_fee_percent: 10,
    maximum_cancellation_fee: 100,
    rates: (options.catalog ?? categories).map((category) => ({
      category_id: category.id,
      name: category.name,
      parent_name: category.id === "child" ? "Airport" : null,
      vehicle_type: "SEDAN",
      is_active: category.id !== "disabled",
      is_selectable: category.id !== "disabled",
      updated_at: "2026-10-25T00:00:00.000Z",
      fare_policy: version
        ? {
            max_profit_km: 2,
            normal_fare_per_km: version === 2 ? 30 : 10,
            profit_fare_per_km: 20,
          }
        : null,
    })),
  });
  await page.route("**/api/v2/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const respond = (data: unknown, status = 200, message = "Saved") =>
      route.fulfill({
        status,
        json: {
          status: status < 400 ? "success" : "error",
          data,
          message,
          ...(status === 409 ? { error_code: "FARE_POLICY_CONFLICT" } : {}),
        },
      });
    if (path.endsWith("/auth/refresh"))
      return respond({ user: admin, access_token: token });
    if (path.endsWith("/auth/me")) return respond(admin);
    if (path.endsWith("/admin/fare-policy")) {
      if (route.request().method() === "GET") {
        const value = policy();
        return respond(
          options.transformPolicy ? options.transformPolicy(value) : value,
        );
      }
      writes.push(route.request().postDataJSON());
      version++;
      if (options.conflict)
        return respond(
          null,
          409,
          "The fare policy changed. Reload before saving.",
        );
      return respond(policy());
    }
    if (path.endsWith("/admin/support/configuration/contact")) {
      const empty = {
        version: 0,
        updated_at: null,
        updated_by: null,
        support_phone: null,
        emergency_phone: null,
        whatsapp_phone: null,
        support_email: null,
        support_hours: null,
        instructions: null,
      };
      if (route.request().method() === "GET") return respond(empty);
      const input = route.request().postDataJSON();
      writes.push(input);
      return respond({
        ...empty,
        ...input,
        version: 1,
        updated_by: admin,
        support_phone: input.support_phone.trim(),
      });
    }
    return respond([]);
  });
  return writes;
}

test("invalid category fare values and revisions block editing and recover after reload", async ({
  page,
}) => {
  let fault: Record<string, unknown> | null = null;
  await mockConfiguration(page, {
    transformPolicy(value) {
      const policy = value as { rates: Record<string, unknown>[] };
      if (fault) policy.rates[0] = { ...policy.rates[0], ...fault };
      return policy;
    },
  });
  const validFare = {
    max_profit_km: 2,
    normal_fare_per_km: 10,
    profit_fare_per_km: 20,
  };
  for (const invalid of [
    { fare_policy: { ...validFare, max_profit_km: 100000.001 } },
    { fare_policy: { ...validFare, normal_fare_per_km: 10.001 } },
    { fare_policy: { ...validFare, unexpected_rate: 99 } },
    { updated_at: "2026-10-25" },
    { updated_at: "2026-02-30T00:00:00.000Z" },
  ]) {
    fault = invalid;
    await page.goto("/app/user/fare-policy");
    await expect(
      page.getByText(
        "The server returned incomplete configuration data. Reload to try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save fare policy" }),
    ).toHaveCount(0);
  }
  fault = { updated_at: "2026-10-25T00:00:00Z" };
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save fare policy" }),
  ).toBeVisible();
});

test("fare policy lists every category independently, including same-family and disabled choices", async ({
  page,
}) => {
  const writes = await mockConfiguration(page, { empty: true });
  await page.goto("/app/user/fare-policy");
  await expect(
    page.getByRole("heading", { name: "Fare Policy", exact: true }),
  ).toBeVisible();
  for (const category of categories) {
    await page
      .getByRole("switch", {
        name: "Configure fare for " + category.name,
        exact: true,
      })
      .click();
    for (const [key, value] of Object.entries({
      max_profit_km: "2",
      normal_fare_per_km: "10",
      profit_fare_per_km: "20",
    })) {
      const input = page.locator(`#fare-${category.id}-${key}`);
      await expect(input).toHaveValue("");
      await input.fill(value);
    }
  }
  await expect(
    page.getByRole("switch", { name: "Online payment through the app" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save fare policy" }).click();
  await expect(page.getByRole("status")).toHaveText("Fare policy saved.");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    expected_version: 0,
    cash_enabled: true,
    direct_upi_enabled: true,
    free_cancellation_minutes: 2,
    maximum_cancellation_fee: 100,
  });
  expect(writes[0]!.rates).toHaveLength(categories.length);
  expect(
    (writes[0]!.rates as { category_id: string }[]).map(
      (rate) => rate.category_id,
    ),
  ).toEqual(categories.map((category) => category.id));
  await expect(
    page.getByText(/Version 1.*Last updated by Test Admin/),
  ).toBeVisible();
});

test("new and removed categories are reflected after reload without fixed family slots", async ({
  page,
}) => {
  const catalog = categories.map((category) => ({ ...category }));
  await mockConfiguration(page, { catalog });
  await page.goto("/app/user/fare-policy");
  await expect(
    page.getByRole("switch", {
      name: "Configure fare for Economy Sedan",
      exact: true,
    }),
  ).toBeVisible();
  catalog.push({ id: "future-category", name: "Night City Ride" });
  catalog.splice(0, 1);
  await page.reload();
  await expect(
    page.getByRole("switch", {
      name: "Configure fare for Night City Ride",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", {
      name: "Configure fare for Economy Sedan",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("switch", {
      name: "Configure fare for Premium Sedan",
      exact: true,
    }),
  ).toBeVisible();
});

test("two sedan categories can save different fares", async ({ page }) => {
  const writes = await mockConfiguration(page);
  await page.goto("/app/user/fare-policy");
  await page.locator("#fare-economy-normal_fare_per_km").fill("12");
  await page.locator("#fare-premium-normal_fare_per_km").fill("28");
  await page
    .getByRole("button", { name: "Save fare policy", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("Fare policy saved.");
  const rates = writes[0]!.rates as {
    category_id: string;
    fare_policy: { normal_fare_per_km: number };
  }[];
  expect(
    rates.find((rate) => rate.category_id === "economy")!.fare_policy
      .normal_fare_per_km,
  ).toBe(12);
  expect(
    rates.find((rate) => rate.category_id === "premium")!.fare_policy
      .normal_fare_per_km,
  ).toBe(28);
});

test("a stale fare edit keeps the draft and provides an explicit reload", async ({
  page,
}) => {
  await mockConfiguration(page, { conflict: true });
  await page.goto("/app/user/fare-policy");
  await page.locator("#fare-premium-normal_fare_per_km").fill("99");
  await page.getByRole("button", { name: "Save fare policy" }).click();
  await expect(
    page.getByText("The fare policy changed. Reload before saving."),
  ).toBeVisible();
  await expect(page.locator("#fare-premium-normal_fare_per_km")).toHaveValue(
    "99",
  );
  await expect(
    page.getByRole("button", { name: "Save fare policy", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reload latest policy" }).click();
  await expect(page.locator("#fare-premium-normal_fare_per_km")).toHaveValue(
    "30",
  );
  await expect(
    page.getByRole("button", { name: "Save fare policy", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText(/Version 2.*Last updated by Test Admin/),
  ).toBeVisible();
});

test("support configuration uses the common navigation and saves public contacts only", async ({
  page,
}) => {
  const writes = await mockConfiguration(page);
  await page.goto("/support/configure/contact");
  await expect(
    page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("link", { name: "Support" }),
  ).toBeVisible();
  await page.getByLabel("Support phone", { exact: true }).fill("+919999999999");
  await page
    .getByLabel("Support email", { exact: true })
    .fill("help@example.test");
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Contact the support team for trip help.");
  await page.getByRole("button", { name: "Save contacts" }).click();
  await expect(page.getByRole("status")).toHaveText("Support contacts saved.");
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    expected_version: 0,
    support_phone: "+919999999999",
    support_email: "help@example.test",
  });
  expect(writes[0]).not.toHaveProperty("updated_by");
});

function reviewFixture() {
  return {
    id: "review-fixture",
    ride_id: "trip-fixture",
    reported_by_id: "driver-user",
    driver_id: "driver-profile",
    kind: "NO_SHOW",
    status: "REQUESTED",
    reason: "Passenger did not arrive after calling",
    fee_amount: "8.00",
    version: 1,
    dispute_reason: null,
    resolution_note: null,
    created_at: "2026-10-24T06:00:00Z",
    ride: {
      rider_id: "rider-fixture",
      status: "CANCELLED",
      pickup_address: "Station",
      dropoff_address: "University",
      matched_at: "2026-10-24T05:50:00Z",
      arrived_at: "2026-10-24T05:55:00Z",
      cancelled_at: "2026-10-24T06:01:00Z",
      events: [
        {
          id: "event-fixture",
          event_type: "DRIVER_WAITING",
          created_at: "2026-10-24T05:55:00Z",
          metadata: { gps_verified: true, distance_m: 40 },
        },
      ],
    },
  };
}

test("ride review shows evidence and requires approval before verified manual settlement", async ({
  page,
}) => {
  await mockConfiguration(page);
  const writes: Record<string, unknown>[] = [];
  const review = reviewFixture();
  await page.route("**/api/v2/admin/trip-reviews**", async (route) => {
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      writes.push(input);
      expect(input.expected_version).toBe(review.version);
      review.status = input.status;
      review.version++;
    }
    await route.fulfill({
      json: {
        status: "success",
        message: "Saved",
        data:
          route.request().method() === "PATCH"
            ? review
            : { items: [review], total: 1, page: 1, page_size: 20 },
      },
    });
  });
  await page.goto("/app/user/ride-reviews");
  await expect(
    page.getByRole("heading", { name: "Ride Reviews", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Record verified settlement" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Approve charge" }),
  ).toBeDisabled();
  await page.getByText("Review trip evidence", { exact: true }).click();
  await expect(page.getByText(/"gps_verified": true/)).toBeVisible();
  await page
    .getByLabel("Review note", { exact: true })
    .fill("Verified pickup location, waiting time and contact evidence.");
  await page.getByRole("button", { name: "Approve charge" }).click();
  await expect(
    page.getByRole("button", { name: "Record verified settlement" }),
  ).toBeVisible();
  expect(writes[0]).toMatchObject({ status: "APPROVED", expected_version: 1 });
  await page
    .getByLabel("Review note", { exact: true })
    .fill("Original driver confirmed receipt of the direct UPI payment.");
  await page
    .getByRole("button", { name: "Record verified settlement" })
    .click();
  await expect(
    page.getByRole("button", { name: "Record verified settlement" }),
  ).toHaveCount(0);
  expect(writes[1]).toMatchObject({ status: "SETTLED", expected_version: 2 });
  await expect(
    page.locator(".badge").filter({ hasText: "SETTLED" }),
  ).toBeVisible();
});

test("a stale ride review blocks repeated decisions until reload and clears the note after approval", async ({
  page,
}) => {
  await mockConfiguration(page);
  const review = reviewFixture();
  const writes: Record<string, unknown>[] = [];
  await page.route("**/api/v2/admin/trip-reviews**", async (route) => {
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      writes.push(input);
      if (writes.length === 1) {
        review.version = 2;
        return route.fulfill({
          status: 409,
          json: {
            status: "error",
            data: null,
            message: "Review changed on another device.",
            error_code: "REVIEW_CONFLICT",
          },
        });
      }
      review.status = input.status;
      review.version++;
      return route.fulfill({
        json: { status: "success", data: review, message: "Saved" },
      });
    }
    return route.fulfill({
      json: {
        status: "success",
        data: { items: [review], total: 1, page: 1, page_size: 20 },
        message: "Loaded",
      },
    });
  });
  await page.goto("/app/user/ride-reviews");
  const note = page.getByLabel("Review note", { exact: true });
  const approve = page.getByRole("button", {
    name: "Approve charge",
    exact: true,
  });
  await note.fill("Reviewed the pickup and contact evidence.");
  await approve.click();
  await expect(
    page.getByText("Review changed on another device.", { exact: true }),
  ).toBeVisible();
  await expect(approve).toBeDisabled();
  await note.fill("Preserve my draft while reloading the changed report.");
  await expect(approve).toBeDisabled();
  expect(writes).toHaveLength(1);
  await page
    .getByRole("button", { name: "Refresh reviews", exact: true })
    .click();
  await expect(page.getByText(/Trip trip-fixture.*Version 2/)).toBeVisible();
  await expect(
    page.getByText("Review changed on another device.", { exact: true }),
  ).toHaveCount(0);
  await expect(note).toHaveValue(
    "Preserve my draft while reloading the changed report.",
  );
  await approve.click();
  await expect(
    page.getByRole("button", {
      name: "Record verified settlement",
      exact: true,
    }),
  ).toBeVisible();
  await expect(note).toHaveValue("");
  await expect(
    page.getByRole("button", {
      name: "Record verified settlement",
      exact: true,
    }),
  ).toBeDisabled();
  expect(writes.map((w) => w.expected_version)).toEqual([1, 2]);
});

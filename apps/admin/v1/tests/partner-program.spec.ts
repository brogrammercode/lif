import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type {
  PartnerApplication,
  PartnerDocument,
} from "../src/modules/partner-program/partner-program.type";

const base = "/partner-program";
const token =
  "e30." +
  Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url") +
  ".signature";
const admin = {
  id: "review-admin",
  role: "ADMIN",
  first_name: "Review",
  last_name: "Admin",
  email: "admin@example.test",
  avatar_url: null,
};
const snapshot = {
  title: "Partner policy",
  html: "<p>Policy accepted by the applicant.</p>",
  version: 1,
};
function application(status = "SUBMITTED"): PartnerApplication {
  return {
    id: "partner-123",
    user_id: "applicant-456",
    version: 1,
    status,
    contact_email: "partner@example.test",
    whatsapp_phone: "+919876543210",
    submitted_at: "2026-10-17T10:00:00.000Z",
    completed_at: null,
    final_pdf_id: null,
    activation_issued_at: null,
    activation_attempts: 0,
    user: { first_name: "Partner", last_name: "Applicant" },
    policy_snapshot: snapshot,
    confirmation_document: { ...snapshot, title: "Confirmation" },
    fields: [
      {
        id: "answer-1",
        requirement_id: "field-1",
        definition: {
          id: "field-1",
          label: "Legal name",
          field_type: "STRING",
          is_required: true,
          category: { name: "Personal details" },
        },
        value: "Partner Applicant",
        status: "PENDING",
        rejection_reason: null,
      },
    ],
    confirmation:
      status === "CONFIRMATION_SUBMITTED"
        ? {
            status: "PENDING",
            signature_name: "Partner Applicant",
            accepted_at: "2026-10-18T10:00:00.000Z",
            rejection_reason: null,
            document_snapshot: { ...snapshot, title: "Confirmation" },
          }
        : null,
    deliveries: [],
  };
}

async function workspace(page: Page, initialStatus = "SUBMITTED") {
  const state = {
    app: application(initialStatus),
    writes: [] as { path: string; body: Record<string, unknown> }[],
    documentError: false,
    listError: false,
    document: null as PartnerDocument | null,
  };
  await page.route("**/api/v2/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const send = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        json: {
          status: status < 400 ? "success" : "error",
          data,
          message: status < 400 ? "Saved" : "Temporary service failure",
        },
      });
    if (path.endsWith("/auth/refresh"))
      return send({ access_token: token, user: admin });
    if (path.endsWith("/auth/logout")) return send(null);
    if (path.includes("/documents/")) {
      if (request.method() === "GET")
        return send(state.document, state.documentError ? 503 : 200);
      const body = request.postDataJSON();
      state.writes.push({ path, body });
      state.document = {
        id: "doc",
        kind: path.split("/").at(-1)!,
        title: body.title,
        html: body.html,
        revision: body.revision + 1,
        published_title: body.publish ? body.title : null,
        published_html: body.publish ? body.html : null,
        published_version: body.publish ? body.revision + 1 : 0,
        published_at: body.publish ? new Date().toISOString() : null,
      };
      return send(state.document);
    }
    if (path.endsWith("/applications"))
      return send(
        { rows: [state.app], total: 1, page: 1, page_size: 20 },
        state.listError ? 503 : 200,
      );
    if (
      path.endsWith("/applications/partner-123") &&
      request.method() === "GET"
    )
      return send({ application: state.app, assets: [] });
    if (path.endsWith("/assets") && request.method() === "POST") {
      state.writes.push({ path, body: request.postDataJSON() });
      return send({ id: "final-pdf", file_name: "final.pdf" });
    }
    if (path.endsWith("/assets/final-pdf"))
      return send({
        file_name: "final.pdf",
        mime_type: "application/pdf",
        data_url:
          "data:application/pdf;base64," +
          Buffer.from("%PDF-1.4 fixture").toString("base64"),
      });
    if (request.method() === "PATCH" && path.includes("/fields/")) {
      const body = request.postDataJSON();
      state.writes.push({ path, body });
      state.app.fields[0]!.status = body.decision;
      state.app.fields[0]!.rejection_reason = body.rejection_reason ?? null;
      state.app.version++;
      return send({ version: state.app.version });
    }
    if (path.endsWith("/confirmation-review")) {
      const body = request.postDataJSON();
      state.writes.push({ path, body });
      state.app.status = "COMPLETED";
      state.app.final_pdf_id = String(body.final_pdf_id);
      state.app.version++;
      state.app.confirmation!.status = "APPROVED";
      state.app.deliveries = [
        {
          channel: "EMAIL",
          status: "FAILED",
          attempts: 1,
          last_error: "Temporary SMTP failure",
          sent_at: null,
        },
      ];
      return send({ version: state.app.version });
    }
    if (path.endsWith("/approve")) {
      state.writes.push({ path, body: request.postDataJSON() });
      state.app.status = "APPROVED";
      state.app.version++;
      return send({ version: state.app.version });
    }
    return send([], 200);
  });
  return state;
}

test("document uses shared fields, supports draft/publish/preview and blocks saves after a fetch failure", async ({
  page,
}) => {
  const state = await workspace(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base + "/requirements/policy");
  const title = page.getByLabel("Document title", { exact: true });
  await expect(title).toHaveClass("field");
  const navigation = page.getByRole("navigation", {
    name: "Partner program navigation",
    exact: true,
  });
  await expect(
    navigation.getByRole("link", { name: "Requirements" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("link", { name: "Applications" }),
  ).not.toHaveClass(/active/);
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Document content" })
    .fill("Fresh policy");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => state.writes.length).toBe(1);
  await expect(page.getByText("Draft saved.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect.poll(() => state.document?.published_version).toBe(2);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Document preview"]')
      .getByText("Fresh policy"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit document", exact: true })
    .click();
  state.documentError = true;
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Document could not be loaded" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("review requires field approval and retains rejection reasons with the shared panel and form styles", async ({
  page,
}) => {
  const state = await workspace(page);
  await page.goto(base + "/applications");
  await page
    .getByRole("button", { name: "Review application partner-123" })
    .click();
  const approve = page.getByRole("button", {
    name: "Approve application",
    exact: true,
  });
  await expect(approve).toBeDisabled();
  const reason = page.getByLabel("Rejection reason", { exact: true });
  await expect(reason).toHaveClass("field");
  const reject = page.getByRole("button", {
    name: "Request correction",
    exact: true,
  });
  await expect(reject).toBeDisabled();
  await reason.fill("Please enter your full legal name.");
  await reject.click();
  await expect.poll(() => state.app.fields[0]!.status).toBe("REJECTED");
  await expect(
    page
      .getByRole("paragraph")
      .filter({ hasText: "Please enter your full legal name." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Approve field", exact: true })
    .click();
  await expect(approve).toBeEnabled();
  await approve.click();
  await page
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect.poll(() => state.app.status).toBe("APPROVED");
});

test("final PDF previews locally and uploads once only after explicit approval", async ({
  page,
}) => {
  const state = await workspace(page, "CONFIRMATION_SUBMITTED");
  await page.goto(base + "/applications/confirmations");
  await page
    .getByRole("button", { name: "Review application partner-123" })
    .click();
  const picker = page.getByLabel("Final approved PDF", { exact: true });
  await picker.setInputFiles({
    name: "invalid.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("<html>not a PDF</html>"),
  });
  await expect(page.getByRole("alert")).toContainText(
    "Choose a PDF up to 3 MB.",
  );
  await expect(page.getByTitle("Selected final PDF preview")).toHaveCount(0);
  await picker.setInputFiles({
    name: "final.pdf",
    mimeType: "",
    buffer: Buffer.from("%PDF-1.4 fixture"),
  });
  await expect(
    page.getByText("Ready for approval", { exact: true }),
  ).toBeVisible();
  expect(state.writes).toHaveLength(0);
  await expect(page.getByTitle("Selected final PDF preview")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Approve confirmation and send PDF",
      exact: true,
    })
    .click();
  expect(state.writes).toHaveLength(0);
  await page
    .getByRole("button", { name: "Confirm approval", exact: true })
    .click();
  await expect.poll(() => state.app.status).toBe("COMPLETED");
  expect(
    state.writes.filter((write) => write.path.endsWith("/assets")),
  ).toHaveLength(1);
  const upload = state.writes.find((write) => write.path.endsWith("/assets"))!;
  expect(String(upload.body.data_url)).toMatch(
    /^data:application\/pdf;base64,/,
  );
  await expect(page.getByText("Temporary SMTP failure")).toBeVisible();
});

test("a rejected optional blank answer blocks approval until reviewed again", async ({
  page,
}) => {
  const state = await workspace(page);
  state.app.status = "CHANGES_REQUESTED";
  state.app.fields[0]!.status = "REJECTED";
  state.app.fields[0]!.value = null;
  state.app.fields[0]!.definition.is_required = false;
  await page.goto(base + "/applications");
  await page
    .getByRole("button", { name: "Review application partner-123" })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve application", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Approve field", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve application", exact: true }),
  ).toBeEnabled();
});

test("list failures stay recoverable and editor/review stay within desktop and mobile viewports", async ({
  page,
}) => {
  const state = await workspace(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/requirements/policy");
    await expect(
      page.getByLabel("Document title", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Table", exact: true }).click();
    expect(
      await page
        .locator(".rich-document table")
        .evaluate(
          (table) => table.scrollWidth <= table.parentElement!.clientWidth,
        ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/partner-policy-" + width + ".png",
      fullPage: true,
    });
    await page.goto(base + "/applications");
    await page
      .getByRole("button", { name: "Review application partner-123" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Legal name *", exact: true }),
    ).toBeVisible();
    const background = await page
      .locator(".partner-answer-grid .catalog-card")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(background).toBe("rgb(255, 255, 255)");
    await page.screenshot({
      path: "test-results/partner-review-" + width + ".png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  state.listError = true;
  await page.goto(base + "/applications");
  await expect(
    page.getByRole("heading", { name: "Applications could not be loaded" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No matching applications" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

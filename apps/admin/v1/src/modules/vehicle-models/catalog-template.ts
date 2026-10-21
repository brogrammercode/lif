import { apiRequest } from "../../lib/api-client";
import { getCategories } from "../vehicle-categories/vehicle-categories.api";
import {
  columns,
  csvDownload,
  csvExamplePrefix,
  csvReferenceMarker,
  requiredColumns,
  type ImportKind,
} from "./catalog-csv";
import {
  fieldGuides,
  fieldRules,
  importChecklist,
} from "./catalog-import-guide";

type BrandReference = { id: string; name: string };
async function eligibleBrands(signal: AbortSignal): Promise<string[]> {
  const brands = new Map<string, string>();
  let total: number | null = null;
  for (let page = 1; ; page++) {
    signal.throwIfAborted();
    const data = await apiRequest<unknown>(
      `/vehicle-brands?page=${page}&page_size=100`,
      { signal },
    );
    if (
      !data ||
      typeof data !== "object" ||
      !("rows" in data) ||
      !Array.isArray(data.rows) ||
      !("total" in data) ||
      typeof data.total !== "number" ||
      !Number.isSafeInteger(data.total) ||
      data.total < 0 ||
      !("page" in data) ||
      data.page !== page ||
      !("page_size" in data) ||
      data.page_size !== 100 ||
      data.rows.length > 100
    )
      throw new Error(
        "Could not read the eligible brand reference. Retry downloading the sample CSV.",
      );
    total ??= data.total;
    if (total !== data.total)
      throw new Error(
        "The brand catalog changed while preparing the sample. Download it again.",
      );
    for (const row of data.rows as unknown[]) {
      if (
        !row ||
        typeof row !== "object" ||
        !("id" in row) ||
        typeof row.id !== "string" ||
        !row.id ||
        !("name" in row) ||
        typeof row.name !== "string" ||
        !row.name.trim() ||
        row.name.length > 100 ||
        brands.has(row.id)
      )
        throw new Error(
          "The brand reference changed or is incomplete. Retry downloading the sample CSV.",
        );
      const brand = row as BrandReference;
      brands.set(brand.id, brand.name);
    }
    if (page * 100 >= total) break;
    if (!data.rows.length)
      throw new Error(
        "The brand reference is incomplete. Retry downloading the sample CSV.",
      );
  }
  if (brands.size !== total)
    throw new Error(
      "The brand reference changed while downloading. Please try again.",
    );
  return [...brands.values()].sort((left, right) => left.localeCompare(right));
}

export async function downloadCatalogTemplate(
  kind: ImportKind,
  signal: AbortSignal,
) {
  const [brands, categories] =
    kind === "models"
      ? await Promise.all([eligibleBrands(signal), getCategories(signal)])
      : [[], []];
  signal.throwIfAborted();
  const fields = fieldGuides(kind);
  const headers = columns[kind];
  // Every row has the same columns; only explicit first-cell markers are skipped.
  const reference = (text: string) =>
    headers.map((field, index) =>
      index === 0 ? csvReferenceMarker : field === "description" ? text : "",
    );
  const example = (values: Record<string, string>) =>
    headers.map((field, index) =>
      index === 0
        ? csvExamplePrefix + (values[field] ?? "")
        : (values[field] ?? ""),
    );
  const sampleBrand = brands[0] ?? "Example Motors";
  const examples =
    kind === "brands"
      ? [
          example({
            name: "Example Motors",
            country: "India",
            description:
              "Dummy brand for reference; replace with real details.",
            website_url: "https://example.com",
          }),
          example({
            name: "Sample Electric Mobility",
            country: "India",
            description: "Dummy brand showing that website_url may be blank.",
          }),
        ]
      : [
          example({
            brand_name: sampleBrand,
            name: "Example City Model",
            vehicle_type: "SEDAN",
            fuel_type: "PETROL",
            seating_capacity: "4",
            year_from: "2020",
            year_to: "2025",
            description:
              "Dummy model; verify all specifications before import.",
          }),
          example({
            brand_name: sampleBrand,
            name: "Example Electric Model",
            vehicle_type: "SCOOTER",
            fuel_type: "ELECTRIC",
            seating_capacity: "2",
            description: "Dummy model showing optional years left blank.",
          }),
        ];
  const notes = [
    "HOW TO USE: Give this single CSV to the person or AI preparing the sheet. Keep the header row unchanged; add real data rows below it.",
    `EXAMPLES: Rows whose first cell starts with '${csvExamplePrefix}' are dummy data and ignored. Replace that entire cell with a real ${kind === "models" ? "brand_name" : "name"} and replace the other dummy values to use a row.`,
    `REFERENCE: Rows whose first cell is exactly '${csvReferenceMarker}' are ignored. Keep these markers intact or delete the reference/example rows before import. Do not copy them into real data cells.`,
    `REQUIRED COLUMNS: ${requiredColumns[kind].join(", ")}.`,
    ...importChecklist(kind),
    "UNKNOWN VALUES: Leave optional values blank. Flag unknown required values for review; never invent IDs, brand names, category relationships or vehicle specifications.",
    "DEFAULTS: New records are VERIFIED and active. This is a create-only import; existing records are skipped without changing their IDs or data.",
    ...fields.map(
      (field) =>
        `FIELD ${field.field}: ${field.required ? "Required" : "Optional"}; ${field.type}. ${field.description} ${fieldRules(field)}. Example: ${field.example}.${field.dependency ? ` Dependency: ${field.dependency}.` : ""}`,
    ),
    ...(kind === "models"
      ? [
          `BRAND REFERENCE: ${brands.length} active, VERIFIED brands captured at ${new Date().toISOString()}. Use these exact names in brand_name; the API resolves their IDs and rechecks eligibility at import time.`,
          ...(brands.length
            ? brands.map((name) => `ELIGIBLE BRAND | brand_name: ${name}`)
            : [
                "NO ELIGIBLE BRANDS: Import/verify/enable brands first, then download a fresh sample. Example Motors is fictional and cannot be used until a real eligible brand is selected.",
              ]),
          "CATEGORY REFERENCE: The following are your configured categories/subcategories for context only. Model imports do not link categories. Use the fixed vehicle_type values above, not a category name or code. Do not add category/category_id/subcategory columns.",
          ...(categories.length
            ? categories.map(
                (category) =>
                  `CONFIGURED ${category.parent_id ? "SUBCATEGORY" : "CATEGORY"} | name: ${category.name} | code: ${category.code} | vehicle_type: ${category.vehicle_type} | parent: ${category.parent_name ?? "None"} | effectively active: ${category.effective_active ? "Yes" : "No"}`,
              )
            : ["No vehicle categories are currently configured."]),
        ]
      : [
          "DEPENDENCIES: No existing brand, category or country catalog is required. Import brands first, then download a model sample to see their eligible names.",
        ]),
  ];
  signal.throwIfAborted();
  csvDownload(`vehicle-${kind}-sample.csv`, [
    headers,
    ...examples,
    ...notes.map(reference),
  ]);
}

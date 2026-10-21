import { strToU8, zipSync } from "fflate";
import { apiRequest } from "../../lib/api-client";
import {
  columns,
  csvFuelTypes,
  csvText,
  csvVehicleTypes,
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
    ) {
      throw new Error(
        "Could not read the eligible brand reference. Retry downloading the template pack.",
      );
    }
    total ??= data.total;
    if (total !== data.total)
      throw new Error(
        "The brand catalog changed while preparing the template. Download the pack again.",
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
          "The brand reference changed or is incomplete. Retry downloading the template pack.",
        );
      const brand = row as BrandReference;
      brands.set(brand.id, brand.name);
    }
    if (page * 100 >= total) break;
    if (!data.rows.length)
      throw new Error(
        "The brand reference is incomplete. Retry downloading the template pack.",
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
  const brands = kind === "models" ? await eligibleBrands(signal) : [];
  signal.throwIfAborted();
  const capturedAt = new Date().toISOString();
  const fields = fieldGuides(kind);
  const fileName = `vehicle-${kind}.csv`;
  const readme = [
    `# 1More vehicle ${kind} import template`,
    "",
    "## Give this whole pack to the person or tool preparing your sheet",
    "",
    `- Fill **${fileName}** with your data. It contains only the accepted headers; no example records will be imported by accident.`,
    "- The field guide, allowed-values sheet and import-spec.json describe the actual supported fields and dependencies.",
    ...(kind === "models"
      ? [
          "- active-verified-brands.json contains the exact eligible brand names. Use those names in brand_name; the API resolves the database ID.",
        ]
      : []),
    "- Return only the filled data CSV for import. Do not upload the ZIP, guide/reference files, extra sheets, comments or instruction rows.",
    "- If a required value or dependency is unknown, flag it for review. Do not invent brand names, IDs, category links or enum values.",
    "",
    "## Import checklist",
    "",
    ...importChecklist(kind).map((rule) => `- ${rule}`),
    "",
    `- Required columns: ${requiredColumns[kind].join(", ")}.`,
    `- Header row: ${columns[kind].join(",")}`,
    "",
    "## Field reference",
    "",
    ...fields.flatMap((field) => [
      `### ${field.field} (${field.required ? "required" : "optional"})`,
      `- Type: ${field.type}. ${field.description}`,
      ...(fieldRules(field) ? [`- Rules: ${fieldRules(field)}.`] : []),
      ...(field.dependency ? [`- Depends on: ${field.dependency}.`] : []),
      `- Example: ${field.example}.`,
      "",
    ]),
    "## Dependencies and IDs",
    "",
    ...(kind === "models"
      ? [
          "1. Create/import the brands first. Requested, rejected or disabled brands cannot be used by model imports.",
          "2. Download this pack again after changing brands. Use brand_name from active-verified-brands.json; models do not create brands automatically.",
          "3. vehicle_type is a fixed vehicle family (for example SEDAN). A ride category named Economy or Premium is not a vehicle_type.",
          "4. Categories/subcategories are configured separately. This import has no category relationship; do not add category, category_id or subcategory columns.",
          `- Eligible brands in this snapshot: ${brands.length}.`,
          ...(brands.length
            ? []
            : [
                "- No eligible brands were found. Import/verify/enable brands, then download a fresh pack before preparing model rows.",
              ]),
          `- Reference captured at ${capturedAt}. The API rechecks availability at import time.`,
        ]
      : [
          "- Brand imports have no required brand, model, category or country catalog dependency.",
          "- Import brands before preparing their model CSVs.",
        ]),
    "- Brand/model IDs are generated UUIDs. Imported model rows keep the existing brand ID resolved from brand_name.",
    "- Brand names are unique across brands; model names are unique within each brand. Case and normalized whitespace do not create a second record.",
    "- Existing entries are skipped, including their IDs and existing review/enablement state. This is a create-only import, not a bulk editor.",
    "- logo_url, image_upload, status, is_active, id, brand_id and category IDs are not accepted CSV fields. Upload logos or edit existing records through the admin editor.",
    "",
  ].join("\n");
  const spec = {
    format_version: 1,
    kind,
    import_file: fileName,
    encoding: "UTF-8",
    delimiter: ",",
    limits: { max_data_rows: 100, max_file_bytes: 1000000 },
    column_order: columns[kind],
    fields,
    blank_optional_value: "",
    ids: {
      generated: "UUID",
      accepted_csv_id_columns: [],
      model_brand_link:
        kind === "models"
          ? "brand_name -> existing active, verified brand ID"
          : null,
    },
    dependencies: {
      brands:
        kind === "models"
          ? {
              reference_file: "active-verified-brands.json",
              required_status: "VERIFIED",
              required_is_active: true,
              automatically_created: false,
              captured_at: capturedAt,
            }
          : null,
      categories: { required: false, linked_by_this_import: false },
      subcategories: { required: false, linked_by_this_import: false },
    },
    matching: {
      names:
        "Trim leading/trailing whitespace, collapse internal whitespace, lowercase; punctuation/accents/spelling remain significant.",
      headers: "Case-insensitive; no additional columns.",
      duplicates: "Skip and preserve existing IDs/data; no updates.",
    },
    defaults_for_new_records: {
      status: "VERIFIED",
      is_active: true,
      logo_url: null,
    },
    rules: importChecklist(kind),
  };
  const files: Record<string, Uint8Array> = {
    [fileName]: strToU8("\uFEFF" + csvText([columns[kind]])),
    "README.md": strToU8(readme),
    "import-spec.json": strToU8(JSON.stringify(spec, null, 2) + "\n"),
    "field-guide.csv": strToU8(
      "\uFEFF" +
        csvText([
          [
            "field",
            "required",
            "type",
            "rules",
            "description",
            "dependency",
            "example",
          ],
          ...fields.map((field) => [
            field.field,
            field.required ? "Yes" : "No",
            field.type,
            fieldRules(field),
            field.description,
            field.dependency ?? "None",
            field.example,
          ]),
        ]),
    ),
    "allowed-values.csv": strToU8(
      "\uFEFF" +
        csvText([
          ["field", "allowed_value", "meaning"],
          ...(kind === "models"
            ? [
                ...csvVehicleTypes.map((value) => [
                  "vehicle_type",
                  value,
                  "Fixed vehicle family; not a ride category",
                ]),
                ...csvFuelTypes.map((value) => [
                  "fuel_type",
                  value,
                  "Fixed fuel value",
                ]),
              ]
            : [
                ["country", "Free text", "No country catalog required"],
                [
                  "website_url",
                  "https://...",
                  "Optional complete HTTPS website URL",
                ],
              ]),
        ]),
    ),
  };
  if (kind === "models")
    files["active-verified-brands.json"] = strToU8(
      JSON.stringify(
        {
          captured_at: capturedAt,
          required_status: "VERIFIED",
          required_is_active: true,
          matching:
            "Case-insensitive with normalized whitespace; IDs are resolved by the API.",
          brands: brands.map((name) => ({ brand_name: name })),
        },
        null,
        2,
      ) + "\n",
    );
  const zip = zipSync(files, { level: 6 });
  signal.throwIfAborted();
  const buffer = new ArrayBuffer(zip.length);
  new Uint8Array(buffer).set(zip);
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/zip" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `vehicle-${kind}-template-pack.zip`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

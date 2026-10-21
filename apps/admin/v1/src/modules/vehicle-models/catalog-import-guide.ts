import {
  columns,
  csvFuelTypes,
  csvVehicleTypes,
  type ImportKind,
} from "./catalog-csv";

export type CsvFieldGuide = {
  field: string;
  required: boolean;
  type: "string" | "integer";
  description: string;
  example: string;
  max_length?: number;
  min?: number;
  max?: number;
  allowed_values?: readonly string[];
  dependency?: string;
};
const common: Record<string, CsvFieldGuide> = {
  name: {
    field: "name",
    required: true,
    type: "string",
    description:
      "Brand or model display name. Match existing names without case or extra whitespace; spelling, punctuation and accents still matter.",
    example: "Example Motors",
    max_length: 100,
  },
  description: {
    field: "description",
    required: false,
    type: "string",
    description:
      "Plain-text description. Quote cells containing commas or newlines.",
    example: "Example description",
    max_length: 1000,
  },
};
const brand: Record<string, CsvFieldGuide> = {
  ...common,
  country: {
    field: "country",
    required: false,
    type: "string",
    description:
      "Free-text country name; no country ID or separate country catalog is required.",
    example: "India",
    max_length: 80,
  },
  website_url: {
    field: "website_url",
    required: false,
    type: "string",
    description:
      "A complete HTTPS website address. This is a website link, not a logo URL.",
    example: "https://example.com",
    max_length: 2000,
  },
};
const model: Record<string, CsvFieldGuide> = {
  ...common,
  name: {
    ...common.name!,
    description:
      "Model display name, unique within its brand after case/whitespace normalization.",
    example: "Example City Model",
  },
  brand_name: {
    field: "brand_name",
    required: true,
    type: "string",
    description:
      "Use an existing active, verified brand's name. Import and verify/enable the brand first; model import never creates its brand.",
    example: "Choose from the eligible brand reference rows in this CSV",
    max_length: 100,
    dependency:
      "Eligible brand reference rows in this CSV; matched by normalized brand name, then linked using the existing database brand ID",
  },
  vehicle_type: {
    field: "vehicle_type",
    required: true,
    type: "string",
    description:
      "Fixed vehicle family, not a configured ride category or subcategory name. Case-insensitive; saved in uppercase.",
    example: "SEDAN",
    allowed_values: csvVehicleTypes,
  },
  fuel_type: {
    field: "fuel_type",
    required: true,
    type: "string",
    description: "Fixed fuel value. Case-insensitive; saved in uppercase.",
    example: "PETROL",
    allowed_values: csvFuelTypes,
  },
  seating_capacity: {
    field: "seating_capacity",
    required: true,
    type: "integer",
    description:
      "Whole decimal number of seats. No words, decimals, ranges or scientific notation.",
    example: "4",
    min: 1,
    max: 8,
  },
  year_from: {
    field: "year_from",
    required: false,
    type: "integer",
    description: "Four-digit first year. Leave blank when unknown.",
    example: "2020",
    min: 1900,
    max: 2050,
  },
  year_to: {
    field: "year_to",
    required: false,
    type: "integer",
    description:
      "Four-digit final year, at least year_from when both are provided. Leave blank for an open end or unknown year.",
    example: "2025",
    min: 1900,
    max: 2050,
    dependency: "year_to >= year_from when both are present",
  },
};

export const fieldGuides = (kind: ImportKind) =>
  columns[kind].map((field) => (kind === "brands" ? brand : model)[field]!);

export const importChecklist = (kind: ImportKind) => [
  "Format: UTF-8 CSV, 1–100 data rows, up to 1 MB. Keep the template headers; no extra columns.",
  "Values: fill required fields; leave unknown optional cells blank. Quote commas/newlines; escape a double quote as two double quotes.",
  "Sample: replace the example's first cell with a real brand/name and fill its data, or add your own rows. Marked example and reference rows are ignored during import.",
  kind === "models"
    ? "Dependency: import brands first. brand_name must match an active, verified brand listed in the sample CSV's reference rows."
    : "Dependencies: none. Country is free text; an optional website must use HTTPS.",
  "IDs & logos: IDs are automatic; upload logos in the editor. Do not add ID, status, enablement or logo columns.",
  kind === "models"
    ? "Categories: configured separately, not linked here. vehicle_type is a fixed family (for example SEDAN), not a category name."
    : "Categories: no category or subcategory is required or linked when importing brands.",
  "Matching: case-insensitive; outer/repeated spaces are ignored in names. Spelling, punctuation and accents matter. Duplicates keep their existing IDs/data.",
  "Import: new entries are verified and active. Fix preview errors, import, then check counts and export row results. Retries skip existing entries.",
];

export function fieldRules(field: CsvFieldGuide) {
  return [
    field.allowed_values?.join(", "),
    field.max_length ? `Up to ${field.max_length} characters` : "",
    field.min !== undefined ? `${field.min}–${field.max}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

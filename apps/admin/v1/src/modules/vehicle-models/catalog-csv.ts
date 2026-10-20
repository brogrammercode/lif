export type ImportKind = "brands" | "models";
export type CsvRow = {
  row: number;
  values: Record<string, string>;
  errors: string[];
};
export const columns = {
  brands: ["name", "country", "description", "website_url"],
  models: [
    "brand_name",
    "name",
    "vehicle_type",
    "fuel_type",
    "seating_capacity",
    "year_from",
    "year_to",
    "description",
  ],
};
export const requiredColumns = {
  brands: ["name"],
  models: [
    "brand_name",
    "name",
    "vehicle_type",
    "fuel_type",
    "seating_capacity",
  ],
};

// RFC 4180 quotes, commas, embedded newlines, BOM and CRLF; never execute cells.
export function parseCatalogCsv(text: string, kind: ImportKind): CsvRow[] {
  const records: { cells: string[]; line: number }[] = [];
  let line = 1,
    recordLine = 1;
  let record: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  const content = text.replace(/^\uFEFF/, "");
  const cell = () => {
    record.push(value.trim());
    value = "";
    closed = false;
  };
  const row = () => {
    cell();
    if (record.some(Boolean)) records.push({ cells: record, line: recordLine });
    record = [];
  };
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += char;
        if (char === "\n" || (char === "\r" && content[i + 1] !== "\n")) line++;
      }
    } else if (char === '"') {
      if (value || closed)
        throw new Error(
          "A quote must begin a quoted cell. Escape quotes as two double quotes.",
        );
      quoted = true;
    } else if (char === ",") cell();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && content[i + 1] === "\n") i++;
      row();
      line++;
      recordLine = line;
      if (records.length > 101)
        throw new Error("Import up to 100 data rows at a time.");
    } else {
      if (closed && char?.trim())
        throw new Error("Put a comma or newline after a closing quote.");
      if (!closed) value += char;
    }
  }
  if (quoted) throw new Error("A quoted cell was not closed.");
  row();
  const headers = records.shift()?.cells.map((h) => h.toLowerCase()) ?? [];
  if (new Set(headers).size !== headers.length)
    throw new Error("Column headers must be unique.");
  const missing = requiredColumns[kind].filter((h) => !headers.includes(h));
  const unknown = headers.filter((h) => !columns[kind].includes(h));
  if (missing.length || unknown.length)
    throw new Error(
      [
        missing.length ? `Missing columns: ${missing.join(", ")}.` : "",
        unknown.length
          ? `Unknown columns: ${unknown.join(", ")}. Use the template.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  if (!records.length || records.length > 100)
    throw new Error("Choose a CSV with 1–100 data rows.");
  return records.map(({ cells, line: sourceLine }) => {
    const values = Object.fromEntries(
      headers.map((h, i) => [h, cells[i] ?? ""]),
    );
    const errors: string[] = [];
    if (cells.length !== headers.length)
      errors.push("Cell count does not match the header.");
    for (const key of requiredColumns[kind])
      if (!values[key]) errors.push(`${key} is required.`);
    for (const [key, val] of Object.entries(values))
      if (
        val.length >
        (key === "description"
          ? 1000
          : key === "website_url"
            ? 2000
            : key === "country"
              ? 80
              : 100)
      )
        errors.push(`${key} is too long.`);
    if (values.website_url) {
      try {
        const url = new URL(values.website_url);
        if (url.protocol !== "https:") throw new Error();
      } catch {
        errors.push("website_url must be an HTTPS URL.");
      }
    }
    if (kind === "models") {
      values.vehicle_type = values.vehicle_type?.toUpperCase() ?? "";
      values.fuel_type = values.fuel_type?.toUpperCase() ?? "";
      if (
        !["BIKE", "SCOOTER", "AUTO", "SEDAN", "SUV"].includes(
          values.vehicle_type,
        )
      )
        errors.push("Choose a supported vehicle_type.");
      if (
        !["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID", "OTHER"].includes(
          values.fuel_type,
        )
      )
        errors.push("Choose a supported fuel_type.");
      if (
        !/^\d+$/.test(values.seating_capacity ?? "") ||
        Number(values.seating_capacity) < 1 ||
        Number(values.seating_capacity) > 8
      )
        errors.push("seating_capacity must be 1–8.");
      for (const key of ["year_from", "year_to"])
        if (
          values[key] &&
          (!/^\d{4}$/.test(values[key]) ||
            Number(values[key]) < 1900 ||
            Number(values[key]) > 2050)
        )
          errors.push(`${key} must be 1900–2050.`);
      if (
        values.year_from &&
        values.year_to &&
        Number(values.year_to) < Number(values.year_from)
      )
        errors.push("year_to must be at least year_from.");
    }
    return { row: sourceLine, values, errors };
  });
}

export function csvDownload(name: string, rows: string[][]) {
  const content = rows
    .map((row) =>
      row
        .map(
          (cell) =>
            `"${(/^(?:[\t\r\n]|\s*[=+@-])/.test(cell) ? "'" + cell : cell).replaceAll('"', '""')}"`,
        )
        .join(","),
    )
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

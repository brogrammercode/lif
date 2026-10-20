import { useRef, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { InlineError } from "../../components/feedback/StateCard";
import { apiRequest, safeMessage } from "../../lib/api-client";
import {
  columns,
  csvDownload,
  parseCatalogCsv,
  requiredColumns,
  type CsvRow,
  type ImportKind,
} from "./catalog-csv";
type Result = {
  row: number;
  name: string;
  status: "CREATED" | "SKIPPED" | "FAILED";
  message: string;
};
function readResults(data: unknown, expected: CsvRow[]): Result[] {
  const results =
    data && typeof data === "object" && "results" in data ? data.results : null;
  if (!Array.isArray(results) || results.length !== expected.length)
    throw new Error(
      "The API returned incomplete import results. Refresh the catalog and retry; existing records will be skipped.",
    );
  const wanted = new Set(expected.map((row) => row.row));
  const seen = new Set<number>();
  for (const result of results) {
    if (
      !result ||
      typeof result !== "object" ||
      !Number.isInteger(result.row) ||
      !wanted.has(result.row) ||
      seen.has(result.row) ||
      typeof result.name !== "string" ||
      typeof result.message !== "string" ||
      !["CREATED", "SKIPPED", "FAILED"].includes(result.status)
    )
      throw new Error(
        "The API returned invalid import results. Refresh the catalog before retrying.",
      );
    seen.add(result.row);
  }
  return results as Result[];
}

export function CatalogImport({
  kind,
  onClose,
  onImported,
}: {
  kind: ImportKind;
  onClose: () => void;
  onImported: () => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  const selection = useRef(0);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [started, setStarted] = useState(false);
  async function choose(file: File) {
    if (lock.current) return;
    const current = ++selection.current;
    setReading(true);
    setFileName(file.name);
    setError(null);
    setRows([]);
    setResults([]);
    setStarted(false);
    try {
      if (!/\.csv$/i.test(file.name) || !file.size || file.size > 1_000_000)
        throw new Error("Choose a UTF-8 CSV up to 1 MB.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      const parsed = parseCatalogCsv(text, kind);
      if (current === selection.current) {
        setRows(parsed);
        setFileName(file.name);
      }
    } catch (cause) {
      if (current === selection.current) setError(safeMessage(cause));
    } finally {
      if (current === selection.current) setReading(false);
    }
  }
  async function submit() {
    if (
      lock.current ||
      reading ||
      !rows.length ||
      rows.some((r) => r.errors.length)
    )
      return;
    lock.current = true;
    setBusy(true);
    setStarted(true);
    setError(null);
    const done = new Set(
      results.filter((r) => r.status !== "FAILED").map((r) => r.row),
    );
    const remaining = rows.filter((r) => !done.has(r.row));
    let aggregate = results.filter((r) => done.has(r.row));
    setResults(aggregate);
    try {
      for (let i = 0; i < remaining.length; i += 5) {
        const requested = remaining.slice(i, i + 5);
        const batch = await apiRequest<unknown>(
          "/admin/vehicle-catalog/import",
          {
            method: "POST",
            data: {
              kind,
              rows: requested.map(({ row, values }) => ({ row, values })),
            },
            timeoutMs: 120000,
          },
        );
        aggregate = [...aggregate, ...readResults(batch, requested)];
        setResults(aggregate);
      }
    } catch (cause) {
      setError(
        `${safeMessage(cause)} Completed rows are retained. Retry safely; existing records are skipped.`,
      );
    } finally {
      lock.current = false;
      setBusy(false);
      onImported();
    }
  }
  const finished = started && results.length === rows.length && !busy;
  const resultByRow = new Map(results.map((r) => [r.row, r]));
  return (
    <Dialog
      title={`Import vehicle ${kind}`}
      description="Review your file before creating catalog entries."
      busy={busy || reading}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-white p-4 text-sm space-y-2">
          <strong>CSV guidelines</strong>
          <p>
            UTF-8, comma separated, maximum 100 rows / 1 MB. Required columns:{" "}
            {requiredColumns[kind].join(", ")}. Quote cells containing commas or
            newlines.
          </p>
          {kind === "models" && (
            <>
              <p>
                Import brands first. brand_name must match an active, verified
                brand. Vehicle types: BIKE, SCOOTER, AUTO, SEDAN, SUV. Fuel:
                PETROL, DIESEL, CNG, ELECTRIC, HYBRID, OTHER. Seats: 1–8. Years:
                1900–2050.
              </p>
              <p>Models are unique within their brand.</p>
            </>
          )}
          <p>
            New records are verified and active. Existing records are skipped
            without changes. Logos can be uploaded through the existing editor
            after import.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              csvDownload(`vehicle-${kind}-template.csv`, [
                columns[kind],
                kind === "brands"
                  ? [
                      "Example Motors",
                      "India",
                      "Example brand",
                      "https://example.com",
                    ]
                  : [
                      "Example Motors",
                      "City",
                      "SEDAN",
                      "PETROL",
                      "4",
                      "2020",
                      "",
                      "Example model",
                    ],
              ])
            }
          >
            Download template
          </Button>
        </div>
        {error && <InlineError message={error} />}
        <input
          ref={picker}
          type="file"
          className="sr-only"
          accept=".csv,text/csv"
          disabled={busy || reading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void choose(file);
            event.target.value = "";
          }}
        />
        <button
          className="image-dropzone"
          type="button"
          disabled={busy || reading}
          onClick={() => picker.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file && !busy && !reading) void choose(file);
          }}
        >
          <Icon name="upload" size={28} />
          <span className="image-upload-copy">
            <strong>
              {reading
                ? "Reading CSV…"
                : fileName || "Drop a CSV or click to browse"}
            </strong>
            <span>Local preview. Nothing is sent until you click Import.</span>
          </span>
        </button>
        {!!rows.length && (
          <>
            <p className="text-sm" role="status">
              {rows.length} rows · {rows.filter((r) => r.errors.length).length}{" "}
              invalid · {results.filter((r) => r.status === "CREATED").length}{" "}
              created · {results.filter((r) => r.status === "SKIPPED").length}{" "}
              skipped · {results.filter((r) => r.status === "FAILED").length}{" "}
              failed
              {busy ? ` · Processing ${results.length}/${rows.length}` : ""}
            </p>
            <div className="table-scroll max-h-80 overflow-y-auto">
              <table>
                <caption className="sr-only">
                  CSV preview and import results
                </caption>
                <thead>
                  <tr>
                    <th>Row</th>
                    {columns[kind].map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                    <th>Validation / result</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row}>
                      <td>{r.row}</td>
                      {columns[kind].map((c) => (
                        <td key={c}>{r.values[c] || "—"}</td>
                      ))}
                      <td>
                        {r.errors.length
                          ? r.errors.join(" ")
                          : resultByRow.has(r.row)
                            ? `${resultByRow.get(r.row)!.status}: ${resultByRow.get(r.row)!.message}`
                            : "Ready"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {finished && (
              <p className="field-hint">
                Import complete. Review any failed rows, fix them in your CSV
                and import again. Existing entries will be skipped.
              </p>
            )}
          </>
        )}
      </div>
      <div className="dialog-footer">
        <Button
          variant="secondary"
          disabled={busy || reading}
          onClick={onClose}
        >
          {started ? "Done" : "Cancel"}
        </Button>
        {!!results.length && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              csvDownload(`vehicle-${kind}-results.csv`, [
                ["row", "name", "status", "message"],
                ...results.map((r) => [
                  String(r.row),
                  r.name,
                  r.status,
                  r.message,
                ]),
              ])
            }
          >
            Export results
          </Button>
        )}
        <Button
          busy={busy}
          disabled={
            reading ||
            !rows.length ||
            rows.some((r) => r.errors.length) ||
            (finished && results.every((r) => r.status !== "FAILED"))
          }
          onClick={() => void submit()}
        >
          {started
            ? "Retry remaining rows"
            : `Import ${rows.length || ""} ${kind}`}
        </Button>
      </div>
    </Dialog>
  );
}

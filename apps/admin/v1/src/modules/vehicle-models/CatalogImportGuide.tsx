import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { InlineError } from "../../components/feedback/StateCard";
import { safeMessage } from "../../lib/api-client";
import {
  columns,
  csvDownload,
  requiredColumns,
  type ImportKind,
} from "./catalog-csv";
import {
  fieldGuides,
  fieldRules,
  importChecklist,
} from "./catalog-import-guide";

export function CatalogImportGuide({
  kind,
  disabled,
}: {
  kind: ImportKind;
  disabled: boolean;
}) {
  const pending = useRef<AbortController | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function download() {
    if (pending.current || disabled) return;
    const controller = new AbortController();
    pending.current = controller;
    setDownloading(true);
    setError(null);
    try {
      const template = await import("./catalog-template");
      controller.signal.throwIfAborted();
      await template.downloadCatalogTemplate(kind, controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted) setError(safeMessage(cause));
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setDownloading(false);
      }
    }
  }
  return (
    <section
      aria-labelledby="csv-guidelines"
      className="rounded-xl border border-line bg-white p-4 text-sm space-y-4"
    >
      <div>
        <h3 id="csv-guidelines" className="font-semibold">
          CSV guidelines
        </h3>
        <p className="text-muted mt-1">
          Required columns:{" "}
          <strong className="text-ink">
            {requiredColumns[kind].join(", ")}
          </strong>
          .
        </p>
      </div>
      <ul className="list-disc pl-5 space-y-2">
        {importChecklist(kind).map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <details className="border-t border-line pt-3">
        <summary className="cursor-pointer font-medium">
          Field rules & allowed values
        </summary>
        <dl className="mt-3 space-y-3">
          {fieldGuides(kind).map((field) => (
            <div key={field.field}>
              <dt className="font-medium">
                <code>{field.field}</code>{" "}
                <span className="text-muted">
                  ({field.required ? "required" : "optional"})
                </span>
              </dt>
              <dd className="text-muted mt-1">
                {field.description}
                {fieldRules(field) && (
                  <span className="block mt-1 text-ink">
                    {fieldRules(field)}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <div className="border-t border-line pt-3 space-y-3">
        <p>
          Share the <strong>whole template pack</strong> with whoever generates
          or refines your sheet. It contains a blank CSV, field guide, allowed
          values and a machine-readable import specification
          {kind === "models"
            ? ", plus the current active, verified brand names"
            : ""}
          .
        </p>
        <p className="text-muted">
          Extract the ZIP, fill <code>vehicle-{kind}.csv</code>, then import
          that CSV only.{" "}
          {kind === "models"
            ? "Download a fresh pack after changing brands."
            : "The blank file contains no example records."}
        </p>
        {error && <InlineError message={error} />}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={disabled}
            busy={downloading}
            onClick={() => void download()}
          >
            Download template pack
          </Button>
          <Button
            variant="ghost"
            disabled={disabled}
            onClick={() => csvDownload(`vehicle-${kind}.csv`, [columns[kind]])}
          >
            Blank CSV only
          </Button>
        </div>
      </div>
    </section>
  );
}

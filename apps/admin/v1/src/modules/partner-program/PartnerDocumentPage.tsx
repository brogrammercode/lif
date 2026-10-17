import { useEffect, useState } from "react";
import { PageHeading } from "../../components/layout/PageHeading";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { InlineError, LoadingState } from "../../components/feedback/StateCard";
import { RichDocumentEditor } from "../../components/ui/RichDocumentEditor";
import { DocumentPreview } from "../../components/ui/DocumentPreview";
import { apiRequest, safeMessage } from "../../lib/api-client";
import { useAdminResource } from "../../lib/useAdminResource";
import { PARTNER_API } from "./partner-program.api";
import type { PartnerDocument } from "./partner-program.type";

export function PartnerDocumentPage({
  kind,
}: {
  kind: "POLICY" | "CONFIRMATION";
}) {
  const resource = useAdminResource<PartnerDocument>(
    `${PARTNER_API}/documents/${kind}`,
  );
  const [title, setTitle] = useState(
    kind === "POLICY"
      ? "Partner Program Policy"
      : "Partner Program Confirmation",
  );
  const [html, setHtml] = useState("<p></p>");
  const [revision, setRevision] = useState(0);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (resource.data) {
      setTitle(resource.data.title);
      setHtml(resource.data.html);
      setRevision(resource.data.revision);
      setDirty(false);
    }
  }, [resource.data]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    const navigate = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.origin !== window.location.origin ||
        anchor.pathname === window.location.pathname
      )
        return;
      if (!window.confirm("Discard unsaved document changes?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);
  async function save(publish: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      if (!title.trim()) throw new Error("Enter a document title.");
      if (
        html.length > 3_500_000 ||
        new Blob([JSON.stringify({ title, html, revision, publish })]).size >
          4_200_000
      )
        throw new Error(
          "This save is too large. Reduce image sizes or save fewer new images at a time.",
        );
      const doc = await apiRequest<PartnerDocument>(
        `${PARTNER_API}/documents/${kind}`,
        {
          method: "PATCH",
          data: { title, html, revision, publish },
          timeoutMs: 120000,
        },
      );
      resource.setData(doc);
      setDirty(false);
      setNotice(
        publish
          ? "Published. New applicants will see this version."
          : "Draft saved. The published version is unchanged.",
      );
    } catch (cause) {
      setError(safeMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  if (resource.loading) return <LoadingState />;
  return (
    <>
      <PageHeading
        eyebrow="Partner program"
        context="Requirements"
        title={kind === "POLICY" ? "Policy" : "Confirmation"}
        description="Write, preview and publish the document applicants will read. Existing submissions retain their accepted version."
      >
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (
              !dirty ||
              window.confirm(
                "Discard unsaved changes and reload this document?",
              )
            )
              resource.refresh();
          }}
        >
          Reload
        </Button>
        <Button variant="secondary" onClick={() => setPreview(!preview)}>
          {preview ? "Edit document" : "Preview"}
        </Button>
        <Button
          variant="secondary"
          busy={busy}
          onClick={() => void save(false)}
        >
          Save draft
        </Button>
        <Button busy={busy} onClick={() => void save(true)}>
          Publish
        </Button>
      </PageHeading>
      {(resource.error || error) && (
        <InlineError message={error ?? resource.error!} />
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel document-panel">
        <div className="p-5 border-b border-line">
          <Field id="partner-document-title" label="Document title">
            <input
              id="partner-document-title"
              className="input"
              value={title}
              maxLength={200}
              disabled={busy}
              onChange={(event) => {
                setTitle(event.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <p className="field-hint mt-2">
            {dirty ? "Unsaved changes · " : ""}Draft revision {revision} ·{" "}
            {resource.data?.published_at
              ? `Published version ${resource.data.published_version}`
              : "Not published yet"}
          </p>
        </div>
        {preview ? (
          <DocumentPreview html={html} />
        ) : (
          <RichDocumentEditor
            value={html}
            disabled={busy}
            onChange={(value) => {
              setHtml(value);
              setDirty(true);
            }}
          />
        )}
      </section>
    </>
  );
}

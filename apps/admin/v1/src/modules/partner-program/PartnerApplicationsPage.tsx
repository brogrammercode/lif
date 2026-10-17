import { useEffect, useState } from "react";
import { PageHeading } from "../../components/layout/PageHeading";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Field } from "../../components/ui/Field";
import { Dialog } from "../../components/ui/Dialog";
import { DocumentPreview } from "../../components/ui/DocumentPreview";
import {
  InlineError,
  LoadingState,
  StateCard,
} from "../../components/feedback/StateCard";
import { apiRequest, safeMessage } from "../../lib/api-client";
import {
  useAdminResource,
  useDebouncedText,
  type Paged,
} from "../../lib/useAdminResource";
import {
  PARTNER_API,
  privateFile,
  downloadFile,
  uploadFinalPdf,
} from "./partner-program.api";
import {
  partnerStatus,
  type PartnerApplication,
  type PartnerAsset,
} from "./partner-program.type";

const statuses = [
  "all",
  "SUBMITTED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "CONFIRMATION_SUBMITTED",
  "CONFIRMATION_CHANGES_REQUESTED",
  "COMPLETED",
  "ACTIVATED",
];
const name = (app: PartnerApplication) =>
  [app.user.first_name, app.user.last_name].filter(Boolean).join(" ") ||
  app.contact_email;
const tone = (status: string) =>
  status === "REJECTED" || status === "FAILED"
    ? ("danger" as const)
    : [
          "APPROVED",
          "ACTIVATED",
          "COMPLETED",
          "SENT",
          "MANUALLY_SHARED",
        ].includes(status)
      ? ("active" as const)
      : ("warning" as const);

export function PartnerApplicationsPage({
  section,
}: {
  section: "applications" | "confirmations";
}) {
  const [query, setQuery] = useState("");
  const text = useDebouncedText(query);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const resource = useAdminResource<Paged<PartnerApplication>>(
    `${PARTNER_API}/applications?${new URLSearchParams({ section, query: text, status, page: String(page) })}`,
  );
  if (selected)
    return (
      <PartnerApplicationReview
        id={selected}
        onBack={() => {
          setSelected(null);
          resource.refresh();
        }}
      />
    );
  return (
    <>
      <PageHeading
        eyebrow="Partner program"
        context="Applications"
        title={section === "applications" ? "Applications" : "Confirmations"}
        description={
          section === "applications"
            ? "Review submitted details and documents, with a clear decision for each field."
            : "Review accepted confirmations, provide the final PDF, and manage delivery and activation."
        }
      >
        <Button variant="secondary" onClick={resource.refresh}>
          Refresh
        </Button>
      </PageHeading>
      {resource.error && <InlineError message={resource.error} />}
      <section className="panel">
        <div className="partner-toolbar">
          <input
            className="input"
            aria-label="Search applications"
            placeholder="Search name, email, phone or application ID"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Filter application status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {partnerStatus(item)}
              </option>
            ))}
          </select>
        </div>
        {resource.loading ? (
          <LoadingState />
        ) : !resource.data?.rows.length ? (
          <StateCard
            title="No applications found"
            message="Submitted partner applications will appear here."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Application</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.rows.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <strong>{name(app)}</strong>
                      <p className="text-xs text-muted">{app.contact_email}</p>
                      <p className="text-xs text-muted">{app.whatsapp_phone}</p>
                    </td>
                    <td>
                      {app.id}
                      <p className="text-xs text-muted">User {app.user_id}</p>
                    </td>
                    <td>
                      <Badge tone={tone(app.status)}>
                        {partnerStatus(app.status)}
                      </Badge>
                    </td>
                    <td>{new Date(app.submitted_at).toLocaleString()}</td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => setSelected(app.id)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="partner-toolbar">
          <span className="text-sm text-muted">
            {resource.data?.total ?? 0} applications · Page{" "}
            {resource.data?.page ?? page}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              disabled={
                !resource.data || resource.data.page * 20 >= resource.data.total
              }
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}

function PartnerApplicationReview({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const resource = useAdminResource<{
    application: PartnerApplication;
    assets: PartnerAsset[];
  }>(`${PARTNER_API}/applications/${id}`);
  const app = resource.data?.application;
  const assets = resource.data?.assets ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [confirmationReason, setConfirmationReason] = useState("");
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const [pdfPreview, setPdfPreview] = useState("");
  const [uploadedId, setUploadedId] = useState<string | null>(null);
  const [approval, setApproval] = useState<
    "application" | "confirmation" | null
  >(null);
  const [snapshot, setSnapshot] = useState<{
    title: string;
    html: string;
  } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [shareFile, setShareFile] = useState<File | null>(null);
  useEffect(() => {
    if (!finalFile) {
      setPdfPreview("");
      return;
    }
    const url = URL.createObjectURL(finalFile);
    setPdfPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [finalFile]);
  useEffect(() => {
    let active = true;
    setShareFile(null);
    if (app?.final_pdf_id)
      void privateFile(app.final_pdf_id)
        .then((file) => {
          if (active) setShareFile(file);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [app?.final_pdf_id]);
  async function action(task: () => Promise<unknown>, message = "Saved") {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await task();
      setNotice(message);
      setApproval(null);
      resource.refresh();
    } catch (cause) {
      setError(safeMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function openAsset(assetId: string) {
    await action(
      async () => downloadFile(await privateFile(assetId)),
      "File downloaded",
    );
  }
  function choosePdf(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 3_000_000) {
      setError("Choose a final PDF up to 3 MB.");
      return;
    }
    setError(null);
    setFinalFile(file);
    setUploadedId(null);
  }
  async function sharePdf() {
    if (!shareFile || !app) return;
    try {
      if (navigator.canShare?.({ files: [shareFile] }))
        await navigator.share({
          files: [shareFile],
          title: "1More Partner Program",
          text: "Your approved Partner Program confirmation is attached.",
        });
      else {
        downloadFile(shareFile);
        window.open(
          `https://wa.me/${app.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent("Your 1More Partner Program confirmation is ready. I am attaching your approved PDF.")}`,
          "_blank",
          "noopener,noreferrer",
        );
        setNotice(
          "PDF downloaded and WhatsApp opened. Attach the downloaded PDF, send it, then record the manual share below.",
        );
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(safeMessage(cause));
    }
  }
  if (resource.loading && !app) return <LoadingState />;
  if (!app)
    return (
      <StateCard
        error
        title="Application could not be loaded"
        message={resource.error ?? "Please try again."}
      >
        <Button onClick={resource.refresh}>Retry</Button>
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
      </StateCard>
    );
  const reviewing = ["SUBMITTED", "CHANGES_REQUESTED"].includes(app.status);
  const final = ["COMPLETED", "ACTIVATED"].includes(app.status);
  return (
    <>
      <PageHeading
        eyebrow="Partner program"
        context={app.id}
        title={name(app)}
        description={`${app.contact_email} · ${app.whatsapp_phone}`}
      >
        <Button variant="secondary" onClick={onBack}>
          Back to list
        </Button>
        <Button variant="secondary" disabled={busy} onClick={resource.refresh}>
          Refresh
        </Button>
      </PageHeading>
      {(error || resource.error) && (
        <InlineError message={error ?? resource.error!} />
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <section className="panel p-5 mb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone={tone(app.status)}>{partnerStatus(app.status)}</Badge>
          <span className="text-sm text-muted">
            User {app.user_id} · Revision {app.version}
          </span>
          <Button
            variant="secondary"
            onClick={() => setSnapshot(app.policy_snapshot)}
          >
            Accepted policy v{app.policy_snapshot.version}
          </Button>
        </div>
      </section>
      <div className="partner-answer-grid">
        {app.fields.map((field) => {
          const fileIds = Array.isArray(field.value)
            ? field.value.filter(
                (item): item is string => typeof item === "string",
              )
            : [];
          return (
            <section className="panel p-5" key={field.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">
                    {field.definition.category?.name ?? "Details"}
                  </p>
                  <h2 className="text-base font-semibold mt-1">
                    {field.definition.label}
                    {field.definition.is_required ? " *" : ""}
                  </h2>
                </div>
                <Badge tone={tone(field.status)}>
                  {partnerStatus(field.status)}
                </Badge>
              </div>
              <div className="partner-answer-value">
                {["FILE", "IMAGE", "PDF"].includes(
                  field.definition.field_type,
                ) ? (
                  fileIds.length ? (
                    fileIds.map((assetId) => (
                      <Button
                        key={assetId}
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void openAsset(assetId)}
                      >
                        {assets.find((a) => a.id === assetId)?.file_name ??
                          "Download document"}
                      </Button>
                    ))
                  ) : (
                    <span className="text-muted">Not provided</span>
                  )
                ) : typeof field.value === "boolean" ? (
                  field.value ? (
                    "Yes"
                  ) : (
                    "No"
                  )
                ) : field.value === null || field.value === "" ? (
                  <span className="text-muted">Not provided</span>
                ) : (
                  String(field.value)
                )}
              </div>
              {field.rejection_reason && (
                <p className="text-sm text-red-600 mt-3">
                  {field.rejection_reason}
                </p>
              )}
              {reviewing && (
                <div className="mt-4 space-y-3">
                  <Field
                    id={`reason-${field.id}`}
                    label="Rejection reason"
                    hint="Required when rejecting this field; visible to the applicant."
                  >
                    <textarea
                      id={`reason-${field.id}`}
                      className="input"
                      rows={2}
                      maxLength={2000}
                      value={reasons[field.id] ?? ""}
                      onChange={(event) =>
                        setReasons({
                          ...reasons,
                          [field.id]: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy || resource.loading}
                      onClick={() =>
                        void action(
                          () =>
                            apiRequest(
                              `${PARTNER_API}/applications/${id}/fields/${field.id}`,
                              {
                                method: "PATCH",
                                data: {
                                  version: app.version,
                                  decision: "APPROVED",
                                },
                              },
                            ),
                          "Field approved",
                        )
                      }
                    >
                      Approve field
                    </Button>
                    <Button
                      variant="danger"
                      disabled={
                        busy ||
                        resource.loading ||
                        !(reasons[field.id] ?? "").trim()
                      }
                      onClick={() =>
                        void action(
                          () =>
                            apiRequest(
                              `${PARTNER_API}/applications/${id}/fields/${field.id}`,
                              {
                                method: "PATCH",
                                data: {
                                  version: app.version,
                                  decision: "REJECTED",
                                  rejection_reason: reasons[field.id],
                                },
                              },
                            ),
                          "Correction requested",
                        )
                      }
                    >
                      Request correction
                    </Button>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {reviewing && (
        <section className="panel p-5 mt-5">
          <h2 className="text-lg font-semibold">Application decision</h2>
          <p className="field-hint my-3">
            Approve every required or provided field first. Approval moves the
            applicant to the published confirmation document.
          </p>
          <Button
            disabled={busy || resource.loading}
            onClick={() => setApproval("application")}
          >
            Approve application
          </Button>
        </section>
      )}
      {app.confirmation && (
        <section className="panel p-5 mt-5">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <h2 className="text-lg font-semibold">Confirmation</h2>
            <Badge tone={tone(app.confirmation.status)}>
              {partnerStatus(app.confirmation.status)}
            </Badge>
            <Button
              variant="secondary"
              onClick={() => setSnapshot(app.confirmation!.document_snapshot)}
            >
              Read accepted confirmation
            </Button>
          </div>
          <p className="my-3 text-sm">
            Accepted by <strong>{app.confirmation.signature_name}</strong> on{" "}
            {new Date(app.confirmation.accepted_at).toLocaleString()}.
          </p>
          {app.confirmation.rejection_reason && (
            <p className="text-sm text-red-600">
              {app.confirmation.rejection_reason}
            </p>
          )}
          {app.status === "CONFIRMATION_SUBMITTED" && (
            <div className="space-y-4">
              <div
                className="partner-file-drop"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  choosePdf(event.dataTransfer.files[0]);
                }}
              >
                <strong>Final approved PDF</strong>
                <p>
                  Drag your complete final document here, or choose a PDF up to
                  3 MB.
                </p>
                <input
                  type="file"
                  aria-label="Upload final approved PDF"
                  accept="application/pdf"
                  disabled={busy}
                  onChange={(event) => choosePdf(event.target.files?.[0])}
                />
                {finalFile && (
                  <p>
                    {finalFile.name} · {(finalFile.size / 1024).toFixed(0)} KB
                  </p>
                )}
              </div>
              {pdfPreview && (
                <iframe
                  className="document-preview"
                  title="Selected final PDF preview"
                  src={pdfPreview}
                />
              )}
              <Field
                id="confirmation-reason"
                label="Confirmation rejection reason"
              >
                <textarea
                  id="confirmation-reason"
                  className="input"
                  maxLength={2000}
                  rows={3}
                  value={confirmationReason}
                  onChange={(event) =>
                    setConfirmationReason(event.target.value)
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={busy || resource.loading || !finalFile}
                  onClick={() => setApproval("confirmation")}
                >
                  Approve confirmation and send PDF
                </Button>
                <Button
                  variant="danger"
                  disabled={
                    busy || resource.loading || !confirmationReason.trim()
                  }
                  onClick={() =>
                    void action(
                      () =>
                        apiRequest(
                          `${PARTNER_API}/applications/${id}/confirmation-review`,
                          {
                            method: "POST",
                            data: {
                              version: app.version,
                              decision: "REJECTED",
                              rejection_reason: confirmationReason,
                            },
                          },
                        ),
                      "Confirmation correction requested",
                    )
                  }
                >
                  Request correction
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
      {final && (
        <section className="panel p-5 mt-5 space-y-4">
          <h2 className="text-lg font-semibold">Final document and delivery</h2>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={busy || !app.final_pdf_id}
              onClick={() => void openAsset(app.final_pdf_id!)}
            >
              Download final PDF
            </Button>
            <Button disabled={!shareFile} onClick={() => void sharePdf()}>
              Share PDF / WhatsApp
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void action(
                  () =>
                    apiRequest(`${PARTNER_API}/applications/${id}/shared`, {
                      method: "POST",
                    }),
                  "Manual share recorded",
                )
              }
            >
              Record as manually shared
            </Button>
          </div>
          {app.deliveries.map((delivery) => (
            <div key={delivery.channel} className="partner-delivery">
              <div>
                <strong>
                  {delivery.channel === "EMAIL"
                    ? "Email"
                    : "Manual WhatsApp share"}
                </strong>
                <p className="field-hint">
                  {delivery.attempts} attempts
                  {delivery.sent_at
                    ? ` · ${new Date(delivery.sent_at).toLocaleString()}`
                    : ""}
                </p>
                {delivery.last_error && (
                  <p className="text-sm text-red-600 mt-1">
                    {delivery.last_error}
                  </p>
                )}
              </div>
              <Badge tone={tone(delivery.status)}>
                {partnerStatus(delivery.status)}
              </Badge>
              {delivery.channel === "EMAIL" && delivery.status !== "SENT" && (
                <Button
                  variant="secondary"
                  disabled={busy || delivery.status === "SENDING"}
                  onClick={() =>
                    void action(
                      () =>
                        apiRequest(
                          `${PARTNER_API}/applications/${id}/email-retry`,
                          { method: "POST" },
                        ),
                      "Email queued. Refresh shortly for delivery status.",
                    )
                  }
                >
                  Retry email
                </Button>
              )}
            </div>
          ))}
          <p className="field-hint">
            Sharing opens your device share sheet when PDF sharing is supported.
            Otherwise download the PDF and attach it manually in WhatsApp.
            Record sharing only after sending; this is not a delivery receipt.
          </p>
        </section>
      )}
      {app.status === "COMPLETED" && (
        <section className="panel p-5 mt-5">
          <h2 className="text-lg font-semibold">Driver activation</h2>
          <p className="field-hint my-3">
            The applicant’s first fresh login after final approval generates
            their code once. It has no expiry. After five incorrect attempts an
            administrator must unlock the same code.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || !app.activation_issued_at}
              onClick={() =>
                void action(async () => {
                  const result = await apiRequest<{ code: string }>(
                    `${PARTNER_API}/applications/${id}/activation-code`,
                    { method: "POST" },
                  );
                  setCode(result.code);
                }, "Code ready for manual sending")
              }
            >
              View activation code
            </Button>
            <Button
              variant="secondary"
              disabled={
                busy || !app.activation_issued_at || app.activation_attempts < 5
              }
              onClick={() =>
                void action(async () => {
                  const result = await apiRequest<{ code: string }>(
                    `${PARTNER_API}/applications/${id}/activation-unlock`,
                    { method: "POST" },
                  );
                  setCode(result.code);
                }, "Activation attempts unlocked")
              }
            >
              Unlock attempts
            </Button>
          </div>
          {!app.activation_issued_at && (
            <p className="field-hint mt-3">
              Waiting for the applicant to sign out and sign in again.
            </p>
          )}
        </section>
      )}
      {snapshot && (
        <Dialog title={snapshot.title} onClose={() => setSnapshot(null)}>
          <DocumentPreview html={snapshot.html} />
        </Dialog>
      )}
      {code && (
        <Dialog
          small
          title="Activation code"
          description="Send this code manually to the applicant. It has no expiry and can be used once."
          onClose={() => setCode(null)}
        >
          <p className="activation-code" aria-label="Activation code">
            {code}
          </p>
          <Button
            onClick={() =>
              void navigator.clipboard
                .writeText(code)
                .catch(() =>
                  setError(
                    "Clipboard access is unavailable. Copy the code manually.",
                  ),
                )
            }
          >
            Copy code
          </Button>
        </Dialog>
      )}
      {approval && (
        <Dialog
          small
          title={
            approval === "application"
              ? "Approve this application?"
              : "Approve confirmation and deliver the PDF?"
          }
          description={
            approval === "application"
              ? "The applicant will be able to read and accept their confirmation."
              : "The selected PDF will become the final document. Email will be queued; WhatsApp sharing remains manual."
          }
          busy={busy}
          onClose={() => setApproval(null)}
        >
          <div className="dialog-footer">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setApproval(null)}
            >
              Cancel
            </Button>
            <Button
              busy={busy}
              onClick={() =>
                void action(async () => {
                  if (approval === "application")
                    return apiRequest(
                      `${PARTNER_API}/applications/${id}/approve`,
                      {
                        method: "POST",
                        data: { version: app.version, decision: "APPROVED" },
                      },
                    );
                  if (!finalFile)
                    throw new Error("Select the final PDF first.");
                  const pdfId =
                    uploadedId ?? (await uploadFinalPdf(id, finalFile)).id;
                  setUploadedId(pdfId);
                  return apiRequest(
                    `${PARTNER_API}/applications/${id}/confirmation-review`,
                    {
                      method: "POST",
                      data: {
                        version: app.version,
                        decision: "APPROVED",
                        final_pdf_id: pdfId,
                      },
                    },
                  );
                }, "Approved")
              }
            >
              Confirm approval
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}

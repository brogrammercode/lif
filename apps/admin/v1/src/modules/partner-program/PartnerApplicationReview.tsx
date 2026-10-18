import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeading } from "../../components/layout/PageHeading";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Field } from "../../components/ui/Field";
import { Dialog } from "../../components/ui/Dialog";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import { Icon } from "../../components/ui/Icon";
import { FileUpload } from "../../components/ui/FileUpload";
import { DocumentPreview } from "../../components/ui/DocumentPreview";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import { Toast } from "../../components/feedback/Toast";
import { apiRequest, safeMessage } from "../../lib/api-client";
import { useAdminResource } from "../../lib/useAdminResource";
import {
  PARTNER_API,
  privateFile,
  downloadFile,
  uploadFinalPdf,
  validateFinalPdf,
} from "./partner-program.api";
import {
  partnerStatus,
  partnerTone as tone,
  canApproveApplication,
  type PartnerApplication,
  type PartnerAsset,
} from "./partner-program.type";
import "../../styles/partner-program.css";
const name = (app: PartnerApplication) =>
  [app.user.first_name, app.user.last_name].filter(Boolean).join(" ") ||
  app.contact_email;

export function PartnerApplicationReview({
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
  const dismissNotice = useCallback(() => setNotice(""), []);
  const pending = useRef(false);
  const pdfSelection = useRef(0);
  const [selectingPdf, setSelectingPdf] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareRevision, setShareRevision] = useState(0);
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
    setShareError(null);
    if (app?.final_pdf_id)
      void privateFile(app.final_pdf_id)
        .then((file) => {
          if (active) setShareFile(file);
        })
        .catch((cause) => {
          if (active) setShareError(safeMessage(cause));
        });
    return () => {
      active = false;
    };
  }, [app?.final_pdf_id, shareRevision]);
  async function action(task: () => Promise<unknown>, message = "Saved") {
    if (pending.current || resource.loading) return;
    pending.current = true;
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
      pending.current = false;
      setBusy(false);
    }
  }
  async function openAsset(assetId: string) {
    await action(
      async () => downloadFile(await privateFile(assetId)),
      "File downloaded",
    );
  }
  async function choosePdf(file: File) {
    if (busy || resource.loading) return;
    const selection = ++pdfSelection.current;
    setSelectingPdf(true);
    try {
      const validated = await validateFinalPdf(file);
      if (selection !== pdfSelection.current) return;
      setError(null);
      setFinalFile(validated);
      setUploadedId(null);
    } catch (cause) {
      if (selection === pdfSelection.current) setError(safeMessage(cause));
    } finally {
      if (selection === pdfSelection.current) setSelectingPdf(false);
    }
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
  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Copy the code manually.");
    }
  }
  if (resource.loading && !app)
    return (
      <CatalogPanel
        title="Application review"
        description="Loading the applicant's details and documents."
        busy
      >
        <TableLoading label="Loading application" />
      </CatalogPanel>
    );
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
    <div className="catalog-page partner-review-page">
      <PageHeading
        eyebrow="Partner program"
        context={app.id}
        title={name(app)}
        description={`${app.contact_email} · ${app.whatsapp_phone}`}
      >
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          <Icon name="arrowLeft" size={16} />
          Back to list
        </Button>
        <Button variant="secondary" disabled={busy} onClick={resource.refresh}>
          <Icon
            name={resource.loading ? "spinner" : "refresh"}
            className={resource.loading ? "animate-spin" : ""}
            size={16}
          />
          Refresh
        </Button>
      </PageHeading>
      {(error || resource.error) && (
        <InlineError message={error ?? resource.error!} />
      )}
      {notice && <Toast message={notice} onDismiss={dismissNotice} />}
      <CatalogPanel
        title="Application overview"
        description="Current review progress and the policy accepted by this applicant."
        busy={resource.loading}
      >
        <div className="review-panel-body">
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
        </div>
      </CatalogPanel>
      <div className="partner-answer-grid">
        {app.fields.map((field) => {
          const fileIds = Array.isArray(field.value)
            ? field.value.filter(
                (item): item is string => typeof item === "string",
              )
            : [];
          return (
            <CatalogPanel
              key={field.id}
              title={
                field.definition.label +
                (field.definition.is_required ? " *" : "")
              }
              description={field.definition.category?.name ?? "Details"}
              actions={
                <Badge tone={tone(field.status)}>
                  {partnerStatus(field.status)}
                </Badge>
              }
            >
              <div className="review-panel-body">
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
                        className="field"
                        rows={2}
                        maxLength={2000}
                        value={reasons[field.id] ?? ""}
                        disabled={busy || resource.loading}
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
                        variant="secondary"
                        disabled={
                          busy ||
                          resource.loading ||
                          field.status === "APPROVED"
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
              </div>
            </CatalogPanel>
          );
        })}
      </div>
      {reviewing && (
        <CatalogPanel
          title="Application decision"
          description="Approve every required or provided field before continuing to confirmation."
        >
          <div className="review-panel-body">
            {!canApproveApplication(app) && (
              <p className="field-hint mb-4">
                Some required or provided answers still need approval.
              </p>
            )}
            <Button
              disabled={busy || resource.loading || !canApproveApplication(app)}
              onClick={() => setApproval("application")}
            >
              Approve application
            </Button>
          </div>
        </CatalogPanel>
      )}
      {app.confirmation && (
        <CatalogPanel
          title="Confirmation"
          description="The applicant's named acceptance of the published confirmation."
          actions={
            <Badge tone={tone(app.confirmation.status)}>
              {partnerStatus(app.confirmation.status)}
            </Badge>
          }
        >
          <div className="review-panel-body editor-form">
            <div className="flex flex-wrap gap-3 items-center justify-between">
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
                <FileUpload
                  id="final-approved-pdf"
                  label="Final approved PDF"
                  file={finalFile}
                  disabled={busy || resource.loading || selectingPdf}
                  onSelect={(file) => void choosePdf(file)}
                  onRemove={() => {
                    pdfSelection.current++;
                    setFinalFile(null);
                    setUploadedId(null);
                  }}
                />
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
                    className="field"
                    disabled={busy || resource.loading}
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
                    disabled={
                      busy || resource.loading || selectingPdf || !finalFile
                    }
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
          </div>
        </CatalogPanel>
      )}
      {final && (
        <CatalogPanel
          title="Final document and delivery"
          description="Download the approved document, check email delivery and share it manually."
        >
          <div className="review-panel-body editor-form">
            {shareError && (
              <div className="space-y-3">
                <InlineError message={shareError} />
                <Button
                  variant="secondary"
                  onClick={() => setShareRevision((revision) => revision + 1)}
                >
                  Retry PDF for sharing
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                disabled={busy || !app.final_pdf_id}
                onClick={() => void openAsset(app.final_pdf_id!)}
              >
                Download final PDF
              </Button>
              <Button
                disabled={busy || !shareFile}
                onClick={() => void sharePdf()}
              >
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
                    disabled={
                      busy ||
                      resource.loading ||
                      (delivery.status === "SENDING" &&
                        (!delivery.claimed_at ||
                          Date.now() - Date.parse(delivery.claimed_at) <
                            300000))
                    }
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
              Sharing opens your device share sheet when PDF sharing is
              supported. Otherwise download the PDF and attach it manually in
              WhatsApp. Record sharing only after sending; this is not a
              delivery receipt.
            </p>
          </div>
        </CatalogPanel>
      )}
      {app.status === "COMPLETED" && (
        <CatalogPanel
          title="Driver activation"
          description="One code is generated when the approved applicant first signs in again."
        >
          <div className="review-panel-body">
            <p className="field-hint my-3">
              The applicant’s first fresh login after final approval generates
              their code once. It has no expiry. After five incorrect attempts
              an administrator must unlock the same code.
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
                  busy ||
                  !app.activation_issued_at ||
                  app.activation_attempts < 5
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
          </div>
        </CatalogPanel>
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
          {error && <InlineError message={error} />}
          <Button onClick={() => void copyCode()}>Copy code</Button>
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
          {error && <InlineError message={error} />}
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
              disabled={
                resource.loading ||
                (approval === "application" && !canApproveApplication(app))
              }
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
    </div>
  );
}

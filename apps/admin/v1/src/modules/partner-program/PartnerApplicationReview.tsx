import { Link } from "react-router-dom";
import { PrivateSelfie } from "./PrivateSelfie";
import { PrivateAssetPreview } from "./PrivateAssetPreview";
import { openWhatsAppWeb } from "./partner-sharing";
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
  uploadFinalPdf,
  validateFinalPdf,
  readPartnerDetail,
} from "./partner-program.api";
import {
  partnerStatus,
  partnerTone as tone,
  canApproveApplication,
  deliveryIsSending,
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
  }>(
    `${PARTNER_API}/applications/${encodeURIComponent(id)}`,
    readPartnerDetail,
  );
  const app =
    resource.data?.application.id === id
      ? resource.data.application
      : undefined;
  const assets = resource.data?.assets ?? [];
  const [busy, setBusy] = useState(false);
  const blocked = busy || resource.loading || !!resource.error;
  const [previewAsset, setPreviewAsset] = useState<string | null>(null);
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
  useEffect(() => {
    if (app?.status !== "COMPLETED") setCode(null);
  }, [app?.status]);
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
    if (pending.current || resource.loading || resource.error) return;
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
  function openAsset(assetId: string) {
    setPreviewAsset(assetId);
  }
  async function choosePdf(file: File) {
    if (blocked) return;
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
    if (
      !shareFile ||
      !app ||
      pending.current ||
      resource.loading ||
      resource.error
    )
      return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      openWhatsAppWeb(
        app.whatsapp_phone,
        "Your 1More Partner Program confirmation is ready. I am attaching your approved PDF.",
        shareFile,
      );
      setNotice(
        "PDF downloaded and WhatsApp Web opened. Attach the PDF manually, send it, then record the manual share below. If the browser blocked the new tab, allow popups and try again.",
      );
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(safeMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
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
  const groups = new Map<string, typeof app.fields>();
  for (const field of [...app.fields].sort(
    (left, right) =>
      Number(left.requirement_id === "__live_selfie__") -
        Number(right.requirement_id === "__live_selfie__") ||
      (left.definition.category?.sort_order ?? 0) -
        (right.definition.category?.sort_order ?? 0) ||
      (left.definition.category?.name ?? "").localeCompare(
        right.definition.category?.name ?? "",
      ) ||
      (left.definition.sort_order ?? 0) - (right.definition.sort_order ?? 0) ||
      left.requirement_id.localeCompare(right.requirement_id),
  )) {
    const category = field.definition.category?.name ?? "Other requirements";
    const group = groups.get(category) ?? [];
    group.push(field);
    groups.set(category, group);
  }
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
            {app.status === "ACTIVATED" && (
              <Link
                className="button button-secondary"
                to={
                  app.exit_request
                    ? `/partner-program/applications/exit-requests?request_id=${encodeURIComponent(app.exit_request.id)}`
                    : `/partner-program/applications/exit-requests?application_id=${encodeURIComponent(app.id)}`
                }
              >
                {app.exit_request
                  ? "Review exit request"
                  : "Start exit request"}
              </Link>
            )}
            <span className="text-sm text-muted">
              User {app.user_id} · Revision {app.version}
            </span>
            <Button
              variant="secondary"
              disabled={!app.policy_snapshot}
              onClick={() => setSnapshot(app.policy_snapshot)}
            >
              Accepted policy v{app.policy_snapshot?.version ?? "unavailable"}
            </Button>
          </div>
        </div>
      </CatalogPanel>
      {reviewing &&
        !app.fields.some((f) => f.requirement_id === "__live_selfie__") && (
          <CatalogPanel
            title="Live selfie required"
            description="This application predates camera capture. Request a selfie before approving it."
          >
            <div className="review-panel-body">
              <Button
                disabled={blocked}
                onClick={() =>
                  void action(
                    () =>
                      apiRequest(
                        PARTNER_API + "/applications/" + id + "/request-selfie",
                        { method: "POST", data: { version: app.version } },
                      ),
                    "Live selfie requested.",
                  )
                }
              >
                Request live selfie
              </Button>
            </div>
          </CatalogPanel>
        )}
      <div className="partner-answer-groups">
        {[...groups].map(([category, fields]) => (
          <section key={category} className="partner-answer-group">
            <header className="partner-answer-group-header">
              <div>
                <h2>{category}</h2>
                <p>
                  {fields.length} fields ?{" "}
                  {fields.filter((field) => field.status === "APPROVED").length}{" "}
                  approved ?{" "}
                  {fields.filter((field) => field.status === "REJECTED").length}{" "}
                  need correction
                </p>
              </div>
            </header>
            <div className="partner-answer-grid">
              {fields.map((field) => {
                const fileIds = Array.isArray(field.value)
                  ? field.value.filter(
                      (item): item is string => typeof item === "string",
                    )
                  : [];
                const missingRequiredValue =
                  field.definition.is_required &&
                  (field.value === null ||
                    field.value === undefined ||
                    field.value === "" ||
                    (Array.isArray(field.value) && !field.value.length));
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
                        {field.definition.capture_mode === "CAMERA" &&
                          fileIds[0] && <PrivateSelfie assetId={fileIds[0]} />}
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
                                {assets.find((a) => a.id === assetId)
                                  ?.file_name ?? "Preview document"}
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
                              disabled={blocked}
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
                                blocked ||
                                field.status === "APPROVED" ||
                                missingRequiredValue
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
                                blocked || !(reasons[field.id] ?? "").trim()
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
          </section>
        ))}
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
              disabled={blocked || !canApproveApplication(app)}
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
                disabled={!app.confirmation.document_snapshot}
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
                  disabled={blocked || selectingPdf}
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
                    disabled={blocked}
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
                    disabled={blocked || selectingPdf || !finalFile}
                    onClick={() => setApproval("confirmation")}
                  >
                    Approve confirmation and send PDF
                  </Button>
                  <Button
                    variant="danger"
                    disabled={blocked || !confirmationReason.trim()}
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
      {app.status === "EXITED" && (
        <CatalogPanel
          title="Driver exit completed"
          description="Driver operations are disabled. Application history and the original approval document are retained."
        >
          <div className="review-panel-body flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={blocked || !app.final_pdf_id}
              onClick={() => void openAsset(app.final_pdf_id!)}
            >
              Preview original approval PDF
            </Button>
            <Link
              className="button button-secondary"
              to="/partner-program/applications/exit-requests"
            >
              Exit Request &amp; Dues
            </Link>
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
                disabled={blocked || !app.final_pdf_id}
                onClick={() => void openAsset(app.final_pdf_id!)}
              >
                Preview final PDF
              </Button>
              <Button
                disabled={blocked || !shareFile}
                onClick={() => void sharePdf()}
              >
                WhatsApp Web + PDF
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
                    {delivery.channel === "ACTIVATION_EMAIL"
                      ? "Activation email"
                      : delivery.channel === "ACTIVATION_WHATSAPP"
                        ? "Activation WhatsApp (manual)"
                        : delivery.channel === "EXIT_EMAIL"
                          ? "Exit settlement email"
                          : delivery.channel === "EMAIL"
                            ? "Confirmation email"
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
                {(delivery.channel === "EMAIL" ||
                  (delivery.channel === "ACTIVATION_EMAIL" &&
                    app.status === "COMPLETED")) &&
                  delivery.status !== "SENT" && (
                    <Button
                      variant="secondary"
                      disabled={
                        blocked ||
                        !!resource.error ||
                        deliveryIsSending(delivery)
                      }
                      onClick={() =>
                        void action(
                          () =>
                            apiRequest(
                              `${PARTNER_API}/applications/${id}/${delivery.channel === "ACTIVATION_EMAIL" ? "activation-email" : "email-retry"}`,
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
              WhatsApp Web opens in your browser. Attach the downloaded PDF
              manually. Record sharing only after sending; this is not a
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
                disabled={blocked || !app.activation_issued_at}
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
                  blocked ||
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
      {previewAsset && (
        <PrivateAssetPreview
          assetId={previewAsset}
          onClose={() => setPreviewAsset(null)}
        />
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
          <div className="dialog-footer flex-wrap">
            <Button variant="secondary" onClick={() => void copyCode()}>
              Copy code
            </Button>
            <Button
              busy={busy}
              disabled={blocked}
              onClick={() =>
                void action(
                  () =>
                    apiRequest(
                      `${PARTNER_API}/applications/${id}/activation-email`,
                      { method: "POST" },
                    ),
                  "Activation email queued. Refresh to see delivery status.",
                )
              }
            >
              Send by email
            </Button>
            <Button
              variant="secondary"
              disabled={blocked}
              onClick={() => {
                try {
                  openWhatsAppWeb(
                    app.whatsapp_phone,
                    `Your 1More driver activation code is ${code}. Enter it in the 1More app after signing in. It has no expiry and can be used once.`,
                    shareFile,
                  );
                  setNotice(
                    "WhatsApp Web opened with the activation code. Attach the downloaded PDF if needed, then send the message manually.",
                  );
                } catch (cause) {
                  setError(safeMessage(cause));
                }
              }}
            >
              WhatsApp Web
            </Button>
            <Button
              variant="secondary"
              disabled={blocked}
              onClick={() =>
                void action(
                  () =>
                    apiRequest(
                      `${PARTNER_API}/applications/${id}/activation-shared`,
                      { method: "POST" },
                    ),
                  "Manual activation message recorded as sent.",
                )
              }
            >
              Mark WhatsApp message as sent
            </Button>
          </div>
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

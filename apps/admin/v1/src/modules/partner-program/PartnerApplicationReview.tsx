import { Link } from "react-router-dom";
import { ApplicationFieldsReview } from "./ApplicationFieldsReview";
import { PartnerReviewDetails, reviewDate } from "./PartnerReviewDetails";
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
import { DocumentDialog } from "../../components/ui/DocumentPreview";
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
  section,
}: {
  section: "applications" | "confirmations";
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
  const [showConfirmationCorrection, setShowConfirmationCorrection] =
    useState(false);
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
    version?: number;
  } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    if (app?.status !== "COMPLETED") setCode(null);
    if (app?.status && app.status !== "CONFIRMATION_SUBMITTED") {
      setFinalFile(null);
      setUploadedId(null);
      setShowConfirmationCorrection(false);
    }
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
    if (section === "confirmations" && app?.final_pdf_id)
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
  }, [app?.final_pdf_id, shareRevision, section]);
  async function action(task: () => Promise<unknown>, message = "Saved") {
    if (pending.current || resource.loading || resource.error) return false;
    pending.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await task();
      setNotice(message);
      setApproval(null);
      resource.refresh();
      return true;
    } catch (cause) {
      setError(safeMessage(cause));
      return false;
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
        title={
          section === "confirmations"
            ? "Confirmation review"
            : "Application review"
        }
        description={
          section === "confirmations"
            ? "Loading acceptance and delivery details."
            : "Loading the submitted application."
        }
        busy
      >
        <TableLoading
          label={
            section === "confirmations"
              ? "Loading confirmation"
              : "Loading application"
          }
        />
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
  const confirmationView = section === "confirmations";
  const reviewing =
    !confirmationView &&
    ["SUBMITTED", "CHANGES_REQUESTED"].includes(app.status);
  const final = ["COMPLETED", "ACTIVATED"].includes(app.status);
  return (
    <div className="catalog-page partner-review-page">
      <PageHeading
        eyebrow="Partner program"
        context={
          confirmationView ? "Confirmation review" : "Application review"
        }
        title={name(app)}
        description={
          confirmationView
            ? "Review acceptance, the final document and delivery."
            : "Review the submitted form and request corrections where needed."
        }
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
        title={confirmationView ? "Confirmation details" : "Applicant details"}
        description="Account and review information."
        busy={resource.loading}
        actions={
          <Badge tone={tone(app.status)}>{partnerStatus(app.status)}</Badge>
        }
      >
        <div className="review-panel-body">
          <PartnerReviewDetails
            items={[
              { label: "Email", value: app.contact_email },
              { label: "WhatsApp", value: app.whatsapp_phone },
              { label: "Application ID", value: app.id },
              {
                label: "User",
                value: (
                  <Link
                    className="review-text-link"
                    to={
                      "/users/" + encodeURIComponent(app.user_id) + "/personal"
                    }
                  >
                    {app.user_id}
                    <Icon name="arrowRight" size={13} />
                  </Link>
                ),
              },
              {
                label: confirmationView ? "Final approval" : "Submitted",
                value: reviewDate(
                  confirmationView ? app.completed_at : app.submitted_at,
                ),
              },
              {
                label: "Review status",
                value: partnerStatus(
                  confirmationView
                    ? (app.confirmation?.status ?? "Awaiting acceptance")
                    : app.status,
                ),
              },
            ]}
          />
          {!confirmationView && (
            <div className="partner-review-links">
              <Button
                variant="ghost"
                className="review-small-button"
                disabled={!app.policy_snapshot}
                onClick={() => setSnapshot(app.policy_snapshot)}
              >
                Accepted policy{" "}
                {app.policy_snapshot
                  ? "v" + app.policy_snapshot.version
                  : "unavailable"}
                <Icon name="arrowRight" size={14} />
              </Button>
              {[
                "APPROVED",
                "CONFIRMATION_SUBMITTED",
                "CONFIRMATION_CHANGES_REQUESTED",
                "COMPLETED",
                "ACTIVATED",
                "EXITED",
              ].includes(app.status) && (
                <Link
                  className="review-text-link"
                  to={
                    "/partner-program/applications/confirmations?application_id=" +
                    encodeURIComponent(id)
                  }
                >
                  Open confirmation
                  <Icon name="arrowRight" size={14} />
                </Link>
              )}
            </div>
          )}
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
      {!confirmationView && (
        <ApplicationFieldsReview
          fields={app.fields}
          assets={assets}
          reviewing={reviewing}
          blocked={blocked}
          busy={busy}
          error={error ?? resource.error}
          onPreview={openAsset}
          onReview={(fieldId, decision, reason) =>
            action(
              () =>
                apiRequest(
                  PARTNER_API + "/applications/" + id + "/fields/" + fieldId,
                  {
                    method: "PATCH",
                    data: {
                      version: app.version,
                      decision,
                      ...(reason ? { rejection_reason: reason } : {}),
                    },
                  },
                ),
              decision === "APPROVED"
                ? "Field approved"
                : "Correction requested",
            )
          }
        />
      )}
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
      {confirmationView && app.confirmation && (
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
            <PartnerReviewDetails
              items={[
                { label: "Signed by", value: app.confirmation.signature_name },
                {
                  label: "Accepted",
                  value: reviewDate(app.confirmation.accepted_at),
                },
                {
                  label: "Document",
                  value:
                    app.confirmation.document_snapshot?.title ??
                    "Snapshot unavailable",
                },
                {
                  label: "Document version",
                  value: app.confirmation.document_snapshot
                    ? "Version " + app.confirmation.document_snapshot.version
                    : "Not recorded",
                },
              ]}
            />
            <Button
              variant="secondary"
              className="confirmation-read-button"
              disabled={!app.confirmation.document_snapshot}
              onClick={() => setSnapshot(app.confirmation!.document_snapshot)}
            >
              <Icon name="search" size={14} />
              Read accepted confirmation
            </Button>
            {app.confirmation.rejection_reason && (
              <div className="application-correction">
                <strong>Correction requested</strong>
                <p>{app.confirmation.rejection_reason}</p>
              </div>
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
                <div className="flex flex-wrap gap-3">
                  <Button
                    disabled={
                      blocked ||
                      selectingPdf ||
                      !finalFile ||
                      !app.confirmation.document_snapshot
                    }
                    onClick={() => setApproval("confirmation")}
                  >
                    Approve confirmation and send PDF
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={blocked}
                    onClick={() => setShowConfirmationCorrection(true)}
                  >
                    Request correction
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CatalogPanel>
      )}
      {confirmationView && app.status === "EXITED" && (
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
      {confirmationView && final && (
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
            {app.deliveries
              .filter((delivery) => !delivery.channel.startsWith("EXIT_"))
              .map((delivery) => (
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
      {confirmationView && app.status === "COMPLETED" && (
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
      {confirmationView && !app.confirmation && (
        <StateCard
          title="Awaiting confirmation"
          message="The applicant has not submitted their confirmation yet. Their acceptance and final document will appear here."
        />
      )}
      {showConfirmationCorrection && (
        <Dialog
          small
          title="Request confirmation correction"
          description="Explain what the applicant needs to correct before submitting again."
          busy={busy}
          onClose={() => setShowConfirmationCorrection(false)}
        >
          <form
            className="editor-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                !blocked &&
                confirmationReason.trim() &&
                (await action(
                  () =>
                    apiRequest(
                      PARTNER_API +
                        "/applications/" +
                        id +
                        "/confirmation-review",
                      {
                        method: "POST",
                        data: {
                          version: app.version,
                          decision: "REJECTED",
                          rejection_reason: confirmationReason.trim(),
                        },
                      },
                    ),
                  "Confirmation correction requested",
                ))
              ) {
                setShowConfirmationCorrection(false);
                setConfirmationReason("");
              }
            }}
          >
            {error && <InlineError message={error} />}
            <Field
              id="confirmation-reason"
              label="Confirmation rejection reason"
            >
              <textarea
                autoFocus
                id="confirmation-reason"
                className="field"
                required
                disabled={blocked}
                maxLength={2000}
                rows={3}
                value={confirmationReason}
                onChange={(event) => setConfirmationReason(event.target.value)}
              />
            </Field>
            <div className="dialog-footer">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setShowConfirmationCorrection(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                busy={busy}
                disabled={blocked || !confirmationReason.trim()}
              >
                Request correction
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {previewAsset && (
        <PrivateAssetPreview
          assetId={previewAsset}
          onClose={() => setPreviewAsset(null)}
        />
      )}
      {snapshot && (
        <DocumentDialog
          title={snapshot.title}
          html={snapshot.html}
          version={snapshot.version}
          onClose={() => setSnapshot(null)}
        />
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
                blocked ||
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

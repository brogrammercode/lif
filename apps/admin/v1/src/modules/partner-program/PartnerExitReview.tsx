import { useEffect, useRef, useState } from "react";
import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Field } from "../../components/ui/Field";
import { Dialog } from "../../components/ui/Dialog";
import { FileUpload } from "../../components/ui/FileUpload";
import { InlineError, LoadingState } from "../../components/feedback/StateCard";
import { ApiError, apiRequest, safeMessage } from "../../lib/api-client";
import { useAdminResource } from "../../lib/useAdminResource";
import { openWhatsAppWeb } from "./partner-sharing";
import {
  partnerStatus,
  partnerTone,
  deliveryIsSending,
} from "./partner-program.type";
import {
  fileDataUrl,
  privateFile,
  downloadFile,
  validateFinalPdf,
} from "./partner-program.api";
import type { PartnerExit } from "./partner-exit.type";
const base = "/admin/partner-program/exit-requests";
export function PartnerExitReview({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const resource = useAdminResource<PartnerExit>(
    `${base}/${encodeURIComponent(id)}`,
  );
  const row = resource.data;
  const lock = useRef(false);
  const selectId = useRef(0);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [amount, setAmount] = useState("0");
  const [direction, setDirection] = useState("SETTLED");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [shareFile, setShareFile] = useState<File | null>(null);
  const [sharingError, setSharingError] = useState<string | null>(null);
  const [shareRevision, setShareRevision] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  useEffect(() => {
    if (row) {
      setNeedsReload(false);
      setAmount(row.dues_amount ?? "0");
      setDirection(row.dues_direction);
      setNotes(row.admin_notes ?? "");
      setReason(row.rejection_reason ?? "");
    }
  }, [row]);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    let active = true;
    setShareFile(null);
    setSharingError(null);
    if (row?.settlement_pdf_id)
      void privateFile(row.settlement_pdf_id)
        .then((value) => {
          if (active) setShareFile(value);
        })
        .catch((cause) => {
          if (active) setSharingError(safeMessage(cause));
        });
    return () => {
      active = false;
    };
  }, [row?.settlement_pdf_id, shareRevision]);
  async function action(task: () => Promise<unknown>, message: string) {
    if (lock.current || resource.loading || resource.error || needsReload)
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await task();
      setConfirm(false);
      setNotice(message);
      resource.refresh();
    } catch (cause) {
      setError(safeMessage(cause));
      if (cause instanceof ApiError && cause.code === "EXIT_REQUEST_CHANGED") {
        setNeedsReload(true);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function choose(value: File) {
    if (lock.current || resource.loading || resource.error || needsReload)
      return;
    const selection = ++selectId.current;
    setSelecting(true);
    try {
      const valid = await validateFinalPdf(value);
      if (selection === selectId.current) {
        setFile(valid);
        setUploaded(null);
        setError(null);
      }
    } catch (cause) {
      if (selection === selectId.current) setError(safeMessage(cause));
    } finally {
      if (selection === selectId.current) setSelecting(false);
    }
  }
  const validDues =
    /^\d{1,10}(\.\d{1,2})?$/.test(amount) &&
    (direction !== "SETTLED" || Number(amount) === 0);
  async function save(status: "REVIEWING" | "REJECTED" | "COMPLETED") {
    if (
      !row ||
      !validDues ||
      (status === "REJECTED" && !reason.trim()) ||
      (status === "COMPLETED" && (!file || selecting))
    )
      return;
    await action(
      async () => {
        let pdfId = uploaded;
        if (status === "COMPLETED" && file && !pdfId) {
          const pdf = await apiRequest<{ id: string }>(
            `${base}/${encodeURIComponent(id)}/assets`,
            {
              method: "POST",
              data: { file_name: file.name, data_url: await fileDataUrl(file) },
              timeoutMs: 90000,
            },
          );
          pdfId = pdf.id;
          setUploaded(pdfId);
        }
        await apiRequest(`${base}/${encodeURIComponent(id)}`, {
          method: "PATCH",
          data: {
            version: row.version,
            status,
            admin_notes: notes,
            rejection_reason: reason,
            dues_amount: amount,
            dues_direction: direction,
            ...(status === "COMPLETED" ? { settlement_pdf_id: pdfId } : {}),
          },
        });
      },
      status === "COMPLETED"
        ? "Exit completed. Driver operations disabled; settlement PDF released in the app."
        : "Exit review saved.",
    );
  }
  async function share() {
    if (
      !shareFile ||
      !row ||
      lock.current ||
      resource.loading ||
      resource.error ||
      needsReload
    )
      return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      openWhatsAppWeb(
        row.application.whatsapp_phone,
        "Your 1More exit settlement PDF is ready. I will attach the downloaded PDF here.",
        shareFile,
      );
      setNotice(
        "PDF downloaded and WhatsApp Web opened. Attach it manually and send, then mark it as shared.",
      );
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError"))
        setError(safeMessage(cause));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!row)
    return (
      <div className="catalog-page">
        <Button variant="secondary" onClick={onBack}>
          Back to exit requests
        </Button>
        {resource.error ? (
          <>
            <InlineError message={resource.error} />
            <Button onClick={resource.refresh}>Try again</Button>
          </>
        ) : (
          <LoadingState variant="form" label="Loading exit request" />
        )}
      </div>
    );
  const editable = ["REQUESTED", "REVIEWING"].includes(row.status);
  const blocked = busy || resource.loading || !!resource.error || needsReload;
  function reload() {
    if (busy || selecting) return;
    setConfirm(false);
    setError(null);
    resource.refresh();
  }
  const email = row.application.deliveries?.[0];
  const emailSending = email ? deliveryIsSending(email) : false;
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="PARTNER PROGRAM"
        context="Exit Request & Dues"
        title={
          [row.application.user.first_name, row.application.user.last_name]
            .filter(Boolean)
            .join(" ") || row.application.contact_email
        }
        description={`User ${row.application.user_id} · ${row.application.contact_email}`}
      >
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy || selecting || resource.loading}
            onClick={reload}
          >
            Reload latest review
          </Button>
          <Button
            variant="secondary"
            disabled={busy || selecting}
            onClick={onBack}
          >
            Back to requests
          </Button>
        </div>
      </PageHeading>
      {(error || resource.error) && (
        <InlineError message={error || resource.error!} />
      )}
      {(needsReload || resource.error) && (
        <p className="field-hint">
          Reload the latest review before saving. Reloading replaces unsaved
          review text; your selected PDF stays available.
        </p>
      )}
      {notice && (
        <p className="field-hint" role="status">
          {notice}
        </p>
      )}
      <CatalogPanel
        title="Exit review"
        description="Record the settlement and review the driver’s exit request."
        actions={
          <Badge tone={partnerTone(row.status)}>
            {partnerStatus(row.status)}
          </Badge>
        }
        busy={resource.loading}
      >
        <div className="review-panel-body space-y-4">
          <p className="whitespace-pre-wrap break-words">{row.reason}</p>
          <p className="field-hint">
            Requested {new Date(row.created_at).toLocaleString()} · Revision{" "}
            {row.version}
          </p>
          <Field id="exit-dues-direction" label="Dues direction">
            <select
              id="exit-dues-direction"
              className="field"
              value={direction}
              disabled={!editable || blocked}
              onChange={(e) => {
                setDirection(e.target.value);
                if (e.target.value === "SETTLED") setAmount("0");
              }}
            >
              <option value="SETTLED">Settled / no dues</option>
              <option value="DRIVER_OWES">Driver owes 1More</option>
              <option value="PAYABLE_TO_DRIVER">1More owes driver</option>
            </select>
          </Field>
          <Field
            id="exit-dues"
            label="Dues amount (INR)"
            hint="Enter the recorded balance. This records dues; it does not move money."
          >
            <input
              id="exit-dues"
              className="field"
              type="number"
              min="0"
              max="9999999999.99"
              step="0.01"
              value={amount}
              disabled={!editable || blocked || direction === "SETTLED"}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
          <Field id="exit-notes" label="Internal notes">
            <textarea
              id="exit-notes"
              className="field"
              rows={3}
              value={notes}
              maxLength={4000}
              disabled={!editable || blocked}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <Field
            id="exit-rejection"
            label="Rejection reason"
            hint="Required for rejection and visible to the driver."
          >
            <textarea
              id="exit-rejection"
              className="field"
              rows={2}
              value={reason}
              maxLength={2000}
              disabled={!editable || blocked}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {editable && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={blocked || !validDues}
                onClick={() => void save("REVIEWING")}
              >
                Save review
              </Button>
              <Button
                variant="danger"
                disabled={blocked || !validDues || !reason.trim()}
                onClick={() => void save("REJECTED")}
              >
                Reject request
              </Button>
            </div>
          )}
        </div>
      </CatalogPanel>
      <CatalogPanel
        title="Settlement PDF"
        description="Upload your prepared PDF. It becomes available to the driver when the exit is completed."
      >
        <div className="review-panel-body space-y-4">
          {editable && (
            <>
              <FileUpload
                id="exit-pdf"
                label="Settlement PDF"
                file={file}
                disabled={blocked || selecting}
                onSelect={(value) => void choose(value)}
                onRemove={() => {
                  ++selectId.current;
                  setFile(null);
                  setUploaded(null);
                }}
              />
              {preview && (
                <iframe
                  title="Settlement PDF preview"
                  className="w-full h-96 rounded-xl border border-line"
                  src={preview}
                />
              )}
              <p className="field-hint">
                Completion is final: driver operations are disabled. The
                driver’s account, history and settlement document remain
                available.
              </p>
              <Button
                disabled={blocked || selecting || !file || !validDues}
                onClick={() => setConfirm(true)}
              >
                Complete exit & release PDF
              </Button>
            </>
          )}
          {row.status === "REJECTED" && (
            <p className="field-hint">
              The driver can correct and resubmit this request. Rejected
              requests do not disable driver access.
            </p>
          )}
          {row.status === "COMPLETED" && (
            <>
              <p>
                Driver operations are disabled. Settlement completed{" "}
                {row.completed_at
                  ? new Date(row.completed_at).toLocaleString()
                  : ""}
                .
              </p>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>Email delivery</strong>
                  <Badge tone={partnerTone(email?.status ?? "PENDING")}>
                    {partnerStatus(email?.status ?? "PENDING")}
                  </Badge>
                  <span className="text-sm text-muted">
                    {email?.attempts ?? 0} attempts
                  </span>
                </div>
                {email?.last_error && (
                  <InlineError message={email.last_error} />
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={
                      busy ||
                      resource.loading ||
                      email?.status === "SENT" ||
                      emailSending
                    }
                    onClick={() =>
                      void action(
                        () =>
                          apiRequest(base + "/" + id + "/email-retry", {
                            method: "POST",
                          }),
                        "Settlement email queued. Refresh to see delivery status.",
                      )
                    }
                  >
                    Retry settlement email
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy || resource.loading}
                    onClick={resource.refresh}
                  >
                    Refresh status
                  </Button>
                </div>
              </div>
              {sharingError && (
                <>
                  <InlineError message={sharingError} />
                  <Button
                    variant="secondary"
                    onClick={() => setShareRevision((v) => v + 1)}
                  >
                    Retry PDF loading
                  </Button>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={!shareFile || busy}
                  onClick={() => {
                    if (shareFile) downloadFile(shareFile);
                  }}
                >
                  Download PDF
                </Button>
                <Button
                  disabled={!shareFile || busy}
                  onClick={() => void share()}
                >
                  WhatsApp Web + PDF
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy || !shareFile || !!row.manually_shared_at}
                  onClick={() =>
                    void action(
                      () =>
                        apiRequest(`${base}/${encodeURIComponent(id)}/shared`, {
                          method: "POST",
                        }),
                      "Manual sharing recorded.",
                    )
                  }
                >
                  Mark as shared
                </Button>
              </div>
              <p className="field-hint">
                {row.manually_shared_at
                  ? `Shared ${new Date(row.manually_shared_at).toLocaleString()}`
                  : "Attach the downloaded PDF manually in WhatsApp Web, send it, then record the share."}
              </p>
            </>
          )}
        </div>
      </CatalogPanel>
      {confirm && (
        <Dialog
          small
          title="Complete this driver’s exit?"
          description="This disables driver operations and releases the settlement PDF to the driver. Ensure the dues and document are correct."
          busy={busy}
          onClose={() => setConfirm(false)}
        >
          {error && <InlineError message={error} />}
          {(needsReload || resource.error) && (
            <Button
              variant="secondary"
              disabled={busy || resource.loading}
              onClick={reload}
            >
              Reload latest review
            </Button>
          )}
          <p className="text-sm">
            {row.currency} {amount} · {partnerStatus(direction)} · {file?.name}
          </p>
          <div className="dialog-footer">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              busy={busy}
              disabled={blocked || selecting || !validDues || !file}
              onClick={() => void save("COMPLETED")}
            >
              Complete exit
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

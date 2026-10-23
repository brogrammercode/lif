import { useState } from "react";
import { EditorSection } from "../../components/ui/EditorSection";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { InlineError } from "../../components/feedback/StateCard";
import { PrivateSelfie } from "./PrivateSelfie";
import {
  partnerStatus,
  partnerTone,
  type PartnerAnswer,
  type PartnerAsset,
} from "./partner-program.type";

export function ApplicationFieldsReview({
  title = "Submitted application",
  reasonLimit = 2000,
  fields,
  assets,
  reviewing,
  blocked,
  busy,
  error,
  onPreview,
  onReview,
}: {
  title?: string;
  reasonLimit?: number;
  fields: PartnerAnswer[];
  assets: PartnerAsset[];
  reviewing: boolean;
  blocked: boolean;
  busy: boolean;
  error: string | null;
  onPreview: (id: string) => void;
  onReview: (
    id: string,
    decision: "APPROVED" | "REJECTED",
    reason?: string,
  ) => Promise<boolean>;
}) {
  const [correction, setCorrection] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  const groups = new Map<string, PartnerAnswer[]>();
  for (const field of [...fields].sort(
    (a, b) =>
      Number(a.requirement_id === "__live_selfie__") -
        Number(b.requirement_id === "__live_selfie__") ||
      (a.definition.category?.sort_order ?? 0) -
        (b.definition.category?.sort_order ?? 0) ||
      (a.definition.category?.name ?? "").localeCompare(
        b.definition.category?.name ?? "",
      ) ||
      (a.definition.sort_order ?? 0) - (b.definition.sort_order ?? 0) ||
      a.requirement_id.localeCompare(b.requirement_id),
  )) {
    const category = field.definition.category?.name || "Other requirements";
    groups.set(category, [...(groups.get(category) ?? []), field]);
  }
  const selected = fields.find((field) => field.id === correction?.id);
  return (
    <>
      <div className="personal-card application-form">
        <div className="partner-form-heading">
          <div>
            <h2>{title}</h2>
            <p className="field-hint">
              Review details and documents by section.
            </p>
          </div>
          <span className="count-tag">
            {fields.filter((f) => f.status === "APPROVED").length} /{" "}
            {fields.length} approved
          </span>
        </div>
        {[...groups].map(([category, answers], index) => (
          <EditorSection
            key={category}
            step={String(index + 1).padStart(2, "0")}
            title={category}
          >
            <dl className="form-grid application-fields">
              {answers.map((field) => {
                const files = Array.isArray(field.value)
                  ? field.value.filter(
                      (id): id is string => typeof id === "string",
                    )
                  : [];
                const document = ["IMAGE", "PDF", "FILE"].includes(
                  field.definition.field_type,
                );
                const missing =
                  field.value === null ||
                  field.value === undefined ||
                  field.value === "" ||
                  (Array.isArray(field.value) && !field.value.length);
                return (
                  <div
                    key={field.id}
                    className={`application-field${field.definition.field_type === "TEXT" ? " form-full" : ""}`}
                    data-field-id={field.id}
                  >
                    <dt>
                      <span>
                        {field.definition.label}
                        {field.definition.is_required && (
                          <span className="text-muted"> *</span>
                        )}
                      </span>
                      <Badge tone={partnerTone(field.status)}>
                        {partnerStatus(field.status)}
                      </Badge>
                    </dt>
                    <dd>
                      {document ? (
                        <div className="application-files">
                          {field.definition.capture_mode === "CAMERA" &&
                            files[0] && (
                              <div className="application-field-selfie">
                                <PrivateSelfie assetId={files[0]} />
                              </div>
                            )}
                          {files.length ? (
                            files.map((id, index) => (
                              <Button
                                key={id}
                                variant="secondary"
                                className="application-file"
                                disabled={busy}
                                onClick={() => onPreview(id)}
                              >
                                <Icon name="search" size={14} />
                                <span>
                                  {assets.find((asset) => asset.id === id)
                                    ?.file_name ??
                                    `Preview document ${index + 1}`}
                                </span>
                              </Button>
                            ))
                          ) : (
                            <div className="partner-read-value text-muted">
                              Not provided
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={`partner-read-value${missing ? " text-muted" : ""}`}
                        >
                          {missing
                            ? "Not provided"
                            : typeof field.value === "boolean"
                              ? field.value
                                ? "Yes"
                                : "No"
                              : String(field.value)}
                        </div>
                      )}
                      {field.rejection_reason && (
                        <p className="application-correction" role="note">
                          {field.rejection_reason}
                        </p>
                      )}
                      {reviewing && (
                        <div className="application-field-actions">
                          <Button
                            variant="ghost"
                            className="review-small-button"
                            aria-label={`Approve field: ${field.definition.label}`}
                            disabled={
                              blocked ||
                              field.status === "APPROVED" ||
                              (field.definition.is_required && missing)
                            }
                            onClick={() => void onReview(field.id, "APPROVED")}
                          >
                            <Icon name="check" size={14} />
                            Approve field
                            <span className="sr-only">
                              : {field.definition.label}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            className="review-small-button"
                            aria-label={`Request correction: ${field.definition.label}`}
                            disabled={blocked}
                            onClick={() =>
                              setCorrection({
                                id: field.id,
                                reason: field.rejection_reason ?? "",
                              })
                            }
                          >
                            <Icon name="edit" size={14} />
                            Request correction
                            <span className="sr-only">
                              : {field.definition.label}
                            </span>
                          </Button>
                        </div>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </EditorSection>
        ))}
      </div>
      {correction && selected && (
        <Dialog
          small
          title={`Request correction · ${selected.definition.label}`}
          description="Explain what needs to change. The applicant will see this reason alongside their answer."
          busy={busy}
          onClose={() => setCorrection(null)}
        >
          <form
            className="editor-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (
                !blocked &&
                correction.reason.trim() &&
                (await onReview(
                  selected.id,
                  "REJECTED",
                  correction.reason.trim(),
                ))
              )
                setCorrection(null);
            }}
          >
            {error && <InlineError message={error} />}
            <Field id="field-correction-reason" label="Rejection reason">
              <textarea
                autoFocus
                id="field-correction-reason"
                className="field"
                required
                rows={3}
                maxLength={reasonLimit}
                disabled={blocked}
                value={correction.reason}
                onChange={(event) =>
                  setCorrection({ ...correction, reason: event.target.value })
                }
              />
            </Field>
            <div className="dialog-footer">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => setCorrection(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                busy={busy}
                disabled={blocked || !correction.reason.trim()}
              >
                Request correction
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}

import { useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { InlineError, LoadingState } from "../../components/feedback/StateCard";
import { apiRequest } from "../../lib/api-client";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";
import { PARTNER_API } from "./partner-program.api";

type Preview = {
  id: string;
  version: number;
  status: string;
  name: string;
  contact_email: string;
  allowed: boolean;
  blocked_reason: string | null;
  counts: Record<
    | "fields"
    | "confirmations"
    | "deliveries"
    | "uploads"
    | "upload_bytes"
    | "notifications",
    number
  >;
};
function decode(value: unknown): Preview {
  const v = value as Preview;
  if (
    !v ||
    typeof v.id !== "string" ||
    !Number.isSafeInteger(v.version) ||
    v.version < 1 ||
    typeof v.name !== "string" ||
    typeof v.contact_email !== "string" ||
    typeof v.allowed !== "boolean" ||
    !v.counts ||
    ![
      "fields",
      "confirmations",
      "deliveries",
      "uploads",
      "upload_bytes",
      "notifications",
    ].every(
      (key) =>
        Number.isSafeInteger(v.counts[key as keyof Preview["counts"]]) &&
        v.counts[key as keyof Preview["counts"]] >= 0,
    ) ||
    (v.allowed
      ? v.blocked_reason !== null
      : typeof v.blocked_reason !== "string")
  )
    throw new Error(
      "The deletion preview could not be verified. Refresh it before continuing.",
    );
  return v;
}
export function DeleteApplicationDialog({
  id,
  onClose,
  onDeleted,
}: {
  id: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const resource = useAdminResource<Preview>(
    `${PARTNER_API}/applications/${encodeURIComponent(id)}/deletion-preview`,
    decode,
  );
  const save = useAdminSave();
  const [confirmation, setConfirmation] = useState("");
  const preview = resource.data;
  const ready =
    !resource.loading &&
    !resource.error &&
    preview?.id === id &&
    preview.allowed;
  return (
    <Dialog
      compact
      title="Delete partner application?"
      description="Permanent deletion is available only before driver activation."
      busy={save.busy}
      onClose={onClose}
    >
      <form
        className="trip-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !ready ||
            confirmation.trim().toLowerCase() !==
              preview.contact_email.trim().toLowerCase()
          )
            return;
          void save.run(
            (signal) =>
              apiRequest(
                `${PARTNER_API}/applications/${encodeURIComponent(id)}`,
                {
                  method: "DELETE",
                  signal,
                  data: {
                    version: preview.version,
                    confirmation: confirmation.trim(),
                  },
                },
              ),
            onDeleted,
          );
        }}
        id="delete-partner-application"
      >
        {resource.loading ? (
          <LoadingState variant="detail" label="Loading deletion preview" />
        ) : resource.error ? (
          <InlineError message={resource.error} />
        ) : (
          preview && (
            <>
              <div className="deletion-identity">
                <strong>{preview.name}</strong>
                <span>{preview.contact_email}</span>
                <small>Application {id}</small>
              </div>
              {!preview.allowed && (
                <InlineError message={preview.blocked_reason!} />
              )}
              <section className="deletion-scope">
                <h3>Will be permanently deleted</h3>
                <dl>
                  {(
                    [
                      [
                        "Submitted fields & review decisions",
                        preview.counts.fields,
                      ],
                      ["Signed confirmation", preview.counts.confirmations],
                      [
                        "Documents, live selfie & final PDF uploads",
                        preview.counts.uploads,
                      ],
                      [
                        "Delivery & manual-sharing records",
                        preview.counts.deliveries,
                      ],
                      [
                        "Application notifications & queued emails",
                        preview.counts.notifications,
                      ],
                    ] as [string, number][]
                  ).map(([label, count]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{count}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Also removes the application's policy/confirmation snapshots,
                  acceptance data and activation code. Uploaded bytes:{" "}
                  {(preview.counts.upload_bytes / 1048576).toFixed(1)} MB.
                </p>
              </section>
              <p className="field-hint">
                The user account, vehicles, rides and shared configuration stay.
                Previously sent emails and downloaded files cannot be recalled.
                The deletion is audited for 7 days.
              </p>
              {preview.allowed && (
                <Field
                  id="delete-application-confirmation"
                  label="Confirm applicant email"
                  hint={`Type ${preview.contact_email} to confirm.`}
                >
                  <input
                    id="delete-application-confirmation"
                    className="field"
                    type="text"
                    autoComplete="off"
                    value={confirmation}
                    disabled={save.busy}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                </Field>
              )}
            </>
          )
        )}
        {save.error && <InlineError message={save.error} />}
      </form>
      <div className="dialog-footer">
        <Button variant="secondary" disabled={save.busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={save.busy || resource.loading}
          onClick={() => {
            setConfirmation("");
            resource.refresh();
          }}
        >
          Refresh preview
        </Button>
        <Button
          variant="danger"
          type="submit"
          form="delete-partner-application"
          busy={save.busy}
          disabled={
            !ready ||
            confirmation.trim().toLowerCase() !==
              preview?.contact_email.trim().toLowerCase()
          }
        >
          Delete application
        </Button>
      </div>
    </Dialog>
  );
}

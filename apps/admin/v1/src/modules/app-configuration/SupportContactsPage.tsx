import { useEffect, useState } from "react";
import { PageHeading } from "../../components/layout/PageHeading";
import {
  InlineError,
  LoadingState,
  StateCard,
} from "../../components/feedback/StateCard";
import { Button } from "../../components/ui/Button";
import { EditorSection } from "../../components/ui/EditorSection";
import { Field } from "../../components/ui/Field";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";
import { ConfigurationMetadata } from "./ConfigurationMetadata";
import { decodeSupportContacts } from "./configuration.validation";
import { saveSupportContacts, type SupportContacts } from "./configuration.api";
const fields = [
  {
    key: "support_phone",
    label: "Support phone",
    hint: "International format including + and country code.",
    type: "tel",
    max: 16,
  },
  {
    key: "emergency_phone",
    label: "Emergency / urgent help phone",
    hint: "A configured short code or international number. Publish only numbers your operation can support.",
    type: "tel",
    max: 16,
  },
  {
    key: "whatsapp_phone",
    label: "WhatsApp support number",
    hint: "International format; opens a user-initiated WhatsApp conversation.",
    type: "tel",
    max: 16,
  },
  {
    key: "support_email",
    label: "Support email",
    hint: "Public email address shown in the mobile app.",
    type: "email",
    max: 254,
  },
  {
    key: "support_hours",
    label: "Support hours",
    hint: "Include timezone and days of operation.",
    type: "text",
    max: 200,
  },
] as const;
export function SupportContactsPage() {
  const resource = useAdminResource<SupportContacts>(
    "/admin/support/configuration/contact",
    decodeSupportContacts,
  );
  const save = useAdminSave();
  const { clearError } = save;
  const [draft, setDraft] = useState<SupportContacts | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (resource.data) {
      clearError();
      setDraft(resource.data);
    }
  }, [resource.data, clearError]);
  if (resource.loading || (!draft && !resource.error))
    return <LoadingState variant="form" label="Loading support contacts" />;
  if (resource.error || !draft)
    return (
      <StateCard
        error
        title="Could not load support contacts"
        message={resource.error ?? "Configuration unavailable."}
      >
        <Button onClick={resource.refresh}>Retry</Button>
      </StateCard>
    );
  return (
    <div className="personal-page">
      <PageHeading
        eyebrow="Support / Configure"
        title="Contact"
        description="Publish the contact details and instructions shown to riders and drivers."
      />
      <ConfigurationMetadata value={draft} />
      <form
        className="personal-card editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(
            async (signal) => {
              const value = decodeSupportContacts(
                await saveSupportContacts(draft, signal),
              );
              resource.setData(value);
            },
            () => setSaved(true),
          );
        }}
      >
        <fieldset disabled={save.busy} className="contents">
          <EditorSection
            step="01"
            title="Public contact channels"
            description="Leave unavailable channels blank. No credentials or provider secrets belong here."
          >
            <div className="form-grid">
              {fields.map((field) => (
                <Field
                  key={field.key}
                  id={`contact-${field.key}`}
                  label={field.label}
                  hint={field.hint}
                >
                  <input
                    className="field"
                    id={`contact-${field.key}`}
                    type={field.type}
                    maxLength={field.max}
                    value={draft[field.key] ?? ""}
                    onChange={(event) => {
                      setSaved(false);
                      setDraft(
                        (current) =>
                          current && {
                            ...current,
                            [field.key]: event.target.value,
                          },
                      );
                    }}
                  />
                </Field>
              ))}
            </div>
          </EditorSection>
          <EditorSection step="02" title="Help instructions">
            <Field
              id="contact-instructions"
              label="Instructions"
              hint="Explain expected response times and when to use urgent help."
            >
              <textarea
                className="field"
                id="contact-instructions"
                rows={4}
                maxLength={2000}
                value={draft.instructions ?? ""}
                onChange={(event) => {
                  setSaved(false);
                  setDraft(
                    (current) =>
                      current && {
                        ...current,
                        instructions: event.target.value,
                      },
                  );
                }}
              />
            </Field>
          </EditorSection>
          {save.error && <InlineError message={save.error} />}
          {save.error && (
            <Button
              variant="secondary"
              onClick={() => {
                setSaved(false);
                resource.refresh();
              }}
            >
              Reload latest contacts
            </Button>
          )}
          {saved && (
            <p role="status" className="text-brand">
              Support contacts saved.
            </p>
          )}
          <div className="dialog-footer">
            <Button type="submit" busy={save.busy}>
              Save contacts
            </Button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

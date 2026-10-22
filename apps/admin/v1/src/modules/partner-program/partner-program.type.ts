export type PartnerDocument = {
  id: string;
  kind: string;
  title: string;
  html: string;
  revision: number;
  published_title: string | null;
  published_html: string | null;
  published_version: number;
  published_at: string | null;
};
export type PartnerAsset = {
  id: string;
  file_name: string;
  mime_type: string;
  size: number;
  purpose: string;
  field_id: string | null;
};
export type PartnerDefinition = {
  id: string;
  label: string;
  field_type: string;
  is_required: boolean;
  description?: string;
  category?: { id?: string; name: string; sort_order?: number };
  sort_order?: number;
  capture_mode?: "CAMERA";
};
export type PartnerAnswer = {
  id: string;
  requirement_id: string;
  definition: PartnerDefinition;
  value: unknown;
  status: string;
  rejection_reason: string | null;
};
export type DocumentSnapshot = { title: string; html: string; version: number };
export type PartnerApplication = {
  id: string;
  user_id: string;
  version: number;
  status: string;
  contact_email: string;
  whatsapp_phone: string;
  submitted_at: string;
  completed_at: string | null;
  final_pdf_id: string | null;
  exit_request?: { id: string; status: string; version: number } | null;
  activation_issued_at: string | null;
  activation_attempts: number;
  user: { first_name: string | null; last_name: string | null; email?: string };
  policy_snapshot: DocumentSnapshot | null;
  confirmation_document: DocumentSnapshot | null;
  fields: PartnerAnswer[];
  confirmation: {
    status: string;
    signature_name: string;
    accepted_at: string;
    rejection_reason: string | null;
    document_snapshot: DocumentSnapshot | null;
  } | null;
  deliveries: {
    channel: string;
    status: string;
    attempts: number;
    last_error: string | null;
    sent_at: string | null;
    claimed_at?: string | null;
    updated_at?: string | null;
  }[];
};
export const deliveryIsSending = (delivery: {
  status: string;
  claimed_at?: string | null;
  updated_at?: string | null;
}) =>
  delivery.status === "SENDING" &&
  Date.now() - Date.parse(delivery.claimed_at ?? delivery.updated_at ?? "") <
    300000;
export const partnerStatus = (value: string | null | undefined) =>
  (value ?? "Unknown")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());

export type PartnerApplicationSummary = Pick<
  PartnerApplication,
  | "id"
  | "user_id"
  | "status"
  | "version"
  | "contact_email"
  | "whatsapp_phone"
  | "submitted_at"
  | "completed_at"
  | "activation_issued_at"
  | "activation_attempts"
  | "user"
  | "deliveries"
>;

export const partnerTone = (
  status: string,
): "active" | "inactive" | "warning" | "danger" =>
  status === "EXITED"
    ? "inactive"
    : status === "REJECTED" ||
        status === "FAILED" ||
        status.includes("CHANGES_REQUESTED")
      ? "danger"
      : [
            "APPROVED",
            "ACTIVATED",
            "COMPLETED",
            "SENT",
            "MANUALLY_SHARED",
          ].includes(status)
        ? "active"
        : "warning";

export const canApproveApplication = (app: PartnerApplication) =>
  !!app.policy_snapshot &&
  ["SUBMITTED", "CHANGES_REQUESTED"].includes(app.status) &&
  app.fields.some((field) => field.requirement_id === "__live_selfie__") &&
  app.fields.every((field) => {
    if (field.status === "REJECTED") return false;
    const provided =
      field.value !== null &&
      field.value !== undefined &&
      field.value !== "" &&
      (!Array.isArray(field.value) || field.value.length > 0);
    if (field.definition.is_required && !provided) return false;
    return (
      (!field.definition.is_required && !provided) ||
      field.status === "APPROVED"
    );
  });

import { apiRequest } from "../../lib/api-client";
import type {
  PartnerAsset,
  PartnerApplication,
  PartnerAnswer,
  DocumentSnapshot,
} from "./partner-program.type";
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
function documentSnapshot(value: unknown): DocumentSnapshot | null {
  const snapshot = record(value);
  return snapshot &&
    typeof snapshot.title === "string" &&
    typeof snapshot.html === "string" &&
    Number.isSafeInteger(snapshot.version) &&
    Number(snapshot.version) > 0
    ? (snapshot as DocumentSnapshot)
    : null;
}
// Decode legacy/partial snapshots before rendering. A malformed response becomes
// the existing retry state instead of crashing the entire admin workspace.
export function readPartnerDetail(value: unknown): {
  application: PartnerApplication;
  assets: PartnerAsset[];
} {
  const response = record(value),
    app = record(response?.application);
  if (
    !app ||
    typeof app.id !== "string" ||
    typeof app.user_id !== "string" ||
    typeof app.status !== "string" ||
    typeof app.contact_email !== "string" ||
    typeof app.whatsapp_phone !== "string" ||
    !Number.isSafeInteger(app.version) ||
    Number(app.version) < 1 ||
    !Array.isArray(app.fields)
  )
    throw new Error(
      "The application returned incomplete details. Refresh this review or reopen it from the applications list.",
    );
  const fields: PartnerAnswer[] = app.fields.map((value) => {
    const answer = record(value);
    const definition = record(answer?.definition);
    if (
      !answer ||
      typeof answer.id !== "string" ||
      typeof answer.requirement_id !== "string" ||
      typeof answer.status !== "string" ||
      !definition ||
      typeof definition.label !== "string" ||
      typeof definition.field_type !== "string" ||
      typeof definition.is_required !== "boolean"
    )
      throw new Error(
        "A submitted field has an invalid definition. The application needs its saved snapshot restored before it can be reviewed.",
      );
    const category =
      typeof definition.category === "string"
        ? { name: definition.category }
        : record(definition.category);
    return {
      ...answer,
      value: answer.value ?? null,
      definition: {
        ...definition,
        category:
          category && typeof category.name === "string"
            ? {
                name: category.name,
                ...(typeof category.id === "string" ? { id: category.id } : {}),
                ...(typeof category.sort_order === "number" &&
                Number.isFinite(category.sort_order)
                  ? { sort_order: category.sort_order }
                  : {}),
              }
            : undefined,
        sort_order:
          typeof definition.sort_order === "number" &&
          Number.isFinite(definition.sort_order)
            ? definition.sort_order
            : 0,
        description:
          typeof definition.description === "string"
            ? definition.description
            : undefined,
      },
      rejection_reason:
        typeof answer.rejection_reason === "string"
          ? answer.rejection_reason
          : null,
    } as PartnerAnswer;
  });
  const confirmation = record(app.confirmation);
  if (
    confirmation &&
    (typeof confirmation.status !== "string" ||
      typeof confirmation.signature_name !== "string" ||
      typeof confirmation.accepted_at !== "string")
  )
    throw new Error(
      "The saved confirmation is incomplete. Refresh the application before reviewing it.",
    );
  const user = record(app.user);
  const normalized = {
    ...app,
    fields,
    policy_snapshot: documentSnapshot(app.policy_snapshot),
    confirmation_document: documentSnapshot(app.confirmation_document),
    user: {
      first_name: typeof user?.first_name === "string" ? user.first_name : null,
      last_name: typeof user?.last_name === "string" ? user.last_name : null,
      ...(typeof user?.email === "string" ? { email: user.email } : {}),
    },
    confirmation: confirmation
      ? {
          ...confirmation,
          document_snapshot: documentSnapshot(confirmation.document_snapshot),
          rejection_reason:
            typeof confirmation.rejection_reason === "string"
              ? confirmation.rejection_reason
              : null,
        }
      : null,
    deliveries: Array.isArray(app.deliveries)
      ? app.deliveries.filter((delivery) => {
          const row = record(delivery);
          return (
            row &&
            typeof row.channel === "string" &&
            typeof row.status === "string"
          );
        })
      : [],
  } as PartnerApplication;
  const assets = Array.isArray(response?.assets)
    ? (response.assets.filter((asset) => {
        const row = record(asset);
        return (
          row && typeof row.id === "string" && typeof row.file_name === "string"
        );
      }) as PartnerAsset[])
    : [];
  return { application: normalized, assets };
}
export const PARTNER_API = "/admin/partner-program";
export const fileDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read this file."));
    reader.onerror = () => reject(new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
export async function privateFile(
  id: string,
  signal?: AbortSignal,
): Promise<File> {
  const data = await apiRequest<{
    file_name: string;
    mime_type: string;
    data_url: string;
  }>(`/partner-program/assets/${encodeURIComponent(id)}`, {
    signal,
    timeoutMs: 90000,
  });
  if (
    !data ||
    typeof data.file_name !== "string" ||
    typeof data.mime_type !== "string" ||
    typeof data.data_url !== "string" ||
    !data.data_url.startsWith(`data:${data.mime_type};base64,`)
  )
    throw new Error(
      "This attachment returned an invalid response. Please retry.",
    );
  const bytes = Uint8Array.from(
    atob(data.data_url.split(",")[1] ?? ""),
    (char) => char.charCodeAt(0),
  );
  return new File([bytes], data.file_name, { type: data.mime_type });
}
export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function validateFinalPdf(file: File): Promise<File> {
  if (
    !/\.pdf$/i.test(file.name) ||
    !file.size ||
    file.size > 3_000_000 ||
    (await file.slice(0, 5).text()) !== "%PDF-"
  )
    throw new Error("Choose a PDF up to 3 MB.");
  return new File([file], file.name, { type: "application/pdf" });
}
export async function uploadFinalPdf(applicationId: string, file: File) {
  const validated = await validateFinalPdf(file);
  return apiRequest<PartnerAsset>(`${PARTNER_API}/assets`, {
    method: "POST",
    data: {
      application_id: applicationId,
      file_name: file.name,
      data_url: await fileDataUrl(validated),
    },
    timeoutMs: 90000,
  });
}

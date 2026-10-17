import { apiRequest } from "../../lib/api-client";
import type { PartnerAsset } from "./partner-program.type";
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
export async function privateFile(id: string): Promise<File> {
  const data = await apiRequest<{
    file_name: string;
    mime_type: string;
    data_url: string;
  }>(`/partner-program/assets/${encodeURIComponent(id)}`);
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
export async function uploadFinalPdf(applicationId: string, file: File) {
  if (file.type !== "application/pdf" || file.size > 3_000_000)
    throw new Error("Choose a PDF up to 3 MB.");
  return apiRequest<PartnerAsset>(`${PARTNER_API}/assets`, {
    method: "POST",
    data: {
      application_id: applicationId,
      file_name: file.name,
      data_url: await fileDataUrl(file),
    },
    timeoutMs: 90000,
  });
}

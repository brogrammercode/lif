import { downloadFile } from "./partner-program.api";

// Web URLs deliberately avoid wa.me's native-app redirect. Browsers cannot
// attach a local PDF to WhatsApp Web; the administrator attaches the download.
export function openWhatsAppWeb(
  phone: string,
  message: string,
  file?: File | null,
) {
  const digits = phone.replace(/\D/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits))
    throw new Error("This application has no valid WhatsApp phone number.");
  if (file) downloadFile(file);
  window.open(
    `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

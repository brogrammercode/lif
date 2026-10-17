export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
export type ImageUpload = { file_name: string; data_url: string };

export function validateImage(file: File) {
  if (!IMAGE_ACCEPT.split(",").includes(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (!file.size || file.size > MAX_IMAGE_BYTES)
    throw new Error("Choose an image up to 5 MB.");
  if (file.name.length > 255)
    throw new Error("Use a file name shorter than 256 characters.");
}

// Called only from a form submit handler. Selection/preview never sends bytes.
export function readImageUpload(
  file: File,
  signal?: AbortSignal,
): Promise<ImageUpload> {
  validateImage(file);
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const abort = () => {
      reader.abort();
      cleanup();
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    reader.onload = () => {
      cleanup();
      if (typeof reader.result !== "string")
        reject(new Error("The image could not be read. Choose it again."));
      else resolve({ file_name: file.name, data_url: reader.result });
    };
    reader.onerror = () => {
      cleanup();
      reject(new Error("The image could not be read. Choose it again."));
    };
    signal?.addEventListener("abort", abort, { once: true });
    reader.readAsDataURL(file);
  });
}

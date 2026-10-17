import { useEffect, useRef, useState } from "react";
import { readImageUpload, validateImage } from "./image-upload";

export function useImageUpload(currentUrl: string | null) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const objectUrl = useRef<string | null>(null);
  const version = useRef(0);
  const release = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  };
  useEffect(
    () => () => {
      version.current++;
      release();
    },
    [],
  );

  async function select(files: File[]) {
    const attempt = ++version.current;
    let candidate: string | null = null;
    setSelecting(true);
    setError(null);
    try {
      if (files.length !== 1 || !files[0])
        throw new Error("Choose one image at a time.");
      const next = files[0];
      validateImage(next);
      candidate = URL.createObjectURL(next);
      const image = new Image();
      image.src = candidate;
      await image.decode();
      if (
        !image.naturalWidth ||
        !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 40_000_000
      )
        throw new Error("Choose an image with at most 40 megapixels.");
      if (attempt !== version.current) return;
      release();
      objectUrl.current = candidate;
      candidate = null;
      setFile(next);
      setPreview(objectUrl.current);
      setRemoved(false);
    } catch (cause) {
      if (attempt === version.current)
        setError(
          cause instanceof Error && cause.name !== "EncodingError"
            ? cause.message
            : "This image could not be opened. Choose another image.",
        );
    } finally {
      if (candidate) URL.revokeObjectURL(candidate);
      if (attempt === version.current) setSelecting(false);
    }
  }
  function remove() {
    version.current++;
    release();
    setFile(null);
    setPreview(null);
    setRemoved(Boolean(currentUrl));
    setError(null);
    setSelecting(false);
  }
  function reset() {
    version.current++;
    release();
    setFile(null);
    setPreview(currentUrl);
    setRemoved(false);
    setError(null);
    setSelecting(false);
  }
  return {
    file,
    preview,
    removed,
    error,
    selecting,
    select,
    remove,
    reset,
    changed: Boolean(file) || removed,
    serialize: (signal?: AbortSignal) =>
      file ? readImageUpload(file, signal) : Promise.resolve(undefined),
  };
}
export type ImageSelection = ReturnType<typeof useImageUpload>;

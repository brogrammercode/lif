import { useEffect, useRef, useState } from "react";
import { IMAGE_ACCEPT } from "../../lib/image-upload";
import type { ImageSelection } from "../../lib/useImageUpload";
import { InlineError } from "../feedback/StateCard";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { InlineLoading } from "./Skeleton";

export function ImageUpload({
  id,
  label,
  image,
  disabled = false,
}: {
  id: string;
  label: string;
  image: ImageSelection;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image.preview]);
  const unavailable = disabled || image.selecting;
  return (
    <div className="field-group image-field">
      <label htmlFor={id} id={`${id}-label`}>
        {label}
      </label>
      <input
        ref={input}
        id={id}
        className="sr-only"
        type="file"
        tabIndex={-1}
        accept={IMAGE_ACCEPT}
        disabled={unavailable}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          if (event.target.files?.length)
            void image.select(Array.from(event.target.files));
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={`image-dropzone${dragging ? " is-dragging" : ""}`}
        disabled={unavailable}
        aria-describedby={`${id}-hint`}
        aria-label={`${image.preview ? "Replace" : "Choose"} ${label.toLowerCase()}`}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!unavailable) {
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragging(false);
          if (!unavailable)
            void image.select(Array.from(event.dataTransfer.files));
        }}
      >
        <span
          className={`image-upload-preview${image.preview && !failed ? " has-image" : ""}`}
        >
          {image.preview && !failed ? (
            <img
              src={image.preview}
              alt={`${label} preview`}
              referrerPolicy="no-referrer"
              onError={() => setFailed(true)}
            />
          ) : image.selecting ? (
            <InlineLoading />
          ) : (
            <Icon name="upload" size={28} />
          )}
        </span>
        <span className="image-upload-copy">
          <strong>
            {image.selecting
              ? "Opening image…"
              : dragging
                ? "Drop your image here"
                : image.preview
                  ? "Drop a new image or click to replace"
                  : "Drag and drop an image here"}
          </strong>
          <span>
            {image.file
              ? `${image.file.name} · ${(image.file.size / 1024 / 1024).toFixed(2)} MB`
              : "or click to browse your files"}
          </span>
          <span className="image-upload-status">
            {image.file
              ? "Ready to save"
              : failed
                ? "Preview unavailable — choose a replacement"
                : image.removed
                  ? "Image will be removed on save"
                  : "JPEG, PNG, WebP · Up to 5 MB"}
          </span>
        </span>
      </button>
      <div className="image-upload-actions">
        <p id={`${id}-hint`} className="field-hint">
          Preview only. Your image uploads when you save the form.
        </p>
        <div className="flex flex-wrap gap-2">
          {image.preview && (
            <Button
              variant="ghost"
              disabled={unavailable}
              onClick={image.remove}
            >
              Remove image
            </Button>
          )}
          {(image.changed || image.error) && (
            <Button
              variant="ghost"
              disabled={unavailable}
              onClick={image.reset}
            >
              Undo image change
            </Button>
          )}
        </div>
      </div>
      {image.error && <InlineError message={image.error} />}
    </div>
  );
}

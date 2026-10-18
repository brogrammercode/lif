import { useRef, useState } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export function FileUpload({
  id,
  label,
  file,
  onSelect,
  onRemove,
  disabled = false,
}: {
  id: string;
  label: string;
  file: File | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="field-group image-field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={input}
        id={id}
        className="sr-only"
        type="file"
        tabIndex={-1}
        accept=".pdf,application/pdf"
        disabled={disabled}
        aria-describedby={id + "-hint"}
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected && !disabled) onSelect(selected);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className={"image-dropzone" + (dragging ? " is-dragging" : "")}
        disabled={disabled}
        aria-label={(file ? "Replace " : "Choose ") + label.toLowerCase()}
        aria-describedby={id + "-hint"}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) {
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
          setDragging(false);
          const selected = event.dataTransfer.files[0];
          if (selected && !disabled) onSelect(selected);
        }}
      >
        <span className="image-upload-preview">
          <Icon name={file ? "check" : "upload"} size={28} />
        </span>
        <span className="image-upload-copy">
          <strong>
            {dragging
              ? "Drop your PDF here"
              : file
                ? file.name
                : "Drag and drop a PDF here"}
          </strong>
          <span>
            {file
              ? (file.size / 1024 / 1024).toFixed(2) + " MB"
              : "or click to browse your files"}
          </span>
          <span className="image-upload-status">
            {file ? "Ready for approval" : "PDF only · Up to 3 MB"}
          </span>
        </span>
      </button>
      <div className="image-upload-actions">
        <p id={id + "-hint"} className="field-hint">
          Preview only. The PDF uploads when you confirm approval.
        </p>
        {file && (
          <Button variant="ghost" disabled={disabled} onClick={onRemove}>
            Remove PDF
          </Button>
        )}
      </div>
    </div>
  );
}

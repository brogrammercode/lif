import { useEffect, useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { InlineError } from "../../components/feedback/StateCard";
import { safeMessage } from "../../lib/api-client";
import { privateFile, downloadFile } from "./partner-program.api";

export function PrivateAssetPreview({
  assetId,
  onClose,
  loadFile = privateFile,
}: {
  assetId: string;
  loadFile?: (id: string, signal?: AbortSignal) => Promise<File>;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    setFile(null);
    setUrl("");
    setText("");
    setError(null);
    void loadFile(assetId, controller.signal)
      .then(async (value) => {
        const content = value.type.startsWith("text/")
          ? await value.text()
          : "";
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(value);
        setFile(value);
        setUrl(objectUrl);
        setText(content);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(safeMessage(cause));
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, revision, loadFile]);
  return (
    <Dialog
      title={file?.name ?? "Attachment preview"}
      onClose={onClose}
      description="Private attachment. Download a copy only when you need one."
    >
      <div className="review-panel-body space-y-4">
        {error ? (
          <>
            <InlineError message={error} />
            <Button
              variant="secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry preview
            </Button>
          </>
        ) : !file ? (
          <p role="status" className="field-hint">
            Loading attachment…
          </p>
        ) : file.type.startsWith("image/") ? (
          <img
            src={url}
            alt={file.name}
            className="attachment-preview-image"
            onError={() =>
              setError(
                "This image could not be displayed. You can download the original file.",
              )
            }
          />
        ) : file.type === "application/pdf" ? (
          <iframe title={file.name} src={url} className="document-preview" />
        ) : file.type.startsWith("text/") ? (
          <pre className="attachment-preview-text">{text}</pre>
        ) : (
          <p className="field-hint">
            This file type does not support an inline browser preview. Download
            it to open in a compatible application.
          </p>
        )}
        {file && (
          <div className="dialog-footer">
            <Button variant="secondary" onClick={() => downloadFile(file)}>
              Download original
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

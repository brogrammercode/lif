import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { InlineError } from "../../components/feedback/StateCard";
import { safeMessage } from "../../lib/api-client";
import { privateFile } from "./partner-program.api";

export function PrivateSelfie({ assetId }: { assetId: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true,
      objectUrl = "";
    setUrl("");
    setError(null);
    void privateFile(assetId)
      .then((file) => {
        if (!active) return;
        if (!["image/webp", "image/jpeg", "image/png"].includes(file.type))
          throw new Error("This selfie has an unsupported image type.");
        objectUrl = URL.createObjectURL(file);
        setUrl(objectUrl);
      })
      .catch((cause) => {
        if (active) setError(safeMessage(cause));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId, revision]);
  return (
    <div className="space-y-3 mb-3">
      {error ? (
        <>
          <InlineError message={error} />
          <Button variant="secondary" onClick={() => setRevision((v) => v + 1)}>
            Retry selfie preview
          </Button>
        </>
      ) : url ? (
        <img
          src={url}
          alt="Applicant live selfie"
          className="max-h-80 w-full rounded-xl border border-line object-contain"
        />
      ) : (
        <p className="field-hint" role="status">
          Loading private selfie…
        </p>
      )}
      <p className="field-hint">
        Camera capture submitted with the application. Review the face and photo
        quality before approval.
      </p>
    </div>
  );
}

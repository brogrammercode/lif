import "../../styles/partner-program.css";
import documentStyles from "../../styles/document-content.css?raw";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

export function DocumentDialog({
  title,
  html,
  version,
  onClose,
}: {
  title: string;
  html: string;
  version?: number;
  onClose: () => void;
}) {
  return (
    <Dialog
      reader
      title={title}
      description={
        version ? `Accepted document · Version ${version}` : "Document preview"
      }
      onClose={onClose}
    >
      <div className="document-reader">
        <DocumentPreview html={html} />
      </div>
      <div className="document-reader-footer">
        <span>Read-only document</span>
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
export function DocumentPreview({ html }: { html: string }) {
  const theme = getComputedStyle(document.documentElement);
  const variables = [
    "--font-sans",
    "--color-ink",
    "--color-muted",
    "--color-subtle",
    "--color-line",
    "--color-brand",
    "--color-canvas",
  ]
    .map((name) => name + ":" + theme.getPropertyValue(name))
    .join(";");
  return (
    <iframe
      className="document-preview"
      title="Document preview"
      sandbox="allow-popups"
      srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"><style>:root{${variables}}*{box-sizing:border-box}body{font-family:var(--font-sans);background:#fff} ${documentStyles} body.rich-document{min-height:0} @media(max-width:639px){body.rich-document{padding:20px}}</style></head><body class="rich-document">${html}</body></html>`}
    />
  );
}

import "../../styles/partner-program.css";
export function DocumentPreview({ html }: { html: string }) {
  return (
    <iframe
      className="document-preview"
      title="Document preview"
      sandbox="allow-popups"
      srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;color:#1a1a1a;max-width:780px;margin:32px auto;padding:0 24px;line-height:1.65;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d1d5db;padding:10px}blockquote{border-left:3px solid #b45309;margin-left:0;padding-left:16px}pre{white-space:pre-wrap;background:#f3f4f6;padding:16px}a{color:#b45309}li[data-type=taskItem]{list-style:none}</style></head><body>${html}</body></html>`}
    />
  );
}

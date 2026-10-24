import type { ConfigurationMetadata as Metadata } from "./configuration.api";
export function ConfigurationMetadata({ value }: { value: Metadata }) {
  const editor = value.updated_by;
  return (
    <p className="field-hint">
      Version {value.version} · Last updated by{" "}
      {editor
        ? [editor.first_name, editor.last_name].filter(Boolean).join(" ") ||
          editor.id
        : "Not configured"}
      {value.updated_at
        ? ` · ${new Date(value.updated_at).toLocaleString()}`
        : ""}
    </p>
  );
}

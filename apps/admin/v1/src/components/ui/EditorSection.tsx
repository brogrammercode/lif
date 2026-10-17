import { useId, type ReactNode } from "react";
import { Switch } from "./Switch";

export function EditorSection({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="editor-section" aria-labelledby={id}>
      <div className="editor-section-heading">
        <span className="section-step">{step}</span>
        <h3 id={id}>{title}</h3>
      </div>
      {description && <p className="field-hint">{description}</p>}
      {children}
    </section>
  );
}

export function SettingRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="visibility-row">
      <div>
        <p className="font-semibold">{label}</p>
        <p className="field-hint">{description}</p>
      </div>
      <Switch
        label={label}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
    </div>
  );
}

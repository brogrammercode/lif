import { useId, type ReactNode } from "react";
import { Switch } from "./Switch";

export function EditorSection({
  step,
  title,
  description,
  children,
  card = false,
}: {
  step: string;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  card?: boolean;
}) {
  const id = useId();
  return (
    <section
      className={`editor-section${card ? " personal-card" : ""}`}
      aria-labelledby={id}
    >
      <header className="editor-section-header">
        <div className="editor-section-heading">
          <span className="section-step">{step}</span>
          <h3 id={id}>{title}</h3>
        </div>
        {description && <p className="field-hint">{description}</p>}
      </header>
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

import { useState, type FormEvent } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { EditorSection, SettingRow } from "../../components/ui/EditorSection";
import { Icon } from "../../components/ui/Icon";
import { InlineError } from "../../components/feedback/StateCard";
import { apiRequest } from "../../lib/api-client";
import { useAdminSave } from "../../lib/useAdminResource";
import {
  detailTypes,
  documentTypes,
  isDocumentType,
  typeLabels,
  type FieldType,
  type PartnerRequirement,
  type RequirementCategory,
  type RequirementSection,
} from "./partner-requirements.type";

const extensions = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
  ".zip",
];
const keyFromLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+|_+$/g, "")
    .slice(0, 64);
const optionalNumber = (value: string) => (value.trim() ? Number(value) : null);

export function RequirementEditor({
  record,
  categories,
  section,
  onClose,
  onSaved,
}: {
  record: PartnerRequirement | null;
  categories: RequirementCategory[];
  section: RequirementSection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(record?.label ?? "");
  const [key, setKey] = useState(record?.key ?? "");
  const [keyEdited, setKeyEdited] = useState(Boolean(record));
  const [category, setCategory] = useState(
    record?.category_id ?? categories.find((item) => item.is_active)?.id ?? "",
  );
  const [type, setType] = useState<FieldType>(
    record?.field_type ?? (section === "details" ? "STRING" : "FILE"),
  );
  const [description, setDescription] = useState(record?.description ?? "");
  const [placeholder, setPlaceholder] = useState(record?.placeholder ?? "");
  const [required, setRequired] = useState(record?.is_required ?? true);
  const [active, setActive] = useState(record?.is_active ?? true);
  const [order, setOrder] = useState(record?.sort_order ?? 0);
  const [minimum, setMinimum] = useState(record?.min_value?.toString() ?? "");
  const [maximum, setMaximum] = useState(record?.max_value?.toString() ?? "");
  const [maxLength, setMaxLength] = useState(
    record?.max_length?.toString() ?? "",
  );
  const [maxSize, setMaxSize] = useState(
    Math.min(record?.max_file_size_mb ?? 3, 3),
  );
  const [allowed, setAllowed] = useState<string[]>(
    record?.allowed_extensions ?? [".pdf"],
  );
  const [multiple, setMultiple] = useState(record?.allow_multiple ?? false);
  const save = useAdminSave();
  const document = isDocumentType(type);
  const rangeError =
    type === "NUMBER" &&
    minimum !== "" &&
    maximum !== "" &&
    Number(minimum) > Number(maximum);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (rangeError || (type === "FILE" && !allowed.length)) return;
    void save.run(
      (signal) =>
        apiRequest(
          `/admin/partner-program/requirements${record ? `/${record.id}` : ""}`,
          {
            method: record ? "PATCH" : "POST",
            signal,
            data: {
              category_id: category,
              key,
              label: label.trim(),
              field_type: type,
              description: description.trim() || null,
              placeholder: placeholder.trim() || null,
              is_required: required,
              is_active: active,
              sort_order: order,
              min_value: type === "NUMBER" ? optionalNumber(minimum) : null,
              max_value: type === "NUMBER" ? optionalNumber(maximum) : null,
              max_length: ["STRING", "TEXT"].includes(type)
                ? optionalNumber(maxLength)
                : null,
              max_file_size_mb: document ? maxSize : null,
              allowed_extensions: type === "FILE" ? allowed : [],
              allow_multiple: document && multiple,
              ...(record ? { expected_updated_at: record.updated_at } : {}),
            },
          },
        ),
      onSaved,
    );
  }
  return (
    <Dialog
      title={record ? "Edit requirement" : "Add requirement"}
      description="Field type decides whether this requirement appears in Details or Documents."
      busy={save.busy}
      onClose={onClose}
    >
      <form onSubmit={submit} className="editor-form">
        {save.error && <InlineError message={save.error} />}
        <fieldset disabled={save.busy} className="contents">
          <EditorSection step="01" title="The essentials">
            <div className="form-grid">
              <Field id="requirement-label" label="Label">
                <input
                  className="field"
                  id="requirement-label"
                  required
                  maxLength={120}
                  pattern=".*\S.*"
                  value={label}
                  onChange={(event) => {
                    setLabel(event.target.value);
                    if (!keyEdited) setKey(keyFromLabel(event.target.value));
                  }}
                />
              </Field>
              <Field
                id="requirement-key"
                label="Field key"
                hint="Stable identifier, 2–64 lowercase letters, numbers or underscores. Cannot change after creation."
              >
                <input
                  className="field"
                  id="requirement-key"
                  required
                  pattern="[a-z][a-z0-9_]{1,63}"
                  readOnly={Boolean(record)}
                  maxLength={64}
                  value={key}
                  onChange={(event) => {
                    setKeyEdited(true);
                    setKey(event.target.value);
                  }}
                />
              </Field>
              <Field id="requirement-category" label="Category">
                <select
                  className="field"
                  id="requirement-category"
                  required
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="" disabled>
                    Select category
                  </option>
                  {categories
                    .filter(
                      (item) =>
                        item.is_active || item.id === record?.category_id,
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {!item.is_active ? " (disabled)" : ""}
                      </option>
                    ))}
                </select>
              </Field>
              <Field id="requirement-type" label="Field type">
                <select
                  className="field"
                  id="requirement-type"
                  value={type}
                  onChange={(event) => setType(event.target.value as FieldType)}
                >
                  <optgroup label="Details">
                    {detailTypes.map((item) => (
                      <option key={item} value={item}>
                        {typeLabels[item]}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Documents">
                    {documentTypes.map((item) => (
                      <option key={item} value={item}>
                        {typeLabels[item]}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </Field>
              <Field
                className="form-full"
                id="requirement-description"
                label="Help text"
              >
                <textarea
                  className="field"
                  id="requirement-description"
                  maxLength={1000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              {!document && type !== "BOOLEAN" && (
                <Field
                  className="form-full"
                  id="requirement-placeholder"
                  label="Placeholder"
                >
                  <input
                    className="field"
                    id="requirement-placeholder"
                    maxLength={200}
                    value={placeholder}
                    onChange={(event) => setPlaceholder(event.target.value)}
                  />
                </Field>
              )}
            </div>
          </EditorSection>
          <EditorSection step="02" title="Validation & display order">
            <div className="form-grid">
              {type === "NUMBER" && (
                <>
                  <Field id="requirement-min" label="Minimum value">
                    <input
                      className="field"
                      id="requirement-min"
                      type="number"
                      step="any"
                      value={minimum}
                      onChange={(event) => setMinimum(event.target.value)}
                    />
                  </Field>
                  <Field id="requirement-max" label="Maximum value">
                    <input
                      className="field"
                      id="requirement-max"
                      type="number"
                      step="any"
                      min={minimum || undefined}
                      value={maximum}
                      onChange={(event) => setMaximum(event.target.value)}
                    />
                  </Field>
                </>
              )}
              {["STRING", "TEXT"].includes(type) && (
                <Field
                  id="requirement-length"
                  label="Maximum characters (optional)"
                >
                  <input
                    className="field"
                    id="requirement-length"
                    type="number"
                    min={1}
                    max={100000}
                    value={maxLength}
                    onChange={(event) => setMaxLength(event.target.value)}
                  />
                </Field>
              )}
              {document && (
                <Field
                  id="requirement-size"
                  label="Maximum file size (MB)"
                  hint="Partner uploads are limited to 3 MB per file for Vercel compatibility."
                >
                  <input
                    className="field"
                    id="requirement-size"
                    type="number"
                    min={1}
                    max={3}
                    required
                    value={maxSize}
                    onChange={(event) => setMaxSize(event.target.valueAsNumber)}
                  />
                </Field>
              )}
              <Field id="requirement-order" label="Display order">
                <input
                  className="field"
                  id="requirement-order"
                  type="number"
                  min={0}
                  max={100000}
                  required
                  value={order}
                  onChange={(event) => setOrder(event.target.valueAsNumber)}
                />
              </Field>
              {type === "FILE" && (
                <fieldset className="form-full choice-group">
                  <legend>Allowed file types (select at least one)</legend>
                  {extensions.map((extension) => (
                    <label key={extension} className="choice-field">
                      <input
                        type="checkbox"
                        checked={allowed.includes(extension)}
                        onChange={(event) =>
                          setAllowed((current) =>
                            event.target.checked
                              ? [...current, extension]
                              : current.filter((item) => item !== extension),
                          )
                        }
                      />
                      {extension}
                    </label>
                  ))}
                </fieldset>
              )}
              {document && type !== "FILE" && (
                <p className="field-hint form-full">
                  {type === "PDF"
                    ? "Only PDF files will be accepted."
                    : "Accepted image types: JPG, JPEG, PNG and WebP."}
                </p>
              )}
            </div>
          </EditorSection>
          <EditorSection step="03" title="Visibility & requirements">
            <SettingRow
              label="Require this field"
              description="Partners must provide a value before submitting their form."
              checked={required}
              onChange={setRequired}
              disabled={save.busy}
            />
            <SettingRow
              label="Enable this field"
              description="Enabled fields appear in the partner form when their category is active."
              checked={active}
              onChange={setActive}
              disabled={save.busy}
            />
            {document && (
              <SettingRow
                label="Allow multiple files"
                description="Partners can attach more than one file for this requirement."
                checked={multiple}
                onChange={setMultiple}
                disabled={save.busy}
              />
            )}
          </EditorSection>
        </fieldset>
        {rangeError && (
          <InlineError message="The minimum value cannot exceed the maximum." />
        )}
        <div className="dialog-footer">
          <Button variant="secondary" disabled={save.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            busy={save.busy}
            disabled={rangeError || (type === "FILE" && !allowed.length)}
          >
            <Icon name="check" size={16} />
            Save field
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

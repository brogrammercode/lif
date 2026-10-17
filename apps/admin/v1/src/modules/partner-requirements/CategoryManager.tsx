import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { Badge } from "../../components/ui/Badge";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import { EditorSection, SettingRow } from "../../components/ui/EditorSection";
import { apiRequest } from "../../lib/api-client";
import { useAdminSave } from "../../lib/useAdminResource";
import type { RequirementCategory } from "./partner-requirements.type";

export function CategoryManager({
  categories,
  loading,
  error,
  onClose,
  onSaved,
  onRefresh,
}: {
  categories: RequirementCategory[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onSaved: () => void;
  onRefresh: () => void;
}) {
  const [editor, setEditor] = useState<{
    record: RequirementCategory | null;
  } | null>(null);
  if (editor)
    return (
      <CategoryEditor
        key={editor.record?.id ?? "new"}
        record={editor.record}
        onClose={() => {
          setEditor(null);
          onRefresh();
        }}
        onSaved={() => {
          setEditor(null);
          onSaved();
        }}
      />
    );
  return (
    <Dialog
      title="Field categories"
      description="Organize partner details and documents with shared categories."
      onClose={onClose}
    >
      <div className="editor-form">
        <CatalogPanel
          title="Your field categories"
          description="Disabling a category hides its fields from the partner form."
          count={loading ? "…" : categories.length}
          busy={loading}
          actions={
            <Button onClick={() => setEditor({ record: null })}>
              <Icon name="plus" size={18} />
              Add category
            </Button>
          }
        >
          {error ? (
            <div className="catalog-feedback">
              <InlineError message={error} />
              <Button variant="secondary" onClick={onRefresh}>
                Try again
              </Button>
            </div>
          ) : loading ? (
            <TableLoading label="Loading field categories" />
          ) : !categories.length ? (
            <StateCard
              title="No categories yet"
              message="Create your first category, then add detail and document fields."
            />
          ) : (
            <ul className="catalog-list">
              {categories.map((category) => (
                <li key={category.id}>
                  <span className="category-image">
                    <Icon name="layers" size={24} />
                  </span>
                  <div className="catalog-list-copy">
                    <strong>{category.name}</strong>
                    <p>{category.description || "No description"}</p>
                    <small>
                      {category._count?.fields ?? 0} fields · Order{" "}
                      {category.sort_order}
                    </small>
                  </div>
                  <Badge active={category.is_active}>
                    {category.is_active ? "Active" : "Disabled"}
                  </Badge>
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      onClick={() => setEditor({ record: category })}
                      aria-label={`Edit category ${category.name}`}
                    >
                      <Icon name="edit" size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CatalogPanel>
        <div className="dialog-footer">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CategoryEditor({
  record,
  onClose,
  onSaved,
}: {
  record: RequirementCategory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(record?.name ?? "");
  const [description, setDescription] = useState(record?.description ?? "");
  const [order, setOrder] = useState(record?.sort_order ?? 0);
  const [active, setActive] = useState(record?.is_active ?? true);
  const save = useAdminSave();
  function submit(event: FormEvent) {
    event.preventDefault();
    void save.run(
      (signal) =>
        apiRequest(
          `/admin/partner-program/requirement-categories${record ? `/${record.id}` : ""}`,
          {
            method: record ? "PATCH" : "POST",
            signal,
            data: {
              name: name.trim(),
              description: description.trim() || null,
              sort_order: order,
              is_active: active,
              ...(record ? { expected_updated_at: record.updated_at } : {}),
            },
          },
        ),
      onSaved,
    );
  }
  return (
    <Dialog
      title={record ? "Edit category" : "Add category"}
      description="Categories are shared between Details and Documents."
      busy={save.busy}
      onClose={onClose}
    >
      <form onSubmit={submit} className="editor-form">
        {save.error && <InlineError message={save.error} />}
        <fieldset disabled={save.busy} className="contents">
          <EditorSection step="01" title="The essentials">
            <div className="form-grid">
              <Field id="category-name" label="Name">
                <input
                  className="field"
                  id="category-name"
                  required
                  maxLength={100}
                  pattern=".*\S.*"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field id="category-order" label="Display order">
                <input
                  className="field"
                  id="category-order"
                  type="number"
                  min={0}
                  max={100000}
                  required
                  value={order}
                  onChange={(event) => setOrder(event.target.valueAsNumber)}
                />
              </Field>
              <Field
                className="form-full"
                id="category-description"
                label="Description"
              >
                <textarea
                  className="field"
                  id="category-description"
                  maxLength={1000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
            </div>
          </EditorSection>
          <EditorSection step="02" title="Visibility">
            <SettingRow
              label="Enable this category"
              description="Fields in this category appear in the partner form when enabled."
              checked={active}
              onChange={setActive}
              disabled={save.busy}
            />
          </EditorSection>
        </fieldset>
        <div className="dialog-footer">
          <Button variant="secondary" disabled={save.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" busy={save.busy}>
            <Icon name="check" size={16} />
            Save category
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

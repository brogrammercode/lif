import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Switch } from "../../components/ui/Switch";
import { Icon } from "../../components/ui/Icon";
import { InlineError } from "../../components/feedback/StateCard";
import { ApiError, safeMessage } from "../../lib/api-client";
import type {
  CategoryInput,
  VehicleCategory,
  VehicleFamily,
} from "../../types/domain";
import {
  EMPTY_CATEGORY,
  VEHICLE_FAMILIES,
} from "./vehicle-categories.constant";
import { CategoryImage } from "./CategoryImage";
import { ImageUpload } from "../../components/ui/ImageUpload";
import { useImageUpload } from "../../lib/useImageUpload";
import { CategoryFareFields } from "./CategoryFareFields";

export function CategoryEditor({
  category,
  parent,
  categories,
  onClose,
  onSave,
  onReload,
}: {
  category: VehicleCategory | null;
  parent?: VehicleCategory | null;
  categories: VehicleCategory[];
  onClose: () => void;
  onReload: () => void;
  onSave: (
    input: CategoryInput,
    existing: VehicleCategory | null,
    signal?: AbortSignal,
  ) => Promise<void>;
}) {
  const [form, setForm] = useState<CategoryInput>(() =>
    category
      ? {
          name: category.name,
          description: category.description ?? "",
          image_url: category.image_url ?? "",
          parent_id: category.parent_id,
          vehicle_type: category.vehicle_type,
          capacity: category.capacity,
          fare_policy: category.fare_policy ?? null,
          is_active: category.is_active,
          sort_order: category.sort_order,
        }
      : {
          ...EMPTY_CATEGORY,
          ...(parent
            ? {
                parent_id: parent.id,
                vehicle_type: parent.vehicle_type,
                capacity: parent.capacity,
              }
            : {}),
        },
  );
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const saveController = useRef<AbortController | null>(null);
  useEffect(() => () => saveController.current?.abort(), []);
  const image = useImageUpload(category?.image_url ?? null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const change = <K extends keyof CategoryInput>(
    key: K,
    value: CategoryInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const parentCategory = categories.find((item) => item.id === form.parent_id);
  const parentOptions = categories.filter(
    (item) =>
      !item.parent_id && item.id !== category?.id && item._count.vehicles === 0,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || image.selecting || image.error || conflict) return;
    saving.current = true;
    const controller = new AbortController();
    saveController.current = controller;
    setBusy(true);
    setError(null);
    setConflict(false);
    try {
      const image_upload = await image.serialize(controller.signal);
      controller.signal.throwIfAborted();
      await onSave(
        {
          ...form,
          image_url: image.removed ? "" : form.image_url,
          image_upload,
        },
        category,
        controller.signal,
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(safeMessage(cause));
      setConflict(
        cause instanceof ApiError && cause.code === "CATEGORY_CONFLICT",
      );
    } finally {
      saving.current = false;
      saveController.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <Dialog
      title={
        category ? "Edit category" : parent ? "Add subcategory" : "Add category"
      }
      description="Create a clear choice for riders and a compatible category for drivers."
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={(event) => void submit(event)} className="editor-form">
        <fieldset disabled={busy} className="contents">
          {error && <InlineError message={error} />}
          {conflict && (
            <Button variant="secondary" onClick={onReload}>
              Reload latest category
            </Button>
          )}
          <div className="editor-section-heading">
            <span className="section-step">01</span>
            <h3>The essentials</h3>
          </div>
          <div className="form-grid">
            <Field id="category-name" label="Category name">
              <input
                autoFocus
                className="field"
                id="category-name"
                value={form.name}
                onChange={(event) => change("name", event.target.value)}
                placeholder="e.g. City rides"
                required
                minLength={2}
                maxLength={80}
              />
            </Field>
            <Field
              id="category-parent"
              label="Parent category"
              hint="Leave as top-level, or place under a category to create a subcategory."
            >
              <select
                className="field"
                id="category-parent"
                value={form.parent_id ?? ""}
                disabled={Boolean(category?._count.children)}
                onChange={(event) =>
                  change("parent_id", event.target.value || null)
                }
              >
                <option value="">Top-level category</option>
                {parentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {!item.is_active ? " (disabled)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="category-description"
              label="Description"
              className="form-full"
            >
              <textarea
                className="field"
                id="category-description"
                rows={2}
                maxLength={240}
                value={form.description ?? ""}
                onChange={(event) => change("description", event.target.value)}
                placeholder="Help riders know what to expect."
              />
            </Field>
            <div className="form-full">
              <ImageUpload
                id="category-image"
                label="Category image"
                image={image}
                disabled={busy}
              />
            </div>
          </div>
          <div className="editor-section-heading">
            <span className="section-step">02</span>
            <h3>Vehicle compatibility</h3>
            <span className="ml-auto text-xs text-muted">Currency · INR</span>
          </div>
          <div className="form-grid">
            <Field
              id="category-family"
              label="Vehicle family"
              hint={
                category?._count.vehicles || category?._count.quotes
                  ? "Locked after vehicle registrations or fare quotes."
                  : "The physical vehicle type compatible with this category."
              }
            >
              <select
                id="category-family"
                className="field"
                disabled={Boolean(
                  category?._count.vehicles || category?._count.quotes,
                )}
                value={form.vehicle_type}
                onChange={(event) =>
                  change("vehicle_type", event.target.value as VehicleFamily)
                }
              >
                {VEHICLE_FAMILIES.map((family) => (
                  <option key={family.value} value={family.value}>
                    {family.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="category-capacity" label="Passenger seats">
              <input
                id="category-capacity"
                className="field"
                type="number"
                min={1}
                max={8}
                step={1}
                required
                value={Number.isFinite(form.capacity) ? form.capacity : ""}
                onChange={(event) =>
                  change("capacity", event.target.valueAsNumber)
                }
              />
            </Field>
          </div>
          <p className="field-hint">
            Configure this category's independent fare below or in App &gt; User
            &gt; Fare Policy.
          </p>
          <div className="editor-section-heading">
            <span className="section-step">03</span>
            <h3>Category fare policy</h3>
          </div>
          <CategoryFareFields
            prefix="category-fare"
            value={form.fare_policy ?? null}
            onChange={(value) => change("fare_policy", value)}
          />
          <p className="field-hint">
            These values are also editable in Fare Policy. Changes affect new
            quotes; accepted prices remain unchanged.
          </p>
          <div className="editor-section-heading">
            <span className="section-step">04</span>
            <h3>Visibility</h3>
          </div>
          <div className="visibility-row">
            <div>
              <p className="font-semibold">Enable this category</p>
              <p className="field-hint">
                {category?._count.children
                  ? "This category is a group. Disabling it hides its subcategories."
                  : "Enabled choices appear in driver registration and rider selection."}
              </p>
              {parentCategory && !parentCategory.is_active && (
                <p className="mt-1 text-xs text-brand">
                  The parent category is disabled, so this subcategory will stay
                  hidden.
                </p>
              )}
            </div>
            <Switch
              checked={form.is_active}
              onChange={(value) => change("is_active", value)}
              label="Enable category"
              disabled={busy}
            />
          </div>
          <Field
            id="category-order"
            label="Display order"
            hint="Smaller numbers appear first."
          >
            <input
              id="category-order"
              className="field max-w-36"
              type="number"
              min={0}
              max={100000}
              step={1}
              value={Number.isFinite(form.sort_order) ? form.sort_order : ""}
              onChange={(event) =>
                change("sort_order", event.target.valueAsNumber)
              }
              required
            />
          </Field>
          <div className="category-preview">
            <CategoryImage src={image.preview} family={form.vehicle_type} />
            <div>
              <span className="eyebrow">RIDER CHOICE PREVIEW</span>
              <p className="font-semibold">
                {form.name || "Your category name"}
              </p>
              <p className="text-xs text-muted">
                {form.capacity} seat{form.capacity === 1 ? "" : "s"}
              </p>
            </div>
            <Icon name="check" className="ml-auto text-brand" />
          </div>
          <p className="text-xs leading-5 text-muted">
            Each vehicle selects one category or subcategory. A category with
            subcategories is a group. Existing ride prices and history are
            preserved when you make changes.
          </p>
          <div className="dialog-footer">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              busy={busy}
              disabled={image.selecting || Boolean(image.error) || conflict}
            >
              <Icon name="check" size={16} />
              {busy
                ? image.file
                  ? "Uploading and saving…"
                  : "Saving…"
                : category
                  ? "Save changes"
                  : "Create category"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}

import { useState } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { EditorSection, SettingRow } from "../../components/ui/EditorSection";
import { Icon } from "../../components/ui/Icon";
import { VEHICLE_FAMILIES } from "../vehicle-categories/vehicle-categories.constant";
import { Button } from "../../components/ui/Button";
import { ImageUpload } from "../../components/ui/ImageUpload";
import { InlineError } from "../../components/feedback/StateCard";
import { useImageUpload } from "../../lib/useImageUpload";
import { useAdminSave } from "../../lib/useAdminResource";
import { apiRequest } from "../../lib/api-client";
import type { Brand, VehicleModel, CatalogStatus } from "./vehicle-models.type";
export type CatalogEditorTarget =
  | { kind: "brand"; record: Brand | null }
  | {
      kind: "model";
      record: VehicleModel | null;
      brand: Pick<Brand, "id" | "name"> & Partial<Brand>;
    };
export function CatalogEditor({
  target,
  onClose,
  onSaved,
}: {
  target: CatalogEditorTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const record = target.record;
  const image = useImageUpload(record?.logo_url ?? null);
  const save = useAdminSave();
  const model = target.kind === "model" ? target.record : null;
  const brand = target.kind === "brand" ? target.record : null;
  const [form, setForm] = useState({
    name: record?.name ?? "",
    description: record?.description ?? "",
    country: brand?.country ?? "",
    website_url: brand?.website_url ?? "",
    status: record?.status ?? ("VERIFIED" as CatalogStatus),
    is_active: record?.is_active ?? true,
    rejection_reason: record?.rejection_reason ?? "",
    vehicle_type: model?.vehicle_type ?? "SEDAN",
    fuel_type: model?.fuel_type ?? "PETROL",
    seating_capacity: model?.seating_capacity ?? 4,
    year_from: model?.year_from?.toString() ?? "",
    year_to: model?.year_to?.toString() ?? "",
  });
  const change = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const submit = () =>
    save.run(async (signal) => {
      const common = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        logo_url: image.removed ? null : (record?.logo_url ?? null),
        image_upload: await image.serialize(signal),
        status: form.status,
        is_active: form.is_active,
        rejection_reason:
          form.status === "REJECTED"
            ? form.rejection_reason.trim() || null
            : null,
        ...(record ? { expected_updated_at: record.updated_at } : {}),
      };
      const data =
        target.kind === "brand"
          ? {
              ...common,
              country: form.country.trim() || null,
              website_url: form.website_url.trim() || null,
            }
          : {
              ...common,
              brand_id: target.brand.id,
              vehicle_type: form.vehicle_type,
              fuel_type: form.fuel_type,
              seating_capacity: form.seating_capacity,
              year_from: form.year_from ? Number(form.year_from) : null,
              year_to: form.year_to ? Number(form.year_to) : null,
            };
      await apiRequest(
        `/admin/vehicle-${target.kind === "brand" ? "brands" : "models"}${record ? `/${encodeURIComponent(record.id)}` : ""}`,
        { method: record ? "PATCH" : "POST", data, signal, timeoutMs: 90000 },
      );
    }, onSaved);
  return (
    <Dialog
      title={`${record ? "Edit" : "Add"} vehicle ${target.kind}`}
      description={
        target.kind === "model"
          ? `Brand: ${target.brand.name}`
          : "Create a brand, then select it to add models."
      }
      busy={save.busy}
      onClose={onClose}
    >
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={save.busy} className="contents">
          {save.error && <InlineError message={save.error} />}
          <EditorSection step="01" title="The essentials">
            <div className="form-grid">
              <Field
                id="catalog-name"
                label={target.kind === "brand" ? "Brand name" : "Model name"}
              >
                <input
                  className="field"
                  id="catalog-name"
                  required
                  maxLength={100}
                  value={form.name}
                  onChange={(event) => change("name", event.target.value)}
                />
              </Field>
              <Field id="catalog-status" label="Review status">
                <select
                  className="field"
                  id="catalog-status"
                  value={form.status}
                  onChange={(event) =>
                    change("status", event.target.value as CatalogStatus)
                  }
                >
                  <option value="VERIFIED">Verified</option>
                  <option value="REQUESTED">Requested</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </Field>
            </div>
          </EditorSection>
          <EditorSection
            step="02"
            title={
              target.kind === "brand" ? "Brand details" : "Vehicle details"
            }
          >
            <div className="form-grid">
              {target.kind === "brand" ? (
                <>
                  <Field id="brand-country" label="Country (optional)">
                    <input
                      className="field"
                      id="brand-country"
                      maxLength={80}
                      value={form.country}
                      onChange={(event) =>
                        change("country", event.target.value)
                      }
                    />
                  </Field>
                  <Field
                    id="brand-website"
                    label="Website (optional)"
                    hint="Use an HTTPS address."
                  >
                    <input
                      className="field"
                      id="brand-website"
                      type="url"
                      pattern="https://.*"
                      maxLength={2000}
                      value={form.website_url}
                      onChange={(event) =>
                        change("website_url", event.target.value)
                      }
                      placeholder="https://example.com"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field id="model-family" label="Vehicle family">
                    <select
                      className="field"
                      id="model-family"
                      value={form.vehicle_type}
                      onChange={(event) =>
                        change("vehicle_type", event.target.value)
                      }
                    >
                      {VEHICLE_FAMILIES.map((family) => (
                        <option key={family.value} value={family.value}>
                          {family.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="model-fuel" label="Fuel type">
                    <select
                      className="field"
                      id="model-fuel"
                      value={form.fuel_type}
                      onChange={(event) =>
                        change("fuel_type", event.target.value)
                      }
                    >
                      {[
                        "PETROL",
                        "DIESEL",
                        "CNG",
                        "ELECTRIC",
                        "HYBRID",
                        "OTHER",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {value === "CNG"
                            ? value
                            : value[0] + value.slice(1).toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field id="model-seats" label="Seating capacity">
                    <input
                      className="field"
                      id="model-seats"
                      type="number"
                      required
                      min={1}
                      max={8}
                      value={form.seating_capacity}
                      onChange={(event) =>
                        change("seating_capacity", Number(event.target.value))
                      }
                    />
                  </Field>
                  <Field id="model-year-from" label="First year (optional)">
                    <input
                      className="field"
                      id="model-year-from"
                      type="number"
                      min={1900}
                      max={2050}
                      value={form.year_from}
                      onChange={(event) =>
                        change("year_from", event.target.value)
                      }
                    />
                  </Field>
                  <Field id="model-year-to" label="Final year (optional)">
                    <input
                      className="field"
                      id="model-year-to"
                      type="number"
                      min={form.year_from ? Number(form.year_from) : 1900}
                      max={2050}
                      value={form.year_to}
                      onChange={(event) =>
                        change("year_to", event.target.value)
                      }
                    />
                  </Field>
                </>
              )}
              <Field
                id="catalog-description"
                label="Description (optional)"
                className="form-full"
              >
                <textarea
                  className="field"
                  id="catalog-description"
                  rows={3}
                  maxLength={1000}
                  value={form.description}
                  onChange={(event) =>
                    change("description", event.target.value)
                  }
                />
              </Field>
              {form.status === "REJECTED" && (
                <Field
                  id="catalog-rejection"
                  label="Rejection reason"
                  className="form-full"
                >
                  <textarea
                    className="field"
                    id="catalog-rejection"
                    required
                    maxLength={1000}
                    value={form.rejection_reason}
                    onChange={(event) =>
                      change("rejection_reason", event.target.value)
                    }
                  />
                </Field>
              )}
              <div className="form-full">
                <ImageUpload
                  id="catalog-logo"
                  label={`${target.kind === "brand" ? "Brand" : "Model"} logo`}
                  image={image}
                  disabled={save.busy}
                />
              </div>
            </div>
          </EditorSection>
          <EditorSection step="03" title="Visibility">
            <SettingRow
              label="Enable this entry"
              description="Verified entries are available in the vehicle catalog. Requested and rejected entries stay hidden."
              checked={form.is_active}
              onChange={(value) => change("is_active", value)}
              disabled={save.busy}
            />
            {record?.requested_by && (
              <p className="field-hint mt-4">
                Requested by{" "}
                {record.requested_by.email ?? record.requested_by.id}. Verify
                the information before approving. Models require a verified
                parent brand.
              </p>
            )}
          </EditorSection>
        </fieldset>
        <div className="dialog-footer">
          <Button variant="secondary" disabled={save.busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            busy={save.busy}
            disabled={image.selecting || Boolean(image.error)}
          >
            <Icon name="check" size={16} />
            {image.file ? "Upload and save" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

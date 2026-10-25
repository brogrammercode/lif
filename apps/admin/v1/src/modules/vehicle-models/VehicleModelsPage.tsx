import { useSearchParams } from "react-router-dom";
import { PendingBadge, usePending } from "../pending/PendingProvider";
import { CatalogImport } from "./CatalogImport";
import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import { VehicleIdentity } from "../../components/ui/VehicleIdentity";
import { VEHICLE_FAMILIES } from "../vehicle-categories/vehicle-categories.constant";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import { Toast } from "../../components/feedback/Toast";
import {
  ManagementToolbar,
  FilterSelect,
  ManagementPagination,
} from "../../components/ui/ManagementControls";
import {
  useAdminResource,
  useDebouncedText,
  type Paged,
} from "../../lib/useAdminResource";
import { CatalogEditor, type CatalogEditorTarget } from "./CatalogEditor";
import type { Brand, VehicleModel } from "./vehicle-models.type";
const statuses = ["all", "REQUESTED", "VERIFIED", "REJECTED"];
function ReviewFilter({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <FilterSelect
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {statuses.map((status) => (
        <option key={status} value={status}>
          {status === "all"
            ? "All reviews"
            : status[0] + status.slice(1).toLowerCase()}
        </option>
      ))}
    </FilterSelect>
  );
}
export function VehicleModelsPage() {
  const [params, setParams] = useSearchParams();
  const pendingOnly = params.get("pending_only") === "true";
  const pending = usePending();
  const [brandQuery, setBrandQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const brandSearch = useDebouncedText(brandQuery);
  const modelSearch = useDebouncedText(modelQuery);
  const [brandStatus, setBrandStatus] = useState(
    params.get("pending_only") === "true" ? "REQUESTED" : "all",
  );
  const [modelStatus, setModelStatus] = useState(
    pendingOnly ? "REQUESTED" : "all",
  );
  const [brandPage, setBrandPage] = useState(1);
  const [modelPage, setModelPage] = useState(1);
  const [selected, setSelected] = useState<Brand | null>(null);
  const [editor, setEditor] = useState<CatalogEditorTarget | null>(null);
  const [importKind, setImportKind] = useState<"brands" | "models" | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const brands = useAdminResource<Paged<Brand>>(
    `/admin/vehicle-brands?${new URLSearchParams({ query: brandSearch, status: brandStatus, page: String(brandPage) })}`,
  );
  const models = useAdminResource<Paged<VehicleModel>>(
    `/admin/vehicle-models?${new URLSearchParams({ query: modelSearch, status: modelStatus, page: String(modelPage), ...(selected ? { brand_id: selected.id } : {}) })}`,
  );
  useEffect(() => {
    if (pendingOnly) {
      setBrandStatus("REQUESTED");
      setModelStatus("REQUESTED");
      setBrandQuery("");
      setModelQuery("");
      setBrandPage(1);
      setModelPage(1);
      setSelected(null);
    } else {
      setBrandStatus((current) => (current === "REQUESTED" ? "all" : current));
      setModelStatus((current) => (current === "REQUESTED" ? "all" : current));
    }
  }, [pendingOnly]);
  const leavePending = () =>
    setParams(
      (current) => {
        const p = new URLSearchParams(current);
        p.delete("pending_only");
        return p;
      },
      { replace: true },
    );
  useEffect(() => {
    if (brands.loading) return;
    setSelected((current) =>
      current
        ? (brands.data?.rows.find((brand) => brand.id === current.id) ??
          current)
        : null,
    );
  }, [brands.data, brands.loading]);
  const close = () => {
    setEditor(null);
    brands.refresh();
    models.refresh();
  };
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="APP CONFIGURATION"
        context="User experience"
        title="Vehicle models"
        description="Manage brands and models. Review driver suggestions before making them available."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setImportKind("brands")}>
            Import brands CSV
          </Button>
          <Button variant="secondary" onClick={() => setImportKind("models")}>
            Import models CSV
          </Button>
          <Button onClick={() => setEditor({ kind: "brand", record: null })}>
            <Icon name="plus" size={18} />
            Add brand
          </Button>
        </div>
      </PageHeading>
      <div className="catalog-split">
        <CatalogPanel
          className="catalog-directory"
          title="Brands"
          actions={
            <PendingBadge
              count={pending?.data?.queues.brands}
              label="brand requests"
            />
          }
          description="Select a brand to manage its models."
          count={brands.data?.total ?? "…"}
          busy={brands.loading}
          toolbar={
            <ManagementToolbar
              stacked
              value={brandQuery}
              onChange={(value) => {
                setBrandQuery(value);
                setBrandPage(1);
              }}
              placeholder="Search brands"
              refresh={brands.refresh}
              busy={brands.loading}
            >
              <ReviewFilter
                value={brandStatus}
                onChange={(value) => {
                  setBrandStatus(value);
                  if (value !== "REQUESTED") leavePending();
                  setBrandPage(1);
                }}
                label="Brand review status"
              />
            </ManagementToolbar>
          }
          footer={
            brands.data &&
            !brands.error && (
              <ManagementPagination
                data={brands.data}
                disabled={brands.loading}
                onPage={setBrandPage}
              />
            )
          }
        >
          <div className="catalog-directory-options">
            <button
              className={`catalog-choice ${!selected ? "is-selected" : ""}`}
              aria-pressed={!selected}
              onClick={() => {
                setSelected(null);
                setModelPage(1);
              }}
            >
              <span className="category-image">
                <Icon name="grid" size={24} />
              </span>
              <span>
                <strong>All brands</strong>
                <small>View the complete model catalog</small>
              </span>
            </button>
            {brands.error ? (
              <div className="catalog-feedback">
                <InlineError message={brands.error} />
              </div>
            ) : brands.loading ? (
              <TableLoading label="Loading brands" />
            ) : !brands.data?.rows.length ? (
              <StateCard
                title="No matching brands"
                message="Add a brand or change your filters."
              />
            ) : (
              brands.data.rows.map((brand) => (
                <div
                  className={`catalog-choice-row ${selected?.id === brand.id ? "is-selected" : ""}`}
                  key={brand.id}
                >
                  <button
                    className="catalog-choice"
                    aria-pressed={selected?.id === brand.id}
                    onClick={() => {
                      setSelected(brand);
                      setModelPage(1);
                    }}
                  >
                    <VehicleIdentity
                      name={brand.name}
                      fallback="layers"
                      logo={brand.logo_url}
                      detail={(brand._count?.models ?? 0) + " models"}
                      badges={
                        <>
                          <Badge
                            tone={
                              brand.status === "VERIFIED"
                                ? "active"
                                : brand.status === "REJECTED"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {brand.status[0] +
                              brand.status.slice(1).toLowerCase()}
                          </Badge>
                          {!brand.is_active && (
                            <Badge tone="inactive">Disabled</Badge>
                          )}
                        </>
                      }
                    />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Edit brand ${brand.name}`}
                    title={`Edit brand ${brand.name}`}
                    onClick={() => setEditor({ kind: "brand", record: brand })}
                  >
                    <Icon name="edit" size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </CatalogPanel>
        <CatalogPanel
          title={selected ? `${selected.name} models` : "All vehicle models"}
          description="Manage model details and review requested additions."
          count={models.data?.total ?? "…"}
          busy={models.loading}
          actions={
            <>
              <PendingBadge
                count={pending?.data?.queues.models}
                label="model requests"
              />
              <Button
                disabled={!selected}
                title={!selected ? "Select a brand first" : undefined}
                onClick={() => {
                  if (selected)
                    setEditor({ kind: "model", record: null, brand: selected });
                }}
              >
                <Icon name="plus" size={18} />
                Add model
              </Button>
            </>
          }
          toolbar={
            <ManagementToolbar
              value={modelQuery}
              onChange={(value) => {
                setModelQuery(value);
                setModelPage(1);
              }}
              placeholder="Search models"
              refresh={models.refresh}
              busy={models.loading}
            >
              <ReviewFilter
                value={modelStatus}
                onChange={(value) => {
                  setModelStatus(value);
                  if (value !== "REQUESTED") leavePending();
                  setModelPage(1);
                }}
                label="Model review status"
              />
            </ManagementToolbar>
          }
          footer={
            models.data &&
            !models.error && (
              <ManagementPagination
                data={models.data}
                disabled={models.loading}
                onPage={setModelPage}
              />
            )
          }
        >
          {models.error ? (
            <div className="catalog-feedback">
              <InlineError message={models.error} />
            </div>
          ) : models.loading ? (
            <TableLoading label="Loading vehicle models" />
          ) : !models.data?.rows.length ? (
            <StateCard
              title="No matching models"
              message={
                selected
                  ? "Add a model for this brand or change the review filter."
                  : "Select or create a brand to add its first model."
              }
            />
          ) : (
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Vehicle models and review status
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Model</th>
                    <th scope="col">Family & fuel</th>
                    <th scope="col">Capacity & years</th>
                    <th scope="col">Review</th>
                    <th scope="col" className="col-actions">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {models.data.rows.map((model) => (
                    <tr key={model.id}>
                      <td>
                        <VehicleIdentity
                          name={model.name}
                          detail={model.brand.name}
                          logo={model.logo_url}
                          vehicle={{ brand: model.brand }}
                          family={model.vehicle_type}
                        />
                      </td>
                      <td>
                        <span className="family-label">
                          {VEHICLE_FAMILIES.find(
                            (family) => family.value === model.vehicle_type,
                          )?.label ?? model.vehicle_type}
                        </span>
                        <small className="cell-detail">
                          {model.fuel_type === "CNG"
                            ? model.fuel_type
                            : model.fuel_type[0] +
                              model.fuel_type.slice(1).toLowerCase()}
                        </small>
                      </td>
                      <td>
                        {model.seating_capacity} seats
                        <small className="cell-detail">
                          {model.year_from ?? "Any year"}
                          {model.year_to ? ` – ${model.year_to}` : ""}
                        </small>
                      </td>
                      <td>
                        <Badge
                          active={
                            model.status === "VERIFIED" && model.is_active
                          }
                          tone={
                            model.status === "REQUESTED"
                              ? "warning"
                              : model.status === "REJECTED"
                                ? "danger"
                                : undefined
                          }
                        >
                          {model.status[0] +
                            model.status.slice(1).toLowerCase()}
                          {!model.is_active ? " · Disabled" : ""}
                        </Badge>
                        <small className="cell-detail">
                          {model.requested_by
                            ? `Requested by ${model.requested_by.email ?? model.requested_by.id}`
                            : model.reviewed_by
                              ? `Reviewed by ${model.reviewed_by.email ?? model.reviewed_by.id}`
                              : "Admin catalog"}
                        </small>
                        {model.rejection_reason && (
                          <small className="cell-detail">
                            {model.rejection_reason}
                          </small>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="icon-button"
                            title={`${model.status === "REQUESTED" ? "Review" : "Edit"} ${model.name}`}
                            aria-label={`${model.status === "REQUESTED" ? "Review" : "Edit"} ${model.name}`}
                            onClick={() =>
                              setEditor({
                                kind: "model",
                                record: model,
                                brand: model.brand,
                              })
                            }
                          >
                            <Icon name="edit" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CatalogPanel>
      </div>
      {importKind && (
        <CatalogImport
          kind={importKind}
          onClose={() => setImportKind(null)}
          onImported={() => {
            brands.refresh();
            models.refresh();
          }}
        />
      )}
      {editor && (
        <CatalogEditor
          target={editor}
          onClose={close}
          onSaved={() => {
            close();
            setToast("Vehicle catalog saved.");
          }}
        />
      )}
      {toast && <Toast message={toast} onDismiss={dismiss} />}
    </div>
  );
}

import { CategoryImage } from "../vehicle-categories/CategoryImage";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Badge } from "../../components/ui/Badge";
import { isCategoryFare } from "../vehicle-categories/category-fare";
import { CategoryFareFields } from "../vehicle-categories/CategoryFareFields";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import {
  InlineError,
  LoadingState,
  StateCard,
} from "../../components/feedback/StateCard";
import { Button } from "../../components/ui/Button";
import { EditorSection, SettingRow } from "../../components/ui/EditorSection";
import { Field } from "../../components/ui/Field";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";
import { ConfigurationMetadata } from "./ConfigurationMetadata";
import { decodeFarePolicy } from "./configuration.validation";
import { ApiError } from "../../lib/api-client";
import { saveFarePolicy, type FarePolicy } from "./configuration.api";

export function FarePolicyPage() {
  const resource = useAdminResource<FarePolicy>(
    "/admin/fare-policy",
    decodeFarePolicy,
  );
  const save = useAdminSave();
  const { clearError } = save;
  const [draft, setDraft] = useState<FarePolicy | null>(null);
  const [saved, setSaved] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [distance, setDistance] = useState("5");
  useEffect(() => {
    if (resource.data) {
      clearError();
      setBlocked(false);
      setDraft({
        ...{
          arrival_radius_m: 150,
          location_max_age_s: 60,
          matching_initial_radius_km: 1,
          matching_max_radius_km: 10,
          matching_expansion_s: 30,
          search_timeout_s: 180,
          offer_lifetime_s: 45,
        },
        ...resource.data,
        rates: resource.data.rates,
      });
    }
  }, [resource.data, clearError]);
  if (resource.loading || (!draft && !resource.error)) return <LoadingState />;
  if (resource.error || !draft)
    return (
      <StateCard
        error
        title="Could not load fare policy"
        message={resource.error ?? "Policy unavailable."}
      >
        <Button onClick={resource.refresh}>Retry</Button>
      </StateCard>
    );
  const previewKm = Number(distance);
  return (
    <div className="personal-page">
      <PageHeading
        eyebrow="App / User"
        title="Fare Policy"
        description="Configure independent distance fares for every vehicle category and subcategory. Saved settings apply to new ride quotes."
      />
      <div className="configuration-summary">
        <ConfigurationMetadata value={draft} />
        <p className="field-hint">
          Shared payment and matching settings. Category fares can also be
          edited in Vehicle Categories.
        </p>
      </div>
      <form
        className="editor-form configuration-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (save.busy || blocked) return;
          void save.run(
            async (signal) => {
              try {
                const value = decodeFarePolicy(
                  await saveFarePolicy(draft, signal),
                );
                resource.setData(value);
              } catch (cause) {
                if (
                  cause instanceof ApiError &&
                  ["FARE_POLICY_CONFLICT", "CATEGORY_FARE_CONFLICT"].includes(
                    cause.code,
                  )
                )
                  setBlocked(true);
                throw cause;
              }
            },
            () => setSaved(true),
          );
        }}
      >
        <fieldset disabled={save.busy} className="contents">
          {draft.rates.length === 0 && (
            <StateCard
              title="No vehicle categories"
              message="Create categories first, then configure each category's independent fare."
            />
          )}
          {draft.rates.map((rate, index) => (
            <EditorSection
              card
              key={rate.category_id}
              step={String(index + 1).padStart(2, "0")}
              title={
                <span className="vehicle-inline">
                  <CategoryImage
                    src={rate.image_url ?? null}
                    family={rate.vehicle_type}
                  />
                  <span>
                    {rate.parent_name
                      ? rate.parent_name + " / " + rate.name
                      : rate.name}
                  </span>
                </span>
              }
              description={
                rate.is_selectable
                  ? "Enabled ride choice. This category has its own fare."
                  : "Disabled or grouping category. Its fare is retained independently; subcategories need their own fares."
              }
            >
              <CategoryFareFields
                prefix={"fare-" + rate.category_id}
                value={rate.fare_policy}
                label={"Configure fare for " + rate.name}
                onChange={(value) => {
                  setSaved(false);
                  setDraft(
                    (current) =>
                      current && {
                        ...current,
                        rates: current.rates.map((item) =>
                          item.category_id === rate.category_id
                            ? { ...item, fare_policy: value }
                            : item,
                        ),
                      },
                  );
                }}
              />
            </EditorSection>
          ))}
          <p className="field-hint">
            Fare = profit-band kilometres × profit rate + remaining kilometres ×
            normal rate. No base fare, time charge, surge or commission is
            added. Existing quotes keep their saved policy.
          </p>
          <EditorSection
            card
            step={String(draft.rates.length + 1).padStart(2, "0")}
            title="Cancellation & Payment Policy"
            description="Payment follows ride completion. Drivers receive the full fare and cannot change it manually."
          >
            <p className="field-hint">
              These saved rules accompany new quotes. Drivers confirm cash or
              UPI receipt after completion. Cancellation and no-show reports are
              reviewed in Ride Reviews; saving this policy never collects a fee.
            </p>
            <SettingRow
              label="Cash payment"
              description="Passenger pays the driver directly."
              checked={draft.cash_enabled}
              onChange={(value) => {
                setSaved(false);
                setDraft(
                  (current) => current && { ...current, cash_enabled: value },
                );
              }}
            />
            <SettingRow
              label="Direct UPI payment"
              description="Passenger pays the driver's registered UPI account; the driver confirms receipt."
              checked={draft.direct_upi_enabled}
              onChange={(value) => {
                setSaved(false);
                setDraft(
                  (current) =>
                    current && { ...current, direct_upi_enabled: value },
                );
              }}
            />
            <SettingRow
              label="Online payment through the app"
              description="Unavailable until a collection and settlement provider is integrated."
              checked={false}
              disabled
              onChange={() => {}}
            />
            <div className="form-grid">
              <Field
                id="policy-commission"
                label="Commission (%)"
                hint="Zero commission at launch. Drivers receive 100% of the ride fare."
              >
                <input
                  id="policy-commission"
                  className="field"
                  type="number"
                  readOnly
                  value={0}
                />
              </Field>
              {(
                [
                  {
                    key: "free_cancellation_minutes",
                    label: "Free Cancellation Time (minutes)",
                    step: "1",
                    max: 60,
                  },
                  {
                    key: "free_pickup_wait_minutes",
                    label: "Free Pickup Waiting Time (minutes)",
                    step: "1",
                    max: 120,
                  },
                  {
                    key: "cancellation_fee_percent",
                    label: "Cancellation Fee Percentage",
                    step: "0.01",
                    max: 100,
                  },
                  {
                    key: "maximum_cancellation_fee",
                    label: "Maximum Cancellation Fee (INR)",
                    step: "0.01",
                    max: 1000000,
                  },
                ] as const
              ).map((field) => (
                <Field
                  key={field.key}
                  id={`policy-${field.key}`}
                  label={field.label}
                >
                  <input
                    id={`policy-${field.key}`}
                    className="field"
                    type="number"
                    min={0}
                    max={field.max}
                    step={field.step}
                    required
                    value={
                      Number.isFinite(draft[field.key]) ? draft[field.key] : ""
                    }
                    onChange={(event) => {
                      setSaved(false);
                      setDraft(
                        (current) =>
                          current && {
                            ...current,
                            [field.key]: event.target.valueAsNumber,
                          },
                      );
                    }}
                  />
                </Field>
              ))}
            </div>
            <p className="field-hint">
              No-show uses the same percentage and cap. A ride cannot receive
              both fees. Valid reasons, late/refusing drivers and disputed
              arrival require review. Approved unpaid fees remain separate
              pending amounts for the affected driver; another driver must not
              collect them.
            </p>
          </EditorSection>
          <EditorSection
            card
            step={String(draft.rates.length + 2).padStart(2, "0")}
            title="Matching & Trip Operations"
            description="Search expands while no driver accepts. Arrival is verified separately against pickup and a fresh, accurate driver fix."
          >
            <div className="form-grid">
              {(
                [
                  {
                    key: "arrival_radius_m",
                    label: "Arrival radius (metres)",
                    min: 20,
                    max: 1000,
                  },
                  {
                    key: "location_max_age_s",
                    label: "Maximum location age (seconds)",
                    min: 10,
                    max: 180,
                  },
                  {
                    key: "matching_initial_radius_km",
                    label: "Initial search radius (km)",
                    min: 1,
                    max: 30,
                  },
                  {
                    key: "matching_max_radius_km",
                    label: "Maximum search radius (km)",
                    min: 1,
                    max: 100,
                  },
                  {
                    key: "matching_expansion_s",
                    label: "Expand search every (seconds)",
                    min: 10,
                    max: 120,
                  },
                  {
                    key: "search_timeout_s",
                    label: "End unmatched search after (seconds)",
                    min: 60,
                    max: 600,
                  },
                  {
                    key: "offer_lifetime_s",
                    label: "Offer lifetime (seconds)",
                    min: 15,
                    max: 120,
                  },
                ] as const
              ).map((field) => (
                <Field key={field.key} id={field.key} label={field.label}>
                  <input
                    id={field.key}
                    className="field"
                    type="number"
                    required
                    step="1"
                    min={field.min}
                    max={field.max}
                    value={
                      Number.isFinite(draft[field.key]) ? draft[field.key] : ""
                    }
                    onChange={(event) => {
                      const value = event.target.valueAsNumber;
                      setSaved(false);
                      setDraft(
                        (current) =>
                          current && { ...current, [field.key]: value },
                      );
                    }}
                  />
                </Field>
              ))}
            </div>
            <p className="field-hint">
              The search radius doubles at each interval up to the maximum.
              No-show waiting starts only after verified arrival. These radii do
              not define a legal service boundary.
            </p>
          </EditorSection>
          {save.error && <InlineError message={save.error} />}
          {save.error && (
            <Button
              variant="secondary"
              onClick={() => {
                setSaved(false);
                resource.refresh();
              }}
            >
              Reload latest policy
            </Button>
          )}
          {saved && (
            <p role="status" className="text-brand">
              Fare policy saved.
            </p>
          )}
          <div className="dialog-footer">
            <Link
              className="button button-secondary"
              to="/app/user/vehicle-categories"
            >
              Vehicle categories
            </Link>
            <Button type="submit" busy={save.busy} disabled={blocked}>
              Save fare policy
            </Button>
          </div>
        </fieldset>
      </form>
      <CatalogPanel
        title="Fare preview"
        description="Estimate with your unsaved rates. Riders see fares from the saved policy."
      >
        <div className="fare-preview-controls">
          <Field id="fare-preview-km" label="Ride distance (km)">
            <input
              id="fare-preview-km"
              className="field"
              type="number"
              min={0}
              max={100000}
              step="0.001"
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
            />
          </Field>
          <span className="field-hint">
            Distance fares only · No time charge or commission
          </span>
        </div>
        <dl className="fare-preview-grid">
          {draft.rates.map((category) => {
            const rate = category.fare_policy;
            const valid =
              rate !== null &&
              isCategoryFare(rate) &&
              distance.trim() !== "" &&
              Number.isFinite(previewKm) &&
              previewKm >= 0 &&
              previewKm <= 100000;
            const price =
              valid && rate
                ? Math.min(previewKm, rate.max_profit_km) *
                    rate.profit_fare_per_km +
                  Math.max(previewKm - rate.max_profit_km, 0) *
                    rate.normal_fare_per_km
                : null;
            return (
              <div className="fare-preview-item" key={category.category_id}>
                <dt>
                  <CategoryImage
                    src={category.image_url ?? null}
                    family={category.vehicle_type}
                  />
                  <span>
                    <strong>{category.name}</strong>
                    {category.parent_name && (
                      <small>{category.parent_name}</small>
                    )}
                  </span>
                </dt>
                <dd>
                  {price === null ? (
                    <Badge tone="inactive">
                      {rate === null
                        ? "Fare not configured"
                        : "Enter valid values"}
                    </Badge>
                  ) : (
                    <>
                      <strong className="fare-preview-price">
                        {new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: "INR",
                        }).format(price)}
                      </strong>
                      <span className="field-hint">for {previewKm} km</span>
                    </>
                  )}
                </dd>
                {!category.is_selectable && (
                  <span className="field-hint">Not an enabled ride choice</span>
                )}
              </div>
            );
          })}
        </dl>
        {draft.rates.length === 0 && (
          <p className="catalog-feedback field-hint">
            Create a category to preview its fare.
          </p>
        )}
      </CatalogPanel>
    </div>
  );
}

import { categoryRateFields } from "./category-fare";
import { Field } from "../../components/ui/Field";
import { SettingRow } from "../../components/ui/EditorSection";
import type { CategoryFare } from "../../types/domain";

export function CategoryFareFields({
  value,
  onChange,
  prefix,
  label = "Configure category fare",
}: {
  value: CategoryFare | null;
  onChange: (value: CategoryFare | null) => void;
  prefix: string;
  label?: string;
}) {
  return (
    <>
      <SettingRow
        label={label}
        description="Independent pricing for this category. Unconfigured categories cannot receive new ride quotes. Parent and vehicle-family fares are never inherited."
        checked={value !== null}
        onChange={(enabled) =>
          onChange(
            enabled
              ? {
                  max_profit_km: NaN,
                  normal_fare_per_km: NaN,
                  profit_fare_per_km: NaN,
                }
              : null,
          )
        }
      />
      {value !== null && (
        <div className="form-grid category-fare-fields">
          {categoryRateFields.map((field) => (
            <Field
              key={field.key}
              id={`${prefix}-${field.key}`}
              label={field.label}
              hint={field.hint}
            >
              <input
                id={`${prefix}-${field.key}`}
                className="field"
                type="number"
                min={0}
                max={field.max}
                step={field.step}
                required
                value={
                  Number.isFinite(value[field.key]) ? value[field.key] : ""
                }
                onChange={(event) =>
                  onChange({
                    ...value,
                    [field.key]: event.target.valueAsNumber,
                  })
                }
              />
            </Field>
          ))}
        </div>
      )}
    </>
  );
}

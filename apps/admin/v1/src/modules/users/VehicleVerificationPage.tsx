import { useEffect, useRef, useState } from "react";
import "../../styles/partner-program.css";
import { useParams } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import {
  InlineError,
  LoadingState,
  StateCard,
} from "../../components/feedback/StateCard";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Field } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { ApiError, safeMessage } from "../../lib/api-client";
import { ApplicationFieldsReview } from "../partner-program/ApplicationFieldsReview";
import { PrivateAssetPreview } from "../partner-program/PrivateAssetPreview";
import {
  partnerStatus,
  partnerTone,
  type PartnerAnswer,
} from "../partner-program/partner-program.type";
import { userName } from "./users.type";
import {
  getVehicleVerifications,
  reviewVehicleField,
  vehiclePrivateFile,
  type VerificationVehicle,
} from "./vehicle-verification.api";

const documentKeys = new Set([
  "front_image",
  "back_image",
  "rc_front",
  "rc_back",
  "insurance",
  "pollution",
]);
export function VehicleVerificationPage() {
  const { userId } = useParams();
  return userId ? (
    <UserVehicles key={userId} id={userId} />
  ) : (
    <StateCard
      title="Select a user"
      message="Choose a user to review their vehicles."
    />
  );
}
function UserVehicles({ id }: { id: string }) {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof getVehicleVerifications>
  > | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const action = useRef<AbortController | null>(null);
  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setActionError(null);
    void getVehicleVerifications(id, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        setData(value);
        setSelected((current) =>
          value.vehicles.some((v) => v.id === current)
            ? current
            : (value.vehicles[0]?.id ?? ""),
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(safeMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, revision]);
  const vehicle = data?.vehicles.find((v) => v.id === selected);
  async function review(
    key: string,
    decision: "APPROVED" | "REJECTED",
    reason?: string,
  ): Promise<boolean> {
    if (!vehicle || action.current || loading || error) return false;
    const controller = new AbortController();
    action.current = controller;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await reviewVehicleField(
        id,
        vehicle,
        key,
        decision,
        reason,
        controller.signal,
      );
      if (controller.signal.aborted) return false;
      setData(
        (current) =>
          current && {
            ...current,
            vehicles: current.vehicles.map((v) =>
              v.id === updated.id ? updated : v,
            ),
          },
      );
      return true;
    } catch (cause) {
      if (!controller.signal.aborted) {
        setActionError(safeMessage(cause));
        if (
          cause instanceof ApiError &&
          (cause.code === "VEHICLE_VERIFICATION_CONFLICT" ||
            cause.status === 0 ||
            cause.status >= 500)
        )
          setError(
            "The latest review state could not be confirmed. Reload before reviewing further.",
          );
      }
      return false;
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      action.current = null;
    }
  }
  if (loading && !data) return <LoadingState />;
  if (!data || error)
    return (
      <StateCard
        error
        title="Could not load vehicles"
        message={error ?? "This user was not found."}
      >
        <Button onClick={() => setRevision((v) => v + 1)}>
          Reload vehicles
        </Button>
      </StateCard>
    );
  return (
    <div className="personal-page vehicle-review-list">
      <PageHeading
        eyebrow="Users"
        context={userName(data.user)}
        title="Vehicle Verification"
        description="Review vehicle details and private documents. Every field must be approved before the vehicle can be used."
      >
        <Button
          variant="secondary"
          disabled={busy || loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          Refresh
        </Button>
      </PageHeading>
      {data.vehicles.length ? (
        <>
          <CatalogPanel
            title="Vehicle registrations"
            description="Choose a submitted vehicle to review its details and documents."
            count={data.vehicles.length}
            actions={
              vehicle && (
                <Badge
                  tone={
                    vehicle.status === "ACTIVE"
                      ? "active"
                      : partnerTone(vehicle.status)
                  }
                >
                  {partnerStatus(vehicle.status)}
                </Badge>
              )
            }
          >
            <div className="vehicle-selection">
              <span className="vehicle-selection-icon">
                <Icon name="shield" size={22} />
              </span>
              <Field id="verification-vehicle" label="Vehicle">
                <select
                  id="verification-vehicle"
                  className="field"
                  value={selected}
                  disabled={busy || loading}
                  onChange={(e) => {
                    setSelected(e.target.value);
                    setActionError(null);
                    setPreview(null);
                  }}
                >
                  {data.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate_number} — {v.make} {v.model} ·{" "}
                      {partnerStatus(v.status)}
                    </option>
                  ))}
                </select>
              </Field>
              {vehicle && (
                <div className="vehicle-review-progress">
                  <span>
                    {
                      vehicle.verification_fields.filter(
                        (field) => field.status === "APPROVED",
                      ).length
                    }{" "}
                    / {vehicle.verification_fields.length} fields approved
                  </span>
                  <progress
                    aria-label="Vehicle field approvals"
                    value={
                      vehicle.verification_fields.filter(
                        (field) => field.status === "APPROVED",
                      ).length
                    }
                    max={Math.max(vehicle.verification_fields.length, 1)}
                  />
                </div>
              )}
            </div>
          </CatalogPanel>
          {vehicle && (
            <VehicleReview
              key={vehicle.id}
              vehicle={vehicle}
              busy={busy}
              blocked={busy || loading}
              error={actionError}
              preview={setPreview}
              review={review}
            />
          )}
        </>
      ) : (
        <StateCard
          title="No vehicles submitted"
          message="This user's vehicle registrations will appear here once submitted."
        />
      )}
      {preview && (
        <PrivateAssetPreview
          assetId={preview}
          onClose={() => setPreview(null)}
          loadFile={vehiclePrivateFile}
        />
      )}
    </div>
  );
}
function VehicleReview({
  vehicle,
  busy,
  blocked,
  error,
  preview,
  review,
}: {
  vehicle: VerificationVehicle;
  busy: boolean;
  blocked: boolean;
  error: string | null;
  preview: (id: string) => void;
  review: (
    key: string,
    decision: "APPROVED" | "REJECTED",
    reason?: string,
  ) => Promise<boolean>;
}) {
  const fields: PartnerAnswer[] = vehicle.verification_fields.map(
    (field, index) => ({
      id: field.key,
      requirement_id: field.key,
      value: documentKeys.has(field.key) ? [field.value] : field.display,
      status: field.status,
      rejection_reason: field.rejection_reason,
      definition: {
        id: field.key,
        label: field.label,
        field_type: documentKeys.has(field.key) ? "IMAGE" : "STRING",
        is_required: true,
        sort_order: index,
        category: {
          name: documentKeys.has(field.key)
            ? "Vehicle documents"
            : "Vehicle details",
          sort_order: documentKeys.has(field.key) ? 1 : 0,
        },
      },
    }),
  );
  const pendingCatalog =
    !vehicle.brand?.is_active ||
    vehicle.brand.status !== "VERIFIED" ||
    !vehicle.catalog_model?.is_active ||
    vehicle.catalog_model.status !== "VERIFIED";
  return (
    <>
      {pendingCatalog && (
        <p className="workspace-notice">
          Verify requested brands and models in App → User → Vehicle Models
          before approving those fields.
        </p>
      )}
      {vehicle.status === "ACTIVE" && vehicle.is_eligible === false && (
        <p className="workspace-notice">
          This approved vehicle is unavailable. Check its catalog and category
          configuration, or request a correction to reopen the affected fields.
        </p>
      )}
      {!fields.length ? (
        <StateCard
          title="Registration needs updating"
          message="This older vehicle has no verification documents. The driver must complete its vehicle verification form."
        />
      ) : (
        <ApplicationFieldsReview
          title="Submitted vehicle"
          reasonLimit={1000}
          fields={fields}
          assets={vehicle.verification_assets.map((asset) => ({
            ...asset,
            mime_type: asset.file_name.endsWith(".pdf")
              ? "application/pdf"
              : "image/webp",
            size: 0,
            purpose: "VEHICLE",
            field_id: asset.field_key,
          }))}
          reviewing={[
            "UNDER_REVIEW",
            "REJECTED",
            "ACTIVE",
            "INACTIVE",
          ].includes(vehicle.status)}
          blocked={blocked}
          busy={busy}
          error={error}
          onPreview={preview}
          onReview={review}
        />
      )}
      {error && <InlineError message={error} />}
    </>
  );
}

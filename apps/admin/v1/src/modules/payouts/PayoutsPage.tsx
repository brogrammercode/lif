import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoadingState, StateCard } from "../../components/feedback/StateCard";
import { PageHeading } from "../../components/layout/PageHeading";
import { Button } from "../../components/ui/Button";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { apiRequest } from "../../lib/api-client";
import { useAdminSave } from "../../lib/useAdminResource";
import { useAdminResource } from "../../lib/useAdminResource";
import { EditPayoutDialog, PayoutBlocksDialog } from "./PayoutControls";

type Cycle = {
  id: string;
  status: string;
  cutoff_at: string;
  scheduled_at: string;
  _count: { payouts: number };
  ride_earnings: Earnings | null;
};

type DriverPayout = {
  id: string;
  updated_at: string;
  status: string;
  amount_paise: string;
  exclusion_reason?: string;
  wallet: { user: { id: string; first_name?: string; last_name?: string } };
  attempts: {
    provider_payout_id?: string;
    utr?: string;
    failure_code?: string;
  }[];
  _count: { lines: number };
  ride_earnings: Earnings | null;
};

type Earnings = {
  gross_paise: string;
  commission_paise: string;
  driver_net_paise: string;
};

type PayoutLine = {
  id: string;
  amount_paise: string;
  ride_id: string | null;
  reference: string | null;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
  ride: { completed_at: string | null; final_fare: string | null } | null;
  gross_paise: string | null;
  commission_paise: string | null;
  commission_percent: string | null;
};

const money = (value: string) => {
  const paise = BigInt(value);
  const absolute = paise < 0n ? -paise : paise;
  return `${paise < 0n ? "−" : ""}₹${(absolute / 100n).toLocaleString("en-IN")}.${String(absolute % 100n).padStart(2, "0")}`;
};

function PayoutBreakdown({ id, close }: { id: string; close: () => void }) {
  const [page, setPage] = useState(1);
  const path = `/admin/payouts/drivers/${encodeURIComponent(id)}/lines?page=${page}`;
  const resource = useAdminResource<{ rows: PayoutLine[]; has_more: boolean }>(
    path,
  );
  const data = resource.dataPath === path ? resource.data : null;
  const error = resource.errorPath === path ? resource.error : null;
  return (
    <Dialog title="Payout breakdown" onClose={close}>
      {error ? (
        <StateCard
          error
          title="Could not load payout breakdown"
          message={error}
        >
          <Button onClick={resource.refresh}>Retry</Button>
        </StateCard>
      ) : !data ? (
        <LoadingState variant="table" label="Loading breakdown" />
      ) : !data.rows.length ? (
        <StateCard
          title="No breakdown entries"
          message="Ride earnings and adjustments will appear here."
        />
      ) : (
        <div className="table-scroll">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Details</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.reference ||
                      (line.ride_id ? `Ride ${line.ride_id}` : "") ||
                      line.id}
                    <span className="table-subtitle">
                      {timestamp(line.created_at)}
                    </span>
                  </td>
                  <td>
                    {line.reason ||
                      (line.ride_id ? "Ride earnings" : "Payout adjustment")}
                    {line.ride?.final_fare && (
                      <span className="table-subtitle">
                        Ride fare ₹{line.ride.final_fare}
                      </span>
                    )}
                    {line.ride?.completed_at && (
                      <span className="table-subtitle">
                        Ride ended {timestamp(line.ride.completed_at)}
                      </span>
                    )}
                    {line.actor_id && (
                      <span className="table-subtitle">
                        Recorded by {line.actor_id}
                      </span>
                    )}
                  </td>
                  <td>
                    {money(line.amount_paise)}
                    {line.gross_paise != null &&
                      line.commission_paise != null && (
                        <>
                          <span className="table-subtitle">
                            Gross {money(line.gross_paise)}
                          </span>
                          <span className="table-subtitle">
                            Commission ({line.commission_percent}%) −
                            {money(line.commission_paise)}
                          </span>
                          <span className="table-subtitle">
                            Net ride earnings
                          </span>
                        </>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(page > 1 || data?.has_more) && (
        <div className="review-toolbar">
          <Button
            variant="secondary"
            disabled={page === 1 || resource.loading}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            disabled={!data?.has_more || resource.loading}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </Dialog>
  );
}

const payoutPath = "/app/user/payouts";
const settingsPath = "/admin/payouts/settings";
type Schedule = {
  enabled: boolean;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  minute_of_day_ist: number;
  weekday_ist: number;
  month_day_ist: number;
  minimum_paise: string;
  require_approval: boolean;
  version: number;
  next_run_at: string | null;
  transfers_enabled: boolean;
  submission_state?:
    | "schedule_paused"
    | "transfers_disabled"
    | "credentials_unavailable"
    | "test_funding"
    | "ready";
  wallet_ride_collection_enabled: boolean;
  wallet_topup_mode: "disabled" | "test" | "live";
  wallet_live_topup_approved: boolean;
  razorpay_x_upi_setup_enabled: boolean;
  razorpay_x_transfers_enabled: boolean;
  provider_readiness?: {
    gateway_mode: "test" | "live" | null;
    topup_active: boolean;
    razorpay_x_ready: boolean;
  };
};

function submissionSummary(schedule: Schedule) {
  switch (schedule.submission_state) {
    case "schedule_paused":
      return "The payout schedule is paused.";
    case "credentials_unavailable":
      return "RazorpayX credentials are unavailable.";
    case "test_funding":
      return "Live payouts are blocked by test funding or an open test checkout.";
    case "ready":
      return "Eligible payouts follow your approval settings.";
    default:
      return schedule.transfers_enabled
        ? "Eligible payouts follow your approval settings."
        : "RazorpayX transfers are disabled.";
  }
}

function SettingsDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: Schedule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [override, setOverride] = useState<string>();
  const save = useAdminSave();
  const field = <K extends keyof Schedule>(key: K, value: Schedule[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const time = `${String(Math.floor(draft.minute_of_day_ist / 60)).padStart(2, "0")}:${String(draft.minute_of_day_ist % 60).padStart(2, "0")}`;
  return (
    <Dialog title="Payout settings" onClose={onClose} busy={save.busy}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(
            (signal) =>
              apiRequest(settingsPath, {
                method: "PUT",
                signal,
                data: {
                  enabled: draft.enabled,
                  frequency: draft.frequency,
                  minute_of_day_ist: draft.minute_of_day_ist,
                  weekday_ist: draft.weekday_ist,
                  month_day_ist: draft.month_day_ist,
                  minimum_paise: draft.minimum_paise,
                  require_approval: draft.require_approval,
                  wallet_ride_collection_enabled:
                    draft.wallet_ride_collection_enabled,
                  wallet_topup_mode: draft.wallet_topup_mode,
                  wallet_live_topup_approved: draft.wallet_live_topup_approved,
                  razorpay_x_upi_setup_enabled:
                    draft.razorpay_x_upi_setup_enabled,
                  razorpay_x_transfers_enabled:
                    draft.razorpay_x_transfers_enabled,
                  expected_version: draft.version,
                  next_run_override:
                    !draft.enabled || override === undefined
                      ? undefined
                      : override
                        ? new Date(`${override}+05:30`).toISOString()
                        : null,
                },
              }),
            onSaved,
          );
        }}
      >
        <fieldset disabled={save.busy} className="space-y-3">
          <legend className="font-semibold">Payments</legend>
          {(
            [
              [
                "wallet_ride_collection_enabled",
                "Allow wallet payment for rides",
              ],
              [
                "razorpay_x_upi_setup_enabled",
                "Allow drivers to verify a payout UPI ID",
              ],
              ["razorpay_x_transfers_enabled", "Submit payouts to RazorpayX"],
            ] as const
          ).map(([key, label]) => (
            <label className="flex items-center gap-2" key={key}>
              <input
                type="checkbox"
                checked={draft[key] === true}
                onChange={(event) => field(key, event.target.checked)}
              />
              {label}
            </label>
          ))}
          <Field id="wallet-topup-mode" label="Wallet top-ups">
            <select
              id="wallet-topup-mode"
              className="field"
              value={draft.wallet_topup_mode ?? "disabled"}
              onChange={(event) =>
                field(
                  "wallet_topup_mode",
                  event.target.value as Schedule["wallet_topup_mode"],
                )
              }
            >
              <option value="disabled">Disabled</option>
              <option value="test">Test</option>
              <option value="live">Live</option>
            </select>
          </Field>
          {(draft.wallet_topup_mode === "live" ||
            draft.wallet_live_topup_approved) && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.wallet_live_topup_approved === true}
                onChange={(event) =>
                  field("wallet_live_topup_approved", event.target.checked)
                }
              />
              Confirm the live wallet arrangement is approved
            </label>
          )}
          {initial.provider_readiness && (
            <p className="text-sm">
              Gateway{" "}
              {initial.provider_readiness.gateway_mode
                ? `${initial.provider_readiness.gateway_mode} credentials configured`
                : "credentials unavailable"}{" "}
              · RazorpayX{" "}
              {initial.provider_readiness.razorpay_x_ready
                ? "credentials configured"
                : "credentials unavailable"}
            </p>
          )}
          {draft.wallet_topup_mode &&
            draft.wallet_topup_mode !== "disabled" &&
            initial.provider_readiness &&
            draft.wallet_topup_mode !==
              initial.provider_readiness.gateway_mode && (
              <p className="text-sm">
                Top-ups become available when matching Gateway credentials are
                configured.
              </p>
            )}
          <p className="text-sm">
            Disabling new top-ups or payouts keeps status checks running for
            existing provider transactions.
          </p>
        </fieldset>
        <fieldset disabled={save.busy}>
          <legend className="font-semibold">Payout schedule</legend>
          <label>
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => field("enabled", event.target.checked)}
            />{" "}
            Enable schedule
          </label>
          <Field id="payout-frequency" label="Frequency">
            <select
              id="payout-frequency"
              className="field"
              value={draft.frequency}
              onChange={(event) =>
                field("frequency", event.target.value as Schedule["frequency"])
              }
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </Field>
          <Field id="payout-time" label="Run time (IST)">
            <input
              id="payout-time"
              className="field"
              type="time"
              required
              value={time}
              onChange={(event) => {
                const [hours, minutes] = event.target.value
                  .split(":")
                  .map(Number);
                if (
                  hours !== undefined &&
                  minutes !== undefined &&
                  Number.isFinite(hours) &&
                  Number.isFinite(minutes)
                )
                  field("minute_of_day_ist", hours * 60 + minutes);
              }}
            />
          </Field>
          {draft.frequency === "WEEKLY" && (
            <Field id="payout-weekday" label="Day of week">
              <select
                id="payout-weekday"
                className="field"
                value={draft.weekday_ist}
                onChange={(event) =>
                  field("weekday_ist", Number(event.target.value))
                }
              >
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {draft.frequency === "MONTHLY" && (
            <Field id="payout-monthday" label="Day of month">
              <input
                id="payout-monthday"
                className="field"
                type="number"
                min={1}
                max={31}
                required
                value={draft.month_day_ist}
                onChange={(event) =>
                  field("month_day_ist", Number(event.target.value))
                }
              />
            </Field>
          )}
          <Field id="payout-next-run" label="Move the next run (IST)">
            <input
              id="payout-next-run"
              className="field"
              type="datetime-local"
              disabled={!draft.enabled}
              value={override ?? ""}
              onChange={(event) => setOverride(event.target.value)}
            />
          </Field>
          {initial.next_run_at && (
            <p>Scheduled next run {timestamp(initial.next_run_at)}</p>
          )}
          <Button
            type="button"
            variant="secondary"
            disabled={!draft.enabled}
            onClick={() => setOverride("")}
          >
            Use recurring schedule
          </Button>
          <Field id="payout-minimum" label="Minimum payout (paise)">
            <input
              id="payout-minimum"
              className="field"
              inputMode="numeric"
              pattern="0|[1-9][0-9]{0,11}"
              required
              value={draft.minimum_paise}
              onChange={(event) => field("minimum_paise", event.target.value)}
            />
          </Field>
          <label>
            <input
              type="checkbox"
              checked={draft.require_approval}
              onChange={(event) =>
                field("require_approval", event.target.checked)
              }
            />{" "}
            Require approval before submission
          </label>
        </fieldset>
        {save.error && <p role="alert">{save.error}</p>}
        <Button type="submit" disabled={save.busy}>
          Save settings
        </Button>
      </form>
    </Dialog>
  );
}
const timestamp = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    timeZoneName: "short",
  });

export function PayoutsPage() {
  const { cycleId } = useParams();
  return <PayoutList key={cycleId ?? "cycles"} cycleId={cycleId} />;
}

function UpcomingPayouts({ close }: { close: () => void }) {
  const [page, setPage] = useState(1);
  const path = `/admin/payouts/upcoming?page=${page}`;
  const resource = useAdminResource<{
    next_run_at: string | null;
    has_more: boolean;
    rows: {
      driver_id: string;
      driver_name: string;
      gross_paise: string;
      commission_paise: string;
      net_paise: string;
      eligibility: string;
    }[];
  }>(path);
  const data = resource.dataPath === path ? resource.data : null;
  const error = resource.errorPath === path ? resource.error : null;
  return (
    <Dialog title="Upcoming payouts" onClose={close}>
      {error ? (
        <StateCard
          title="Could not load upcoming payouts"
          error
          message={error}
        >
          <Button onClick={resource.refresh}>Retry</Button>
        </StateCard>
      ) : !data ? (
        <LoadingState variant="table" label="Loading upcoming payouts" />
      ) : (
        <>
          <p>
            {data.next_run_at
              ? `Estimated from current earnings for ${timestamp(data.next_run_at)}.`
              : "The payout schedule is disabled."}
          </p>
          {data.rows.length ? (
            <div className="table-scroll">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th>Gross</th>
                    <th>Commission</th>
                    <th>Net</th>
                    <th>Eligibility</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.driver_id}>
                      <td>
                        <Link
                          to={`/users/${encodeURIComponent(row.driver_id)}/wallet-ledger?kind=DRIVER`}
                        >
                          {row.driver_name || "View driver"}
                        </Link>
                      </td>
                      <td>{money(row.gross_paise)}</td>
                      <td>{money(row.commission_paise)}</td>
                      <td>{money(row.net_paise)}</td>
                      <td>{row.eligibility}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            data.next_run_at && (
              <p>No unpaid wallet earnings are ready to preview.</p>
            )
          )}
          {(page > 1 || data.has_more) && (
            <div className="review-toolbar">
              <Button
                variant="secondary"
                disabled={page === 1 || resource.loading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={!data.has_more || resource.loading}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

function ReconcilePayout({
  id,
  close,
  done,
}: {
  id: string;
  close: () => void;
  done: () => void;
}) {
  const [providerId, setProviderId] = useState("");
  const save = useAdminSave();
  return (
    <Dialog title="Reconcile payout" onClose={close} busy={save.busy}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(
            (signal) =>
              apiRequest(
                `/admin/payouts/drivers/${encodeURIComponent(id)}/reconcile`,
                {
                  method: "POST",
                  signal,
                  data: { provider_id: providerId.trim() },
                },
              ),
            done,
          );
        }}
      >
        <p>
          Enter the payout ID from RazorpayX. The ledger updates only when the
          reference, destination and amount match.
        </p>
        <Field id="provider-payout-id" label="RazorpayX payout ID">
          <input
            id="provider-payout-id"
            className="field"
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
            maxLength={85}
            disabled={save.busy}
            required
          />
        </Field>
        {save.error && <p role="alert">{save.error}</p>}
        <Button
          type="submit"
          disabled={
            save.busy || !/^pout_[A-Za-z0-9]{1,80}$/.test(providerId.trim())
          }
        >
          Check payout
        </Button>
      </form>
    </Dialog>
  );
}

function PayoutList({ cycleId }: { cycleId?: string }) {
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DriverPayout | null>(null);
  const report = useAdminSave();
  const download = () => {
    if (!cycleId) return;
    void report.run(
      async (signal) => {
        const data = await apiRequest<{ file_name: string; csv: string }>(
          `/admin/payouts/cycles/${encodeURIComponent(cycleId)}/report`,
          { signal },
        );
        const url = URL.createObjectURL(
          new Blob(["\uFEFF", data.csv], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = data.file_name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      () => {},
    );
  };
  const [blocking, setBlocking] = useState(false);
  const [approving, setApproving] = useState(false);
  const approval = useAdminSave();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reconciling, setReconciling] = useState<string | null>(null);
  const schedule = useAdminResource<Schedule>(cycleId ? null : settingsPath);
  const [breakdown, setBreakdown] = useState<string | null>(null);
  const path =
    "/admin/payouts/cycles" +
    (cycleId ? `/${encodeURIComponent(cycleId)}/drivers` : "") +
    `?page=${page}`;
  const resource = useAdminResource<{
    rows: (Cycle | DriverPayout)[];
    has_more: boolean;
    cycle?: { id: string; status: string; version: number };
  }>(path);
  const data = path === resource.dataPath ? resource.data : null;
  const error = path === resource.errorPath ? resource.error : null;
  const waiting = !data && !error;
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="App / User"
        title="Payouts"
        description={
          cycleId
            ? "Driver payments in this cycle."
            : "Review scheduled and past payout cycles."
        }
      >
        {!cycleId && (
          <Button variant="secondary" onClick={() => setBlocking(true)}>
            Driver blocks
          </Button>
        )}
        {!cycleId && (
          <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
            Upcoming payouts
          </Button>
        )}
        {cycleId && <Link to={payoutPath}>All payout cycles</Link>}
        {cycleId && (
          <Button variant="secondary" onClick={download} disabled={report.busy}>
            {report.busy ? "Preparing report…" : "Download report"}
          </Button>
        )}
        {!cycleId && (
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
            Settings
          </Button>
        )}
      </PageHeading>
      {report.error && <p role="alert">{report.error}</p>}
      <CatalogPanel
        title={cycleId ? "Driver payouts" : "Payout cycles"}
        description={
          cycleId
            ? "Amounts, statuses and provider references."
            : schedule.data
              ? `${schedule.data.next_run_at ? `Next run ${timestamp(schedule.data.next_run_at)}. ` : ""}${submissionSummary(schedule.data)}`
              : "Recorded runs and their settlement cutoffs."
        }
        busy={waiting || resource.loading}
        footer={
          (page > 1 || data?.has_more) && (
            <div className="review-toolbar">
              <Button
                variant="secondary"
                disabled={page === 1 || resource.loading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={!data?.has_more || resource.loading}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )
        }
      >
        {waiting ? (
          <LoadingState variant="table" label="Loading payouts" />
        ) : error ? (
          <StateCard error title="Could not load payouts" message={error}>
            <Button onClick={resource.refresh}>Retry</Button>
          </StateCard>
        ) : data?.rows.length ? (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>{cycleId ? "Driver" : "Scheduled run"}</th>
                  <th>{cycleId ? "Amount" : "Cutoff"}</th>
                  <th>Status</th>
                  <th>{cycleId ? "Details" : "Drivers"}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) =>
                  "scheduled_at" in row ? (
                    <tr key={row.id}>
                      <td>
                        <Link
                          to={`${payoutPath}/${encodeURIComponent(row.id)}`}
                        >
                          {timestamp(row.scheduled_at)}
                        </Link>
                      </td>
                      <td>{timestamp(row.cutoff_at)}</td>
                      <td>{row.status.replaceAll("_", " ")}</td>
                      <td>
                        {row._count.payouts}
                        {row.ride_earnings && (
                          <>
                            <span className="table-subtitle">
                              Gross {money(row.ride_earnings.gross_paise)}
                            </span>
                            <span className="table-subtitle">
                              Commission −
                              {money(row.ride_earnings.commission_paise)}
                            </span>
                            <span className="table-subtitle">
                              Net ride earnings{" "}
                              {money(row.ride_earnings.driver_net_paise)}
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td>
                        <Link
                          to={`/users/${encodeURIComponent(row.wallet.user.id)}/wallet-ledger?kind=DRIVER`}
                        >
                          {[
                            row.wallet.user.first_name,
                            row.wallet.user.last_name,
                          ]
                            .filter(Boolean)
                            .join(" ") || "View driver"}
                        </Link>
                      </td>
                      <td>
                        {money(row.amount_paise)}
                        {row.ride_earnings && (
                          <>
                            <span className="table-subtitle">
                              Gross {money(row.ride_earnings.gross_paise)}
                            </span>
                            <span className="table-subtitle">
                              Commission −
                              {money(row.ride_earnings.commission_paise)}
                            </span>
                            <span className="table-subtitle">
                              Net ride earnings{" "}
                              {money(row.ride_earnings.driver_net_paise)}
                            </span>
                          </>
                        )}
                      </td>
                      <td>{row.status.replaceAll("_", " ")}</td>
                      <td>
                        <Button
                          variant="secondary"
                          onClick={() => setBreakdown(row.id)}
                        >
                          Breakdown ({row._count.lines})
                        </Button>
                        {data.cycle?.status === "DRAFT" &&
                          ["DRAFT", "EXCLUDED"].includes(row.status) && (
                            <Button
                              variant="secondary"
                              onClick={() => setEditing(row)}
                            >
                              Edit draft
                            </Button>
                          )}
                        {row.status === "REVIEW_REQUIRED" &&
                          row.attempts[0]?.failure_code ===
                            "SUBMISSION_UNCONFIRMED" && (
                            <Button
                              variant="secondary"
                              onClick={() => setReconciling(row.id)}
                            >
                              Reconcile
                            </Button>
                          )}
                        {row.exclusion_reason && (
                          <span className="table-subtitle">
                            {row.exclusion_reason}
                          </span>
                        )}
                        {row.attempts[0]?.utr && (
                          <span className="table-subtitle">
                            UTR {row.attempts[0].utr}
                          </span>
                        )}
                        {row.attempts[0]?.provider_payout_id && (
                          <span className="table-subtitle">
                            {row.attempts[0].provider_payout_id}
                          </span>
                        )}
                        {row.attempts[0]?.failure_code && (
                          <span className="table-subtitle">
                            {row.attempts[0].failure_code}
                          </span>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <StateCard
            title={cycleId ? "No drivers in this cycle" : "No payout cycles"}
            message={
              cycleId
                ? "Driver payouts will appear here when recorded."
                : "Scheduled and past cycles will appear here when recorded."
            }
          />
        )}
      </CatalogPanel>
      {data?.cycle?.status === "DRAFT" && (
        <Button variant="secondary" onClick={() => setApproving(true)}>
          Approve cycle
        </Button>
      )}
      {approving && data?.cycle && (
        <Dialog
          title="Approve this payout cycle?"
          onClose={() => setApproving(false)}
          busy={approval.busy}
        >
          <p>
            Approval locks draft edits and queues eligible payouts when
            RazorpayX transfers are enabled.
          </p>
          {approval.error && <p role="alert">{approval.error}</p>}
          <Button
            disabled={approval.busy}
            onClick={() => {
              const cycle = data.cycle;
              if (!cycle) return;
              void approval.run(
                (signal) =>
                  apiRequest(
                    `/admin/payouts/cycles/${encodeURIComponent(cycle.id)}/approve`,
                    {
                      method: "POST",
                      signal,
                      data: { version: cycle.version },
                    },
                  ),
                () => {
                  setApproving(false);
                  resource.refresh();
                },
              );
            }}
          >
            Confirm approval
          </Button>
        </Dialog>
      )}
      {blocking && <PayoutBlocksDialog onClose={() => setBlocking(false)} />}
      {previewOpen && <UpcomingPayouts close={() => setPreviewOpen(false)} />}
      {reconciling && (
        <ReconcilePayout
          id={reconciling}
          close={() => setReconciling(null)}
          done={() => {
            setReconciling(null);
            resource.refresh();
          }}
        />
      )}
      {editing && (
        <EditPayoutDialog
          payout={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            resource.refresh();
          }}
        />
      )}
      {settingsOpen &&
        (schedule.data ? (
          <SettingsDialog
            initial={schedule.data}
            onClose={() => setSettingsOpen(false)}
            onSaved={() => {
              schedule.refresh();
              setSettingsOpen(false);
            }}
          />
        ) : (
          <Dialog
            title="Payout settings"
            onClose={() => setSettingsOpen(false)}
          >
            {schedule.error ? (
              <StateCard
                error
                title="Could not load settings"
                message={schedule.error}
              >
                <Button onClick={schedule.refresh}>Retry</Button>
              </StateCard>
            ) : (
              <LoadingState variant="table" label="Loading settings" />
            )}
          </Dialog>
        ))}
      {breakdown && (
        <PayoutBreakdown id={breakdown} close={() => setBreakdown(null)} />
      )}
    </div>
  );
}

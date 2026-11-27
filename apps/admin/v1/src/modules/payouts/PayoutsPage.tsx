import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { LoadingState, StateCard } from "../../components/feedback/StateCard";
import { PageHeading } from "../../components/layout/PageHeading";
import { Button } from "../../components/ui/Button";
import { CatalogPanel, PanelNote } from "../../components/ui/CatalogPanel";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Badge } from "../../components/ui/Badge";
import { Icon } from "../../components/ui/Icon";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { SettingRow } from "../../components/ui/EditorSection";
import {
  FinanceDialogForm,
  FinancePagination,
  financeDate as timestamp,
  formatPaise as money,
} from "../../components/ui/FinanceLayout";
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

function PayoutStatus({ status }: { status: string }) {
  const tones: Record<string, "active" | "inactive" | "warning" | "danger"> = {
    PAID: "active",
    ELIGIBLE: "active",
    PROCESSING: "warning",
    PARTIALLY_PAID: "warning",
    REVIEW_REQUIRED: "warning",
    FAILED: "danger",
    BLOCKED: "danger",
  };
  const key = status.toUpperCase();
  const label = key.toLowerCase().replaceAll("_", " ");
  return (
    <Badge tone={tones[key] ?? "inactive"}>
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </Badge>
  );
}

function RideEarnings({ earnings }: { earnings: Earnings }) {
  return (
    <div className="mt-1 grid gap-0.5 text-xs font-normal text-muted">
      <span>Gross {money(earnings.gross_paise)}</span>
      <span>Commission ?{money(earnings.commission_paise)}</span>
      <span>Net {money(earnings.driver_net_paise)}</span>
    </div>
  );
}

function payoutDriverName(payout: DriverPayout) {
  const { first_name, last_name } = payout.wallet.user;
  return [first_name, last_name].filter(Boolean).join(" ") || "Driver";
}

function PayoutBreakdown({
  payout,
  close,
}: {
  payout: DriverPayout;
  close: () => void;
}) {
  const [page, setPage] = useState(1);
  const path = `/admin/payouts/drivers/${encodeURIComponent(payout.id)}/lines?page=${page}`;
  const resource = useAdminResource<{ rows: PayoutLine[]; has_more: boolean }>(
    path,
  );
  const data = resource.dataPath === path ? resource.data : null;
  const error = resource.errorPath === path ? resource.error : null;
  return (
    <Dialog
      title="Payout breakdown"
      description={payoutDriverName(payout)}
      onClose={close}
      compact
    >
      <div className="trip-dialog-body">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-[#fafafa] px-3 py-2">
          <div>
            <p className="text-xs text-muted">Payout amount</p>
            <strong className="tabular-nums">
              {money(payout.amount_paise)}
            </strong>
          </div>
          <PayoutStatus status={payout.status} />
        </div>
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
          <div className="table-scroll finance-dialog-table">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Details</th>
                  <th className="finance-money">Amount</th>
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
                    <td className="finance-money">
                      <span className="font-semibold text-ink">
                        {money(line.amount_paise)}
                      </span>
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
                          </>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <FinancePagination
        page={page}
        hasMore={data?.has_more}
        busy={resource.loading}
        onPage={setPage}
      />
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
  planned_next_run_at?: string | null;
  transfers_enabled: boolean;
  submission_state?:
    | "schedule_paused"
    | "transfers_disabled"
    | "credentials_unavailable"
    | "test_funding"
    | "ready";
  razorpay_ride_upi_enabled?: boolean;
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
  onPaymentControls,
}: {
  initial: Schedule;
  onClose: () => void;
  onSaved: () => void;
  onPaymentControls: () => void;
}) {
  const [frequency, setFrequency] = useState(initial.frequency);
  const [date, setDate] = useState("");
  const save = useAdminSave();
  const plannedDate = initial.planned_next_run_at ?? initial.next_run_at;
  return (
    <Dialog title="Payout settings" onClose={onClose} busy={save.busy} compact>
      <FinanceDialogForm
        close={onClose}
        busy={save.busy}
        error={save.error}
        action="Save settings"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(
            (signal) =>
              apiRequest(settingsPath, {
                method: "PUT",
                signal,
                data: {
                  expected_version: initial.version,
                  frequency,
                  ...(date && { next_run_date: date }),
                },
              }),
            onSaved,
          );
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="payout-frequency" label="Frequency">
            <select
              id="payout-frequency"
              className="field"
              value={frequency}
              onChange={(event) =>
                setFrequency(event.target.value as Schedule["frequency"])
              }
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </Field>
          <Field id="payout-next-run" label="Next payout date (IST)">
            <input
              id="payout-next-run"
              className="field"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        </div>
        {plannedDate && (
          <p className="field-hint">
            {initial.enabled ? "Next payout date" : "Planned payout date"}{" "}
            {new Intl.DateTimeFormat("en-IN", {
              dateStyle: "medium",
              timeZone: "Asia/Kolkata",
            }).format(new Date(plannedDate))}
            {!initial.enabled && " · Payout cycles are paused"}
          </p>
        )}
        <p className="field-hint">
          The job checks for due payouts daily at 5:00 AM IST. A date you choose
          starts the new cadence. Leave it blank to calculate the date when the
          cadence changes.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="justify-self-start"
          disabled={save.busy}
          onClick={onPaymentControls}
        >
          Payment controls
        </Button>
      </FinanceDialogForm>
    </Dialog>
  );
}

function PaymentControlsDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: Schedule;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const save = useAdminSave();
  const field = <K extends keyof Schedule>(key: K, value: Schedule[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  return (
    <Dialog title="Payment controls" onClose={onClose} busy={save.busy} compact>
      <FinanceDialogForm
        close={onClose}
        busy={save.busy}
        error={save.error}
        action="Save settings"
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
                  razorpay_ride_upi_enabled: draft.razorpay_ride_upi_enabled,
                  wallet_ride_collection_enabled:
                    draft.wallet_ride_collection_enabled,
                  wallet_topup_mode: draft.wallet_topup_mode,
                  wallet_live_topup_approved: draft.wallet_live_topup_approved,
                  razorpay_x_upi_setup_enabled:
                    draft.razorpay_x_upi_setup_enabled,
                  razorpay_x_transfers_enabled:
                    draft.razorpay_x_transfers_enabled,
                  expected_version: draft.version,
                },
              }),
            onSaved,
          );
        }}
      >
        <fieldset className="m-0 grid min-w-0 gap-3 rounded-lg border border-line px-3 pb-3">
          <legend className="px-1 text-sm font-semibold text-ink">
            Payments
          </legend>
          <div className="grid gap-2">
            <SettingRow
              label="Allow Razorpay UPI for rides"
              checked={draft.razorpay_ride_upi_enabled === true}
              onChange={(value) => field("razorpay_ride_upi_enabled", value)}
              disabled={save.busy}
            />
            <SettingRow
              label="Allow wallet payment for rides"
              checked={draft.wallet_ride_collection_enabled}
              onChange={(value) =>
                field("wallet_ride_collection_enabled", value)
              }
              disabled={save.busy}
            />
            <SettingRow
              label="Allow drivers to verify a payout UPI ID"
              checked={draft.razorpay_x_upi_setup_enabled}
              onChange={(value) => field("razorpay_x_upi_setup_enabled", value)}
              disabled={save.busy}
            />
            <SettingRow
              label="Submit payouts to RazorpayX"
              checked={draft.razorpay_x_transfers_enabled}
              onChange={(value) => field("razorpay_x_transfers_enabled", value)}
              disabled={save.busy}
            />
          </div>
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
            <label className="flex items-center gap-2 font-medium">
              <input
                className="accent-brand"
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
            <p className="field-hint">
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
              <p className="field-hint">
                Top-ups become available when matching Gateway credentials are
                configured.
              </p>
            )}
          <p className="field-hint">
            Disabling new top-ups or payouts keeps status checks running for
            existing provider transactions.
          </p>
        </fieldset>
        <fieldset className="m-0 grid min-w-0 gap-3 rounded-lg border border-line px-3 pb-3">
          <legend className="px-1 text-sm font-semibold text-ink">
            Payout safeguards
          </legend>
          <SettingRow
            label="Enable payout cycles"
            checked={draft.enabled}
            onChange={(value) => field("enabled", value)}
            disabled={save.busy}
          />
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
          <SettingRow
            label="Require approval before submission"
            checked={draft.require_approval}
            onChange={(value) => field("require_approval", value)}
            disabled={save.busy}
          />
        </fieldset>
      </FinanceDialogForm>
    </Dialog>
  );
}
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
    <Dialog title="Upcoming payouts" onClose={close} compact>
      <div className="trip-dialog-body">
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
            <PanelNote icon="clock">
              {data.next_run_at
                ? `Estimated from current earnings for ${timestamp(data.next_run_at)}.`
                : "The payout schedule is disabled."}
            </PanelNote>
            {data.rows.length ? (
              <div className="table-scroll finance-dialog-table">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th className="finance-money">Gross</th>
                      <th className="finance-money">Commission</th>
                      <th className="finance-money">Net</th>
                      <th>Eligibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.driver_id}>
                        <td>
                          <Link
                            className="font-semibold text-ink hover:text-brand hover:underline"
                            to={`/users/${encodeURIComponent(row.driver_id)}/wallet-ledger?kind=DRIVER`}
                          >
                            {row.driver_name || "View driver"}
                          </Link>
                        </td>
                        <td className="finance-money">
                          {money(row.gross_paise)}
                        </td>
                        <td className="finance-money">
                          {money(row.commission_paise)}
                        </td>
                        <td className="finance-money font-semibold text-ink">
                          {money(row.net_paise)}
                        </td>
                        <td>
                          <PayoutStatus status={row.eligibility} />
                        </td>
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
          </>
        )}
      </div>
      <FinancePagination
        page={page}
        hasMore={data?.has_more}
        busy={resource.loading}
        onPage={setPage}
      />
    </Dialog>
  );
}

function ReconcilePayout({
  payout,
  close,
  done,
}: {
  payout: DriverPayout;
  close: () => void;
  done: () => void;
}) {
  const [providerId, setProviderId] = useState("");
  const save = useAdminSave();
  return (
    <Dialog title="Reconcile payout" onClose={close} busy={save.busy} compact>
      <FinanceDialogForm
        close={close}
        busy={save.busy}
        error={save.error}
        action="Check payout"
        disabled={!/^pout_[A-Za-z0-9]{1,80}$/.test(providerId.trim())}
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(
            (signal) =>
              apiRequest(
                `/admin/payouts/drivers/${encodeURIComponent(payout.id)}/reconcile`,
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
      </FinanceDialogForm>
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
  const [settingsOpen, setSettingsOpen] = useState<
    "schedule" | "controls" | null
  >(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [reconciling, setReconciling] = useState<DriverPayout | null>(null);
  const schedule = useAdminResource<Schedule>(cycleId ? null : settingsPath);
  const [breakdown, setBreakdown] = useState<DriverPayout | null>(null);
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
    <div className="catalog-page finance-page">
      <PageHeading
        eyebrow="App / User"
        title={cycleId ? "Payout cycle" : "Payouts"}
        description={
          cycleId
            ? "Driver payments in this cycle."
            : "Review scheduled and past payout cycles."
        }
      >
        {!cycleId && (
          <Button variant="secondary" onClick={() => setBlocking(true)}>
            <Icon name="shield" size={16} />
            Driver blocks
          </Button>
        )}
        {!cycleId && (
          <Button variant="secondary" onClick={() => setPreviewOpen(true)}>
            <Icon name="clock" size={16} />
            Upcoming payouts
          </Button>
        )}
        {cycleId && (
          <Link className="button button-secondary" to={payoutPath}>
            <Icon name="arrowLeft" size={16} /> All payout cycles
          </Link>
        )}
        {cycleId && (
          <Button variant="secondary" onClick={download} busy={report.busy}>
            {report.busy ? "Preparing report…" : "Download report"}
          </Button>
        )}
        {!cycleId && (
          <Button onClick={() => setSettingsOpen("schedule")}>
            <Icon name="settings" size={16} />
            Settings
          </Button>
        )}
        {data?.cycle?.status === "DRAFT" && (
          <Button onClick={() => setApproving(true)}>Approve cycle</Button>
        )}
      </PageHeading>
      {report.error && (
        <div role="alert">
          <PanelNote icon="error">{report.error}</PanelNote>
        </div>
      )}
      <CatalogPanel
        title={cycleId ? "Driver payouts" : "Payout cycles"}
        description={
          cycleId
            ? "Amounts, statuses and provider references."
            : "Review recorded payouts by cycle."
        }
        toolbar={
          !cycleId &&
          schedule.data && (
            <div className="px-4 pb-3 sm:px-5">
              <PanelNote icon="clock">
                {schedule.data.next_run_at && (
                  <strong className="mr-2 font-semibold">
                    Next run {timestamp(schedule.data.next_run_at)}.
                  </strong>
                )}
                {submissionSummary(schedule.data)}
              </PanelNote>
            </div>
          )
        }
        busy={waiting || resource.loading}
        actions={
          <Button
            variant="secondary"
            busy={resource.loading}
            onClick={resource.refresh}
          >
            <Icon name="refresh" size={16} /> Refresh
          </Button>
        }
        footer={
          <FinancePagination
            page={page}
            hasMore={data?.has_more}
            busy={waiting || resource.loading}
            onPage={setPage}
          />
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
            <table className="finance-table">
              <thead>
                <tr>
                  <th>{cycleId ? "Driver" : "Scheduled run"}</th>
                  <th className={cycleId ? "finance-money" : undefined}>
                    {cycleId ? "Amount" : "Cutoff"}
                  </th>
                  <th>Status</th>
                  <th>{cycleId ? "Actions" : "Drivers and earnings"}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) =>
                  "scheduled_at" in row ? (
                    <tr key={row.id}>
                      <td>
                        <Link
                          className="font-semibold text-ink hover:text-brand hover:underline"
                          to={`${payoutPath}/${encodeURIComponent(row.id)}`}
                        >
                          {timestamp(row.scheduled_at)}
                        </Link>
                      </td>
                      <td>{timestamp(row.cutoff_at)}</td>
                      <td>
                        <PayoutStatus status={row.status} />
                      </td>
                      <td>
                        {row._count.payouts}
                        {row.ride_earnings && (
                          <RideEarnings earnings={row.ride_earnings} />
                        )}
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td>
                        <Link
                          className="font-semibold text-ink hover:text-brand hover:underline"
                          to={`/users/${encodeURIComponent(row.wallet.user.id)}/wallet-ledger?kind=DRIVER`}
                        >
                          {payoutDriverName(row)}
                        </Link>
                      </td>
                      <td className="finance-money">
                        <span className="font-semibold text-ink">
                          {money(row.amount_paise)}
                        </span>
                        {row.ride_earnings && (
                          <RideEarnings earnings={row.ride_earnings} />
                        )}
                      </td>
                      <td>
                        <PayoutStatus status={row.status} />
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
                      <td>
                        <ActionMenu
                          label="Payout actions"
                          items={[
                            {
                              label: `Breakdown (${row._count.lines})`,
                              icon: "layers",
                              onSelect: () => setBreakdown(row),
                            },
                            ...(data.cycle?.status === "DRAFT" &&
                            ["DRAFT", "EXCLUDED"].includes(row.status)
                              ? [
                                  {
                                    label: "Edit draft",
                                    icon: "edit" as const,
                                    onSelect: () => setEditing(row),
                                  },
                                ]
                              : []),
                            ...(row.status === "REVIEW_REQUIRED" &&
                            row.attempts[0]?.failure_code ===
                              "SUBMISSION_UNCONFIRMED"
                              ? [
                                  {
                                    label: "Reconcile",
                                    icon: "settings" as const,
                                    onSelect: () => setReconciling(row),
                                  },
                                ]
                              : []),
                          ]}
                        />
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
      {approving && data?.cycle && (
        <Dialog
          title="Approve this payout cycle?"
          onClose={() => setApproving(false)}
          busy={approval.busy}
          compact
        >
          <div className="trip-dialog-body">
            <p>
              Approval locks draft edits and queues eligible payouts when
              RazorpayX transfers are enabled.
            </p>
            {approval.error && (
              <p role="alert" className="text-red-700">
                {approval.error}
              </p>
            )}
          </div>
          <div className="dialog-footer">
            <Button
              variant="secondary"
              disabled={approval.busy}
              onClick={() => setApproving(false)}
            >
              Cancel
            </Button>
            <Button
              busy={approval.busy}
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
          </div>
        </Dialog>
      )}
      {blocking && <PayoutBlocksDialog onClose={() => setBlocking(false)} />}
      {previewOpen && <UpcomingPayouts close={() => setPreviewOpen(false)} />}
      {reconciling && (
        <ReconcilePayout
          payout={reconciling}
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
          driverName={payoutDriverName(editing)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            resource.refresh();
          }}
        />
      )}
      {settingsOpen &&
        (schedule.data ? (
          settingsOpen === "controls" ? (
            <PaymentControlsDialog
              initial={schedule.data}
              onClose={() => setSettingsOpen(null)}
              onSaved={() => {
                schedule.refresh();
                setSettingsOpen(null);
              }}
            />
          ) : (
            <SettingsDialog
              initial={schedule.data}
              onClose={() => setSettingsOpen(null)}
              onPaymentControls={() => setSettingsOpen("controls")}
              onSaved={() => {
                schedule.refresh();
                setSettingsOpen(null);
              }}
            />
          )
        ) : (
          <Dialog
            title="Payout settings"
            onClose={() => setSettingsOpen(null)}
            compact
          >
            <div className="trip-dialog-body">
              {schedule.error ? (
                <StateCard
                  error
                  title="Could not load settings"
                  message={schedule.error}
                >
                  <Button onClick={schedule.refresh}>Retry</Button>
                </StateCard>
              ) : (
                <LoadingState variant="form" label="Loading settings" />
              )}
            </div>
          </Dialog>
        ))}
      {breakdown && (
        <PayoutBreakdown payout={breakdown} close={() => setBreakdown(null)} />
      )}
    </div>
  );
}

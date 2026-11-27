import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { StateCard } from "../../components/feedback/StateCard";
import { PageHeading } from "../../components/layout/PageHeading";
import { Button } from "../../components/ui/Button";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import { Field } from "../../components/ui/Field";
import { Dialog } from "../../components/ui/Dialog";
import { Badge } from "../../components/ui/Badge";
import { Icon, type IconName } from "../../components/ui/Icon";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  FinanceDialogForm,
  FinancePagination,
  financeDate as istDate,
  formatPaise as money,
} from "../../components/ui/FinanceLayout";
import { TripFacts, TripSection } from "./TripDetails";
import { apiRequest } from "../../lib/api-client";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";

type Ledger = {
  available_paise: string;
  held_paise: string;
  has_more: boolean;
  activity: WalletActivity[];
};
type LedgerEntry = {
  id: string;
  kind: string;
  created_at: string;
  external_amount_paise?: string;
  available_delta_paise: string;
  held_delta_paise: string;
  available_after_paise: string;
  held_after_paise: string;
  ride_id?: string;
  payment_id?: string;
  topup_id?: string;
  payout_id?: string;
  reverses_entry_id?: string;
  reversed?: boolean;
  gross_paise?: string | null;
  commission_paise?: string | null;
  commission_percent?: string | null;
};
type TopUp = {
  id: string;
  status: string;
  amount_paise: string;
  failure_reason?: string | null;
  checkout_kind: string;
  provider_mode?: string | null;
  provider_link_id?: string | null;
  provider_order_id?: string | null;
  provider_payment_id?: string | null;
  created_at: string;
  updated_at: string;
};
type WalletActivity = {
  id: string;
  created_at: string;
} & (
  | { source: "entry"; entry: LedgerEntry; topup?: TopUp }
  | { source: "attempt"; entry?: undefined; topup: TopUp }
);

const entryLabels: Record<string, string> = {
  TOP_UP: "Money added",
  CASH_PAYMENT: "Cash payment",
  RIDE_DEBIT: "Ride payment",
  RIDE_EARNING: "Ride earnings",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
  PAYOUT_HOLD: "Reserved for payout",
  PAYOUT_SETTLED: "Payout paid",
  PAYOUT_RELEASE: "Payout funds released",
};

export function UserWalletLedgerPage() {
  const { userId } = useParams();
  const [search] = useSearchParams();
  const kind = search.get("kind") === "DRIVER" ? "DRIVER" : "RIDER";
  return userId ? (
    <UserWalletLedger
      key={`${userId}:${kind}`}
      userId={userId}
      initialKind={kind}
    />
  ) : null;
}

const ledgerKinds = [
  "TOP_UP",
  "CASH_PAYMENT",
  "RIDE_DEBIT",
  "RIDE_EARNING",
  "REFUND",
  "ADJUSTMENT",
  "PAYOUT_HOLD",
  "PAYOUT_SETTLED",
  "PAYOUT_RELEASE",
];

function UserWalletLedger({
  userId,
  initialKind,
}: {
  userId: string;
  initialKind: string;
}) {
  const [kind, setKind] = useState(initialKind);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState("");
  const [action, setAction] = useState<{
    id: string;
    kind: "refund" | "review";
  } | null>(null);
  const [selected, setSelected] = useState<WalletActivity | null>(null);
  const base = `/admin/users/${encodeURIComponent(userId)}/wallet-ledger`;
  const walletPrefix = `${base}?kind=${kind}&`;
  const path = `${walletPrefix}timeline=true&page=${page}${filters ? `&${filters}` : ""}`;
  const wallet = useAdminResource<Ledger>(path);
  const data = wallet.dataPath === path ? wallet.data : null;
  const error = wallet.errorPath === path ? wallet.error : null;
  const loading = !data && !error;
  const balance = wallet.dataPath?.startsWith(walletPrefix)
    ? wallet.data
    : null;

  return (
    <div className="catalog-page finance-page">
      <PageHeading
        title="Wallet Ledger"
        eyebrow="Users / Wallet Ledger"
        description="Review the rider and driver wallet activity for this account."
      />
      <CatalogPanel
        title="Wallet balance"
        description={kind === "DRIVER" ? "Driver wallet" : "Rider wallet"}
        busy={!balance && loading}
      >
        <dl className="grid grid-cols-2 divide-x divide-line border-t border-line">
          {(
            [
              ["Available balance", balance?.available_paise],
              ["Held balance", balance?.held_paise],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="min-w-0 px-4 py-3 sm:px-5">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-lg font-semibold text-ink tabular-nums [overflow-wrap:anywhere]">
                {value !== undefined ? (
                  money(value)
                ) : loading ? (
                  <Skeleton className="h-6 w-24" />
                ) : (
                  "Unavailable"
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CatalogPanel>
      <CatalogPanel
        title="Wallet activity"
        busy={loading || wallet.loading}
        description="Top-up attempts and wallet balance movements for this account."
        actions={
          <Button
            variant="secondary"
            disabled={wallet.loading}
            onClick={wallet.refresh}
          >
            <Icon name="refresh" size={16} />
            Refresh
          </Button>
        }
        toolbar={
          <form
            className="grid items-end gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-3 2xl:grid-cols-6"
            onSubmit={(event) => {
              event.preventDefault();
              const query = new URLSearchParams();
              for (const [key, field] of new FormData(event.currentTarget)) {
                if (typeof field === "string" && field.trim())
                  query.set(key, field.trim());
              }
              setPage(1);
              setFilters(query.toString());
            }}
          >
            <Field id="wallet-kind" label="Wallet">
              <select
                id="wallet-kind"
                className="field"
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value);
                  setPage(1);
                }}
              >
                <option value="RIDER">Rider</option>
                <option value="DRIVER">Driver</option>
              </select>
            </Field>
            <Field id="wallet-entry-kind" label="Entry type">
              <select
                className="field"
                id="wallet-entry-kind"
                name="entry_kind"
              >
                <option value="">All entries</option>
                {ledgerKinds.map((entry) => (
                  <option key={entry} value={entry}>
                    {entryLabels[entry]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="wallet-from" label="From (IST)">
              <input
                className="field"
                id="wallet-from"
                name="from"
                type="date"
              />
            </Field>
            <Field id="wallet-to" label="To (IST)">
              <input className="field" id="wallet-to" name="to" type="date" />
            </Field>
            <Field id="wallet-reference" label="Reference ID">
              <input
                className="field"
                id="wallet-reference"
                name="reference"
                maxLength={100}
              />
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="secondary">
                Apply filters
              </Button>
              {filters && (
                <Button
                  type="reset"
                  variant="secondary"
                  onClick={() => {
                    setPage(1);
                    setFilters("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          </form>
        }
        footer={
          <FinancePagination
            page={page}
            hasMore={data?.has_more}
            busy={loading || wallet.loading}
            onPage={setPage}
          />
        }
      >
        {loading ? (
          <TableLoading label="Loading wallet activity" />
        ) : error && !data ? (
          <StateCard
            error
            title="Could not load wallet activity"
            message={error}
          >
            <Button onClick={wallet.refresh}>Retry</Button>
          </StateCard>
        ) : (
          <>
            {error && (
              <p
                role="alert"
                className="px-4 pb-3 text-sm text-red-700 sm:px-5"
              >
                {error}
              </p>
            )}
            {data?.activity.length ? (
              <ul className="divide-y divide-line border-t border-line">
                {data.activity.map((item) => (
                  <li key={`${item.source}:${item.id}`}>
                    <WalletActivityCard
                      item={item}
                      open={() => setSelected(item)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <StateCard
                title="No wallet transactions"
                message="Top-up attempts and posted wallet entries will appear here."
              />
            )}
          </>
        )}
      </CatalogPanel>
      {selected && (
        <WalletActivityDetails
          item={selected}
          close={() => setSelected(null)}
          onAction={(next) => {
            setSelected(null);
            setAction(next);
          }}
        />
      )}
      {action && (
        <WalletLedgerAction
          kind={action.kind}
          path={`${base}/${action.kind === "refund" ? "rides" : "topups"}/${encodeURIComponent(action.id)}/${action.kind === "refund" ? "refund" : "reconcile"}`}
          close={() => setAction(null)}
          done={() => {
            setAction(null);
            wallet.refresh();
          }}
        />
      )}
    </div>
  );
}

function activityTitle(item: WalletActivity) {
  return item.entry
    ? (entryLabels[item.entry.kind] ?? "Wallet activity")
    : "Wallet top-up";
}

function activityStatus(item: WalletActivity) {
  const status =
    item.topup?.status ?? (item.entry?.reversed ? "REFUNDED" : "CAPTURED");
  const labels: Record<
    string,
    {
      label: string;
      tone: "active" | "inactive" | "warning" | "danger";
      icon: IconName;
    }
  > = {
    CAPTURED: { label: "Successful", tone: "active", icon: "success" },
    CREATING: { label: "Preparing", tone: "warning", icon: "clock" },
    PENDING: { label: "Pending", tone: "warning", icon: "clock" },
    FAILED: { label: "Failed", tone: "danger", icon: "error" },
    CANCELLED: { label: "Cancelled", tone: "inactive", icon: "close" },
    REFUNDED: { label: "Refunded", tone: "inactive", icon: "child" },
    REVIEW_REQUIRED: { label: "Under review", tone: "warning", icon: "error" },
  };
  return (
    labels[status] ?? {
      label: status,
      tone: "inactive" as const,
      icon: "layers" as const,
    }
  );
}

function activityAmount(item: WalletActivity) {
  if (!item.entry) return money(item.topup.amount_paise);
  const available = item.entry.available_delta_paise;
  const amount =
    item.entry.external_amount_paise ??
    (available === "0" ? item.entry.held_delta_paise : available);
  return `${BigInt(amount) > 0n ? "+" : ""}${money(amount)}`;
}

function WalletActivityCard({
  item,
  open,
}: {
  item: WalletActivity;
  open: () => void;
}) {
  const status = activityStatus(item);
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[#fffdfa] focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-brand sm:px-5"
      onClick={open}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon name={status.icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">
          {activityTitle(item)}
        </span>
        <span className="block text-xs text-muted">
          {istDate(item.created_at)}
        </span>
        {item.topup?.failure_reason && (
          <span className="block break-words text-xs text-red-700">
            {item.topup.failure_reason}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-sm font-semibold tabular-nums text-ink">
          {activityAmount(item)}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </span>
      <Icon
        name="chevronRight"
        size={16}
        className="hidden text-muted sm:block"
      />
    </button>
  );
}

function WalletActivityDetails({
  item,
  close,
  onAction,
}: {
  item: WalletActivity;
  close: () => void;
  onAction: (action: { id: string; kind: "refund" | "review" }) => void;
}) {
  const { entry, topup } = item;
  const status = activityStatus(item);
  const fields: [string, string | null | undefined][] = [
    ["Recorded at", istDate(item.created_at)],
    ["Checkout initiated", topup && entry ? istDate(topup.created_at) : null],
    ["Last updated", topup ? istDate(topup.updated_at) : null],
    [
      "Available balance after",
      entry ? money(entry.available_after_paise) : null,
    ],
    ["Held balance after", entry ? money(entry.held_after_paise) : null],
    ["Available change", entry ? money(entry.available_delta_paise) : null],
    ["Held change", entry ? money(entry.held_delta_paise) : null],
    [
      "Gross fare",
      entry?.gross_paise != null ? money(entry.gross_paise) : null,
    ],
    [
      entry?.commission_percent == null
        ? "Commission"
        : `Commission (${entry.commission_percent}%)`,
      entry?.commission_paise != null ? money(entry.commission_paise) : null,
    ],
    ["Top-up reference", topup?.id ?? entry?.topup_id],
    ["Ledger entry", entry?.id],
    ["Ride", entry?.ride_id],
    ["Ride payment", entry?.payment_id],
    ["Payout", entry?.payout_id],
    ["Reversal of", entry?.reverses_entry_id],
    ["Razorpay order", topup?.provider_order_id],
    ["Razorpay payment", topup?.provider_payment_id],
    ["Razorpay payment link", topup?.provider_link_id],
    [
      "Checkout",
      topup
        ? topup.checkout_kind === "SDK"
          ? "In-app checkout"
          : "Payment link"
        : null,
    ],
    ["Provider mode", topup?.provider_mode],
  ];
  const refundableRide =
    entry?.kind === "RIDE_DEBIT" && !entry.reversed ? entry.ride_id : null;
  const review =
    topup?.status === "REVIEW_REQUIRED" && topup.provider_payment_id
      ? topup.id
      : null;
  return (
    <Dialog title="Transaction details" onClose={close} compact>
      <div className="trip-dialog-body">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-[#fafafa] px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-ink">
              {activityTitle(item)}
            </p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
              {activityAmount(item)}
            </p>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {topup?.failure_reason && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            <p className="font-semibold">Razorpay failure reason</p>
            <p>{topup.failure_reason}</p>
          </div>
        )}
        {topup &&
          (topup.status === "PENDING" || topup.status === "CREATING") && (
            <TripSection title="Payment timeline">
              <ol className="grid gap-2">
                <li className="flex items-start gap-2">
                  <Icon name="success" size={17} className="text-green-700" />
                  <span>
                    Top-up initiated
                    <span className="block text-xs text-muted">
                      {istDate(topup.created_at)}
                    </span>
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Icon
                    name="clock"
                    size={17}
                    className="text-brand motion-safe:animate-pulse"
                  />
                  <span>
                    {topup.status === "CREATING"
                      ? "Preparing checkout"
                      : "Awaiting Razorpay confirmation"}
                  </span>
                </li>
                <li className="flex items-center gap-2 text-muted">
                  <Icon name="layers" size={17} />
                  <span>Wallet credited after capture</span>
                </li>
              </ol>
            </TripSection>
          )}
        <TripSection title="Transaction and balance">
          <TripFacts items={fields.slice(0, 8).filter(([, value]) => value)} />
        </TripSection>
        {fields.slice(8).some(([, value]) => value) && (
          <TripSection title="References and provider">
            <TripFacts items={fields.slice(8).filter(([, value]) => value)} />
          </TripSection>
        )}
      </div>
      {(refundableRide || review) && (
        <div className="dialog-footer">
          {refundableRide && (
            <Button
              variant="secondary"
              onClick={() => onAction({ id: refundableRide, kind: "refund" })}
            >
              Refund ride
            </Button>
          )}
          {review && (
            <Button
              variant="secondary"
              onClick={() => onAction({ id: review, kind: "review" })}
            >
              Reconcile top-up
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

function WalletLedgerAction({
  kind,
  path,
  close,
  done,
}: {
  kind: "refund" | "review";
  path: string;
  close: () => void;
  done: () => void;
}) {
  const [reason, setReason] = useState("");
  const [platformFunded, setPlatformFunded] = useState(false);
  const [disputeId, setDisputeId] = useState("");
  const save = useAdminSave();
  const refund = kind === "refund";
  return (
    <Dialog
      title={refund ? "Refund wallet ride" : "Reconcile top-up"}
      onClose={close}
      busy={save.busy}
      compact
    >
      <FinanceDialogForm
        close={close}
        busy={save.busy}
        disabled={reason.trim().length < 3}
        danger={refund}
        error={save.error}
        action={refund ? "Confirm refund" : "Check and reconcile"}
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(
            (signal) =>
              apiRequest(path, {
                method: "POST",
                signal,
                data: {
                  reason: reason.trim(),
                  ...(refund
                    ? { platform_funded: platformFunded }
                    : disputeId.trim()
                      ? { dispute_id: disputeId.trim() }
                      : {}),
                },
              }),
            done,
          );
        }}
      >
        <p className="field-hint">
          {refund
            ? "The full fare is credited to the rider’s wallet. Driver earnings are reversed if the payout has not settled."
            : "Verify the refund or final dispute outcome with Razorpay before updating the wallet."}
        </p>
        <Field id="wallet-action-reason" label="Reason">
          <textarea
            id="wallet-action-reason"
            className="field"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={300}
            required
          />
        </Field>
        {refund && (
          <label className="flex items-start gap-2">
            <input
              className="mt-1 accent-brand"
              type="checkbox"
              checked={platformFunded}
              onChange={(event) => setPlatformFunded(event.target.checked)}
            />{" "}
            Authorize a platform-funded refund if the driver was already paid
          </label>
        )}
        {!refund && (
          <Field
            id="wallet-dispute-id"
            label="Razorpay dispute ID (if missing from the webhook)"
          >
            <input
              id="wallet-dispute-id"
              className="field"
              value={disputeId}
              onChange={(event) => setDisputeId(event.target.value)}
              maxLength={85}
              pattern="disp_[A-Za-z0-9]+"
            />
          </Field>
        )}
      </FinanceDialogForm>
    </Dialog>
  );
}

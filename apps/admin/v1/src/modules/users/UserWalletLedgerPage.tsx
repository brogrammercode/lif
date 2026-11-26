import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { LoadingState, StateCard } from "../../components/feedback/StateCard";
import { PageHeading } from "../../components/layout/PageHeading";
import { Button } from "../../components/ui/Button";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Field } from "../../components/ui/Field";
import { Dialog } from "../../components/ui/Dialog";
import { apiRequest } from "../../lib/api-client";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";

type Ledger = {
  available_paise: string;
  held_paise: string;
  has_more: boolean;
  reviews: {
    id: string;
    amount_paise: string;
    provider_payment_id: string | null;
  }[];
  rows: {
    id: string;
    kind: string;
    created_at: string;
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
  }[];
};

function money(value: string) {
  const paise = BigInt(value);
  const absolute = paise < 0n ? -paise : paise;
  return `${paise < 0n ? "−" : ""}₹${(absolute / 100n).toLocaleString("en-IN")}.${String(absolute % 100n).padStart(2, "0")}`;
}

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
  const base = `/admin/users/${encodeURIComponent(userId)}/wallet-ledger`;
  const path = `${base}?kind=${kind}&page=${page}${filters ? `&${filters}` : ""}`;
  const wallet = useAdminResource<Ledger>(path);
  const data = wallet.dataPath === path ? wallet.data : null;
  const error = wallet.errorPath === path ? wallet.error : null;
  const loading = !data && !error;

  return (
    <div className="catalog-page">
      <PageHeading
        title="Wallet Ledger"
        eyebrow="Users / Wallet Ledger"
        description="Review the rider and driver wallet activity for this account."
      />
      {!!data?.reviews?.length && (
        <CatalogPanel
          title="Top-ups under review"
          description="Refunds or disputes that need reconciliation."
        >
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Top-up</th>
                  <th>Amount</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.reviews.map((review) => (
                  <tr key={review.id}>
                    <td>{review.provider_payment_id ?? review.id}</td>
                    <td>{money(review.amount_paise)}</td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={!review.provider_payment_id}
                        onClick={() =>
                          setAction({ id: review.id, kind: "review" })
                        }
                      >
                        Reconcile
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CatalogPanel>
      )}
      <CatalogPanel
        title="Wallet activity"
        busy={loading || wallet.loading}
        description={
          data
            ? `${money(data.available_paise)} available · ${money(data.held_paise)} held`
            : "Balance and transaction history for this account."
        }
        toolbar={
          <form
            className="review-toolbar"
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
                    {entry.toLowerCase().replaceAll("_", " ")}
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
          </form>
        }
        footer={
          (page > 1 || data?.has_more) && (
            <div className="review-toolbar">
              <Button
                variant="secondary"
                disabled={page === 1 || loading || wallet.loading}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                disabled={!data?.has_more || wallet.loading}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )
        }
      >
        {loading ? (
          <LoadingState variant="table" label="Loading wallet ledger" />
        ) : error ? (
          <StateCard error title="Could not load wallet ledger" message={error}>
            <Button onClick={wallet.refresh}>Retry</Button>
          </StateCard>
        ) : data?.rows.length ? (
          <div className="table-scroll">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Available change</th>
                  <th>Held change</th>
                  <th>Balance after</th>
                  <th>References</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.kind.toLowerCase().replaceAll("_", " ")}
                      <span className="table-subtitle">
                        {new Date(entry.created_at).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })}{" "}
                        IST
                      </span>
                    </td>
                    <td>
                      {money(entry.available_delta_paise)}
                      {entry.gross_paise != null &&
                        entry.commission_paise != null && (
                          <>
                            <span className="table-subtitle">
                              Gross {money(entry.gross_paise)}
                            </span>
                            <span className="table-subtitle">
                              Commission ({entry.commission_percent}%) −
                              {money(entry.commission_paise)}
                            </span>
                          </>
                        )}
                    </td>
                    <td>{money(entry.held_delta_paise)}</td>
                    <td>
                      {money(entry.available_after_paise)} available
                      <span className="table-subtitle">
                        {money(entry.held_after_paise)} held
                      </span>
                    </td>
                    <td>
                      {(
                        [
                          ["Ride", entry.ride_id],
                          ["Payment", entry.payment_id],
                          ["Top-up", entry.topup_id],
                          ["Payout", entry.payout_id],
                          ["Reversal of", entry.reverses_entry_id],
                          ["Entry", entry.id],
                        ] as const
                      )
                        .filter(([, id]) => id)
                        .map(([label, id]) => (
                          <span className="table-subtitle" key={label}>
                            {label} {id}
                          </span>
                        ))}
                      {entry.kind === "RIDE_DEBIT" && entry.reversed && (
                        <span className="table-subtitle">Refunded</span>
                      )}
                      {entry.kind === "RIDE_DEBIT" &&
                        entry.ride_id &&
                        !entry.reversed && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setAction({ id: entry.ride_id!, kind: "refund" })
                            }
                          >
                            Refund ride
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <StateCard
            title="No wallet transactions"
            message="Posted wallet entries will appear here."
          />
        )}
      </CatalogPanel>
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
    >
      <form
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
        <fieldset disabled={save.busy}>
          <p>
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
            <label>
              <input
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
        </fieldset>
        {save.error && <p role="alert">{save.error}</p>}
        <Button type="submit" disabled={save.busy || reason.trim().length < 3}>
          {refund ? "Confirm refund" : "Check and reconcile"}
        </Button>
      </form>
    </Dialog>
  );
}

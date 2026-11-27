import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { LoadingState, StateCard } from "../../components/feedback/StateCard";
import {
  FinanceDialogForm,
  financeDate,
} from "../../components/ui/FinanceLayout";
import { Field } from "../../components/ui/Field";
import { apiRequest } from "../../lib/api-client";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";

type Draft = { id: string; status: string; updated_at: string };

export function EditPayoutDialog({
  payout,
  driverName,
  onClose,
  onSaved,
}: {
  payout: Draft;
  driverName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const save = useAdminSave();
  const [action, setAction] = useState(
    payout.status === "EXCLUDED" ? "include" : "adjust",
  );
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [ride, setRide] = useState("");
  const [reference, setReference] = useState("");
  return (
    <Dialog
      title="Edit draft payout"
      description={driverName}
      onClose={onClose}
      busy={save.busy}
      compact
    >
      <FinanceDialogForm
        close={onClose}
        busy={save.busy}
        error={save.error}
        action="Save draft change"
        onSubmit={(event) => {
          event.preventDefault();
          const negative = amount.startsWith("-");
          const [whole = "0", fraction = ""] = amount
            .replace(/^-/, "")
            .split(".");
          const paise =
            action === "adjust"
              ? (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
                (negative ? -1n : 1n)
              : 0n;
          void save.run(
            (signal) =>
              apiRequest(
                `/admin/payouts/drivers/${encodeURIComponent(payout.id)}`,
                {
                  method: "PATCH",
                  signal,
                  data: {
                    action,
                    expected_updated_at: payout.updated_at,
                    reason,
                    ...(action === "adjust"
                      ? {
                          amount_paise: String(paise),
                          ride_id: ride.trim() || undefined,
                          reference: reference.trim() || undefined,
                        }
                      : {}),
                  },
                },
              ),
            onSaved,
          );
        }}
      >
        <div className="grid gap-3">
          <Field id="payout-edit-action" label="Action">
            <select
              id="payout-edit-action"
              className="field"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              {payout.status === "EXCLUDED" ? (
                <option value="include">Include in cycle</option>
              ) : (
                <>
                  <option value="adjust">Adjust amount</option>
                  <option value="exclude">Exclude from cycle</option>
                </>
              )}
            </select>
          </Field>
          {action === "adjust" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="payout-adjust-amount"
                label="Adjustment (₹)"
                hint="Use a negative amount for a deduction."
              >
                <input
                  id="payout-adjust-amount"
                  className="field"
                  pattern="-?[0-9]{1,8}(\.[0-9]{1,2})?"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field id="payout-adjust-ride" label="Ride ID (optional)">
                <input
                  id="payout-adjust-ride"
                  className="field"
                  value={ride}
                  onChange={(e) => setRide(e.target.value)}
                />
              </Field>
              <Field id="payout-adjust-reference" label="Reference (optional)">
                <input
                  id="payout-adjust-reference"
                  className="field"
                  maxLength={120}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>
            </div>
          )}
          <Field id="payout-edit-reason" label="Reason">
            <textarea
              id="payout-edit-reason"
              className="field"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </FinanceDialogForm>
    </Dialog>
  );
}

type Block = {
  driver_id: string;
  reason: string;
  expires_at: string | null;
  driver: { first_name: string | null; last_name: string | null };
};
const blocksPath = "/admin/payouts/blocks";

export function PayoutBlocksDialog({ onClose }: { onClose: () => void }) {
  const resource = useAdminResource<Block[]>(blocksPath);
  const save = useAdminSave();
  const [driver, setDriver] = useState("");
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const [blocked, setBlocked] = useState(true);
  return (
    <Dialog
      title="Driver payout blocks"
      onClose={onClose}
      busy={save.busy}
      compact
    >
      <FinanceDialogForm
        close={onClose}
        action={blocked ? "Block driver payouts" : "Unblock driver payouts"}
        danger={blocked}
        busy={save.busy}
        error={save.error}
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(
            (signal) =>
              apiRequest(blocksPath, {
                method: "PUT",
                signal,
                data: {
                  driver_id: driver.trim(),
                  reason,
                  blocked,
                  expires_at:
                    blocked && expires
                      ? new Date(`${expires}+05:30`).toISOString()
                      : null,
                },
              }),
            () => {
              setDriver("");
              setReason("");
              setExpires("");
              setBlocked(true);
              resource.refresh();
            },
          );
        }}
      >
        <section aria-labelledby="payout-block-list" className="grid gap-2">
          <h3 id="payout-block-list" className="text-sm font-semibold text-ink">
            Active blocks
          </h3>
          {resource.error && (
            <StateCard
              error
              title="Could not load payout blocks"
              message={resource.error}
            >
              <Button variant="secondary" onClick={resource.refresh}>
                Retry
              </Button>
            </StateCard>
          )}
          {resource.loading && !resource.data && (
            <LoadingState variant="table" label="Loading payout blocks" />
          )}
          {!resource.loading && resource.data?.length === 0 && (
            <p className="field-hint">No driver payout blocks.</p>
          )}
          {!!resource.data?.length && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {resource.data.map((block) => (
                <li
                  key={block.driver_id}
                  className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {[block.driver.first_name, block.driver.last_name]
                        .filter(Boolean)
                        .join(" ") || block.driver_id}
                    </p>
                    <p className="field-hint">{block.reason}</p>
                    <p className="field-hint">
                      {block.expires_at
                        ? `Expires ${financeDate(block.expires_at)}`
                        : "No expiry"}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setBlocked(false);
                      setDriver(block.driver_id);
                      setReason("");
                      setExpires("");
                    }}
                  >
                    Unblock
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          className="grid gap-3 border-t border-line pt-3"
          aria-labelledby="payout-block-edit"
        >
          <h3 id="payout-block-edit" className="text-sm font-semibold text-ink">
            Manage a block
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="payout-block-action" label="Action">
              <select
                id="payout-block-action"
                className="field"
                value={blocked ? "block" : "unblock"}
                onChange={(e) => setBlocked(e.target.value === "block")}
              >
                <option value="block">Block payouts</option>
                <option value="unblock">Unblock payouts</option>
              </select>
            </Field>
            <Field id="payout-block-driver" label="Driver ID">
              <input
                id="payout-block-driver"
                className="field"
                required
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
              />
            </Field>
            {blocked && (
              <Field
                id="payout-block-expiry"
                label="Expires (IST, optional)"
                className="sm:col-span-2"
              >
                <input
                  id="payout-block-expiry"
                  type="datetime-local"
                  className="field"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                />
              </Field>
            )}
          </div>
          <Field id="payout-block-reason" label="Reason">
            <textarea
              id="payout-block-reason"
              className="field"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </Field>
        </section>
      </FinanceDialogForm>
    </Dialog>
  );
}

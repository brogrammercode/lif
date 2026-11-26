import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { apiRequest } from "../../lib/api-client";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";

type Draft = { id: string; status: string; updated_at: string };

export function EditPayoutDialog({
  payout,
  onClose,
  onSaved,
}: {
  payout: Draft;
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
    <Dialog title="Edit draft payout" onClose={onClose} busy={save.busy}>
      <form
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
        <fieldset disabled={save.busy}>
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
            <>
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
            </>
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
            />
          </Field>
        </fieldset>
        {save.error && <p role="alert">{save.error}</p>}
        <Button type="submit" disabled={save.busy}>
          Save draft change
        </Button>
      </form>
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
    <Dialog title="Driver payout blocks" onClose={onClose} busy={save.busy}>
      {resource.loading && <p role="status">Loading payout blocks</p>}
      {resource.error && <p role="alert">{resource.error}</p>}
      {resource.data?.map((block) => (
        <p key={block.driver_id}>
          {[block.driver.first_name, block.driver.last_name]
            .filter(Boolean)
            .join(" ") || block.driver_id}
          {" · "}
          {block.reason}
          {" · "}
          {block.expires_at
            ? new Date(block.expires_at).toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              }) + " IST"
            : "No expiry"}{" "}
          <Button
            type="button"
            variant="secondary"
            disabled={save.busy}
            onClick={() => {
              setBlocked(false);
              setDriver(block.driver_id);
              setReason("");
              setExpires("");
            }}
          >
            Unblock
          </Button>
        </p>
      ))}
      <form
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
        <fieldset disabled={save.busy}>
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
            <Field id="payout-block-expiry" label="Expires (IST, optional)">
              <input
                id="payout-block-expiry"
                type="datetime-local"
                className="field"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </Field>
          )}
          <Field id="payout-block-reason" label="Reason">
            <textarea
              id="payout-block-reason"
              className="field"
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </fieldset>
        {save.error && <p role="alert">{save.error}</p>}
        <Button type="submit" disabled={save.busy}>
          {blocked ? "Block driver payouts" : "Unblock driver payouts"}
        </Button>
      </form>
    </Dialog>
  );
}

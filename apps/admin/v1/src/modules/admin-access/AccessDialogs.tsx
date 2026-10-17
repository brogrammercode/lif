import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/feedback/StateCard";
import { ApiError, safeMessage } from "../../lib/api-client";
import { grantAccess, revokeAccess } from "./admin-access.api";
import { accessName, type AccessPerson } from "./admin-access.type";

export function AccessDialog({
  target,
  onClose,
  onSaved,
  onConflict,
}: {
  target: AccessPerson | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onConflict: () => void;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || stale) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError(null);
    try {
      const result = target
        ? await revokeAccess(target, controller.signal)
        : await grantAccess(email.trim().toLowerCase(), controller.signal);
      if (controller.signal.aborted) return;
      onSaved(
        target
          ? result.changed
            ? `Admin access removed for ${accessName(target)}.`
            : "This account no longer has admin access."
          : result.changed
            ? `Admin access granted to ${email.trim().toLowerCase()}. They can sign in with that Google account.`
            : "This account already has admin access.",
      );
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(safeMessage(cause));
      if (
        target &&
        cause instanceof ApiError &&
        (cause.status === 409 || cause.status === 404)
      ) {
        setStale(true);
        onConflict();
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <Dialog
      small
      title={target ? "Remove admin access?" : "Grant admin access"}
      description={
        target
          ? "Their personal and ride account will remain available."
          : "Use the exact email address of their Google account."
      }
      busy={busy}
      onClose={onClose}
    >
      <form className="editor-form" onSubmit={(event) => void submit(event)}>
        {target ? (
          <div className="workspace-notice">
            <strong>{accessName(target)}</strong>
            <p>{target.email || target.id}</p>
            <p>
              They will lose access to the admin workspace and their admin
              sessions will be ended. Their previous account role will be
              restored.
            </p>
          </div>
        ) : (
          <>
            <Field
              id="admin-email"
              label="Google account email"
              hint="They can sign in as soon as access is granted. No invitation email is sent."
            >
              <input
                className="field"
                id="admin-email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
                placeholder="name@example.com"
              />
            </Field>
            <div className="workspace-notice">
              <strong>Full administrator access</strong>
              <p>
                Administrators can manage users, vehicle categories and other
                administrators. Only grant access to people you trust.
              </p>
            </div>
          </>
        )}
        {error && <InlineError message={error} />}
        <div className="dialog-footer">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {stale ? "Close" : "Cancel"}
          </Button>
          <Button
            type="submit"
            variant={target ? "danger" : "primary"}
            busy={busy}
            disabled={stale}
          >
            {target ? "Remove access" : "Grant access"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

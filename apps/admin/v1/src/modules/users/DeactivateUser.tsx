import { ActionMenu } from "../../components/ui/ActionMenu";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { InlineError } from "../../components/feedback/StateCard";
import { apiRequest } from "../../lib/api-client";
import { useAdminSave } from "../../lib/useAdminResource";
import { useAuth } from "../auth/AuthProvider";
import { useUsers } from "./UsersProvider";
import { userName, type UserDetails } from "./users.type";
export function DeactivateUser({
  user,
  onReload,
}: {
  user: UserDetails;
  onReload: () => void;
}) {
  const { user: actor } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const directory = useUsers();
  return (
    <>
      <section className="personal-card account-actions">
        <div>
          <h2>Deactivate user</h2>
          <p>
            End access to all apps and revoke sessions. Personal details and
            ride history are retained.
          </p>
        </div>
        <ActionMenu
          label={"account " + userName(user)}
          items={[
            {
              label: actor?.id === user.id ? "Your account" : "Deactivate user",
              icon: "trash",
              danger: true,
              disabled: actor?.id === user.id,
              onSelect: () => setOpen(true),
            },
          ]}
        />
      </section>
      {open && (
        <DeactivateDialog
          user={user}
          reload={onReload}
          close={() => setOpen(false)}
          saved={() => {
            directory.reload();
            navigate("/users", { replace: true });
          }}
        />
      )}
    </>
  );
}
function DeactivateDialog({
  user,
  close,
  saved,
  reload,
}: {
  user: UserDetails;
  close: () => void;
  saved: () => void;
  reload: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const save = useAdminSave();
  const expected = user.email ?? user.id;
  return (
    <Dialog
      small
      title={`Deactivate ${userName(user)}?`}
      description="This prevents sign-in, revokes all sessions and devices, and takes a driver offline. History remains available in the database. Finish or cancel active rides first."
      busy={save.busy}
      onClose={close}
    >
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run(
            (signal) =>
              apiRequest(`/admin/users/${encodeURIComponent(user.id)}`, {
                method: "DELETE",
                data: { expected_updated_at: user.updated_at, confirmation },
                signal,
                timeoutMs: 45000,
              }),
            saved,
          );
        }}
      >
        <Field
          id="deactivate-confirmation"
          label={`Type ${expected} to confirm`}
        >
          <input
            className="field"
            id="deactivate-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={save.busy}
            autoComplete="off"
            required
          />
        </Field>
        {save.error && (
          <>
            <InlineError message={save.error} />
            <Button
              className="mt-3"
              variant="secondary"
              onClick={() => {
                close();
                reload();
              }}
            >
              Reload latest details
            </Button>
          </>
        )}
        <div className="dialog-footer">
          <Button variant="secondary" disabled={save.busy} onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            type="submit"
            busy={save.busy}
            disabled={
              confirmation.trim().toLowerCase() !== expected.toLowerCase()
            }
          >
            Deactivate user
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

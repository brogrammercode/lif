import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useParams } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import { Toast } from "../../components/feedback/Toast";
import { Avatar } from "../../components/ui/Avatar";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { ApiError, safeMessage } from "../../lib/api-client";
import { getUser, savePersonal } from "./users.api";
import { useUsers } from "./UsersProvider";
import { userName, type PersonalInput, type UserDetails } from "./users.type";
import { useAuth } from "../auth/AuthProvider";
import { ImageUpload } from "../../components/ui/ImageUpload";
import { useImageUpload } from "../../lib/useImageUpload";
import { DeactivateUser } from "./DeactivateUser";

export function PersonalPage() {
  const { userId } = useParams<{ userId: string }>();
  return userId ? (
    <UserPersonal key={userId} id={userId} />
  ) : (
    <StateCard
      title="Select a user"
      message="Choose a name and ID from the Users navigation to view and edit their personal details."
    />
  );
}

function UserPersonal({ id }: { id: string }) {
  const [user, setUser] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getUser(id, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setUser(value);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(safeMessage(cause));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, revision]);
  if (loading)
    return (
      <div className="personal-card" role="status" aria-busy="true">
        <p>Loading personal details…</p>
        <div className="skeleton mt-5 h-64 w-full" />
      </div>
    );
  if (error || !user)
    return (
      <StateCard
        error
        title="Could not load this user"
        message={error || "User was not found."}
      >
        <Button onClick={() => setRevision((value) => value + 1)}>
          Try again
        </Button>
      </StateCard>
    );
  return (
    <div className="personal-page">
      <PersonalForm
        key={`${user.id}:${user.updated_at}`}
        user={user}
        onSaved={(updated) => {
          setUser(updated);
          setToast("Personal details saved.");
        }}
        onReload={() => {
          setToast(null);
          setRevision((value) => value + 1);
        }}
      />
      <DeactivateUser
        user={user}
        onReload={() => setRevision((value) => value + 1)}
      />
      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}

function PersonalForm({
  user,
  onSaved,
  onReload,
}: {
  user: UserDetails;
  onSaved: (user: UserDetails) => void;
  onReload: () => void;
}) {
  const { updateUser } = useUsers();
  const auth = useAuth();
  const image = useImageUpload(user.avatar_url);
  const [form, setForm] = useState(() => ({
    first_name: user.first_name ?? "",
    last_name: user.last_name ?? "",
    phone_e164: user.phone_e164 ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const saving = useRef<AbortController | null>(null);
  useEffect(() => () => saving.current?.abort(), []);
  const change = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const dirty =
    image.changed ||
    Object.entries(form).some(
      ([key, value]) => value !== (user[key as keyof typeof form] ?? ""),
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !dirty || image.selecting || image.error || conflict)
      return;
    const controller = new AbortController();
    saving.current = controller;
    setBusy(true);
    setError(null);
    setConflict(false);
    const input: PersonalInput = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim() || null,
      phone_e164: form.phone_e164.trim() || null,
      avatar_url: image.removed ? null : user.avatar_url,
    };
    try {
      input.image_upload = await image.serialize(controller.signal);
      controller.signal.throwIfAborted();
      const updated = await savePersonal(user, input, controller.signal);
      if (controller.signal.aborted) return;
      updateUser(updated);
      if (auth.user?.id === updated.id && updated.role === "ADMIN") {
        auth.setUser({ ...updated, role: "ADMIN" });
      }
      onSaved(updated);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(safeMessage(cause));
        setConflict(
          cause instanceof ApiError && cause.code === "USER_CONFLICT",
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        saving.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <div className="personal-page">
      <PageHeading
        eyebrow="USER DETAILS"
        context="Account management"
        title="Personal"
        description={`View and update ${userName(user)}’s personal details.`}
      >
        <div className="personal-identity">
          <Avatar user={{ ...user, avatar_url: image.preview }} />
          <div>
            <strong>{userName(user)}</strong>
            <span>{user.id}</span>
          </div>
        </div>
      </PageHeading>
      <form className="personal-card" onSubmit={submit} aria-busy={busy}>
        {error && (
          <div className="mb-6">
            <InlineError message={error} />
            {conflict && (
              <Button className="mt-3" variant="secondary" onClick={onReload}>
                Reload latest details
              </Button>
            )}
          </div>
        )}
        <fieldset disabled={busy}>
          <div className="editor-section-heading">
            <span className="section-step">01</span>
            <h2>Personal information</h2>
          </div>
          <div className="form-grid">
            <Field id="first-name" label="First name">
              <input
                className="field"
                id="first-name"
                autoComplete="off"
                required
                maxLength={80}
                pattern=".*\S.*"
                value={form.first_name}
                onChange={(event) => change("first_name", event.target.value)}
              />
            </Field>
            <Field id="last-name" label="Last name">
              <input
                className="field"
                id="last-name"
                autoComplete="off"
                maxLength={80}
                value={form.last_name}
                onChange={(event) => change("last_name", event.target.value)}
              />
            </Field>
            <Field
              id="user-email"
              label="Email"
              hint="Managed by the user's sign-in provider."
            >
              <input
                className="field"
                id="user-email"
                readOnly
                value={user.email ?? ""}
                placeholder="Not provided"
              />
            </Field>
            <Field
              id="user-phone"
              label="Phone number"
              hint="Include the country code, for example +919876543210."
            >
              <input
                className="field"
                id="user-phone"
                type="tel"
                autoComplete="off"
                pattern="\+[1-9][0-9]{7,14}"
                maxLength={16}
                value={form.phone_e164}
                onChange={(event) => change("phone_e164", event.target.value)}
              />
            </Field>
            <div className="form-full">
              <ImageUpload
                id="user-avatar"
                label="Profile image"
                image={image}
                disabled={busy}
              />
            </div>
          </div>
        </fieldset>
        <section className="personal-account" aria-labelledby="account-title">
          <div className="editor-section-heading">
            <span className="section-step">02</span>
            <h2 id="account-title">Account information</h2>
          </div>
          <div className="form-grid">
            {(
              [
                ["user-id", "User ID", user.id],
                ["user-role", "Role", user.role],
                ["user-status", "Status", user.status],
                [
                  "user-last-login",
                  "Last login",
                  user.last_login_at
                    ? new Date(user.last_login_at).toLocaleString()
                    : "Not recorded",
                ],
                [
                  "user-last-admin-login",
                  "Last admin login",
                  user.last_admin_login_at
                    ? new Date(user.last_admin_login_at).toLocaleString()
                    : "Not recorded",
                ],
                [
                  "user-created",
                  "Created",
                  new Date(user.created_at).toLocaleString(),
                ],
                [
                  "user-updated",
                  "Last updated",
                  new Date(user.updated_at).toLocaleString(),
                ],
                [
                  "user-latitude",
                  "Last known latitude",
                  user.last_known_latitude?.toString() ?? "Not available",
                ],
                [
                  "user-longitude",
                  "Last known longitude",
                  user.last_known_longitude?.toString() ?? "Not available",
                ],
              ] as const
            ).map(([fieldId, label, value]) => (
              <Field key={fieldId} id={fieldId} label={label}>
                <input className="field" id={fieldId} readOnly value={value} />
              </Field>
            ))}
          </div>
        </section>
        <div className="dialog-footer mt-6">
          <Button
            variant="secondary"
            disabled={busy || !dirty}
            onClick={() => {
              setForm({
                first_name: user.first_name ?? "",
                last_name: user.last_name ?? "",
                phone_e164: user.phone_e164 ?? "",
              });
              setError(null);
              setConflict(false);
              image.reset();
            }}
          >
            Discard changes
          </Button>
          <Button
            type="submit"
            busy={busy}
            disabled={
              !dirty || conflict || image.selecting || Boolean(image.error)
            }
          >
            {busy
              ? image.file
                ? "Uploading and saving…"
                : "Saving…"
              : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

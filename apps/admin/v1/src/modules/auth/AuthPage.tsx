import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import { InlineError } from "../../components/feedback/StateCard";
import { safeMessage } from "../../lib/api-client";
import { useAuth } from "./AuthProvider";
import { signInWithGoogle } from "./auth.api";
import { AUTH_COPY, WORKSPACE_PATH } from "./auth.constant";
import { loadGoogleIdentity } from "./google";

export function AuthPage() {
  const auth = useAuth();
  const host = useRef<HTMLDivElement>(null);
  const signingIn = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
      string | undefined;
    async function initialize() {
      setLoading(true);
      setGoogleError(false);
      if (!clientId) {
        setLoading(false);
        setGoogleError(true);
        return;
      }
      try {
        await loadGoogleIdentity();
        if (cancelled || !host.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          auto_select: false,
          callback: (response) => {
            if (cancelled || signingIn.current) return;
            if (!response.credential) {
              setError(AUTH_COPY.GOOGLE_UNAVAILABLE);
              return;
            }
            signingIn.current = true;
            setBusy(true);
            setError(null);
            void signInWithGoogle(response.credential)
              .then((user) => {
                if (!cancelled) auth.setUser(user);
              })
              .catch((cause: unknown) => {
                if (!cancelled) setError(safeMessage(cause));
              })
              .finally(() => {
                signingIn.current = false;
                if (!cancelled) setBusy(false);
              });
          },
        });
        host.current.replaceChildren();
        window.google.accounts.id.renderButton(host.current, {
          theme: "outline",
          size: "large",
          width: Math.min(
            360,
            Math.max(200, (host.current.parentElement?.clientWidth ?? 360) - 8),
          ),
          text: "continue_with",
          shape: "pill",
        });
      } catch {
        if (!cancelled) setGoogleError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [attempt, auth.setUser]);
  if (auth.user) return <Navigate to={WORKSPACE_PATH} replace />;
  return (
    <main className="auth-page">
      <div className="auth-orbit orbit-one" />
      <div className="auth-orbit orbit-two" />
      <div className="auth-orbit orbit-three" />
      <div className="auth-layout">
        <section className="auth-story">
          <a className="auth-brand" href="/login">
            <span className="brand-mark">
              <img
                src="/logo.png"
                alt=""
                className="h-full w-full rounded-[10px] object-cover"
              />
            </span>
            <span>
              1More Admin<span className="brand-dot">.</span>
            </span>
            <span className="auth-brand-caption">ADMIN WORKSPACE</span>
          </a>
          <div className="auth-story-content">
            <span className="auth-eyebrow">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> A
              LITTLE CONTROL. A LOT OF POSSIBILITY.
            </span>
            <h1>{AUTH_COPY.TITLE}</h1>
            <p>{AUTH_COPY.DESCRIPTION}</p>
            <div className="auth-caption">
              <Icon name="layers" size={18} />
              <span>Thoughtfully connected. Effortlessly managed.</span>
            </div>
          </div>
          <p className="auth-copyright">
            © {new Date().getFullYear()} 1More Admin. Every journey starts
            somewhere.
          </p>
        </section>
        <section className="auth-form-panel">
          <div className="auth-form-icon">
            <Icon name="shield" size={28} />
          </div>
          <p className="eyebrow">YOUR WORKSPACE AWAITS</p>
          <h2>{AUTH_COPY.SIGN_IN_TITLE}</h2>
          <p className="auth-form-description">
            {AUTH_COPY.SIGN_IN_DESCRIPTION}
          </p>
          <div className="google-button-area" aria-busy={busy || loading}>
            <div
              ref={host}
              className={`google-button-host ${busy || loading || googleError ? "hidden" : ""}`}
            />
            {busy && (
              <div className="flex items-center justify-center gap-3 py-3">
                <Icon name="spinner" className="animate-spin" />
                <span>Signing you in…</span>
              </div>
            )}
            {loading && !busy && (
              <p className="flex items-center justify-center gap-2 py-3 text-sm">
                <Icon name="spinner" size={16} className="animate-spin" />{" "}
                Preparing Google sign-in…
              </p>
            )}
          </div>
          {googleError && (
            <div className="space-y-3">
              <InlineError message={AUTH_COPY.GOOGLE_UNAVAILABLE} />
              <Button
                variant="secondary"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <Icon name="refresh" size={16} />
                Retry Google sign-in
              </Button>
            </div>
          )}
          {error && <InlineError message={error} />}
          <p className="auth-location-note">
            At sign-in, we ask to record your browser location. If permission is
            declined or unavailable, we use an approximate public IP location
            for the login record.
          </p>
          <div className="auth-access-note">
            <Icon name="shield" size={18} />
            <p>{AUTH_COPY.ACCESS_NOTE}</p>
          </div>
          <p className="auth-support">
            Need access? Ask your workspace administrator.
          </p>
        </section>
      </div>
    </main>
  );
}

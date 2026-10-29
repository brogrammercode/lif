# Admin immediate-session-end investigation

29 October 2026. Changes are in Admin V1; API V2 authentication remains enforced.

## Evidence

Read-only database inspection found the supplied request `c44e0d47-e0e7-4c32-af60-40d3817bf775`. The browser family had an expiry in November, not a one-second lifetime. A successful `/admin/auth/logout` request revoked it immediately before the supplied access-directory request. The subsequent Google sign-in created a live family and access-directory requests succeeded. Existing audit data cannot distinguish whether the older browser's logout was initiated by a person or by its automatic refresh-failure cleanup.

## Fault and correction

Previously every failed refresh—including a timeout, failed connection or server 503—ended local authentication, broadcast logout, then called `/admin/auth/logout` using the shared HttpOnly cookie. That could revoke a healthy browser family and affect other open tabs. The API correctly rejected that revoked family afterward.

- Background refresh failures no longer call the logout endpoint.
- Only confirmed 401/session rejection, removed admin access, inactive accounts or an invalid browser identity end local authentication. Cookie handling and server session revocation remain authoritative.
- Temporary failures propagate to existing page retry controls. During initial restoration, the shared connection-error/retry state preserves the server cookie instead of presenting a false session-expiry result.
- Sign-in/refresh use a 60-second timeout to cover hosted database wakeup/acquisition. Ordinary resources retain their 25-second timeout.
- Explicit Google sign-in advances the browser session epoch. Permission/session errors issued before that sign-in cannot clear the new authenticated state.
- Explicit logout, revoked-family checks, current admin roles, account status checks, JWT verification, cookie security and refresh-token rotation remain enforced.

## Regression coverage

Browser coverage exercises initial server/connection/timeout failures and recovery, an active workspace retry, another tab's temporary failure, late permission errors after a new sign-in, explicit logout, concurrent refresh/logout, revoked sessions and invalid identities. Tests mock service responses and do not create or revoke live user sessions. Live investigation used read-only queries only.

Validation completed: the admin production build, all 62 Chromium tests, formatting and Git whitespace checks passed. The configured API lifetimes were verified as 15 minutes for access tokens and 30 days for refresh sessions. No new environment variables or API authentication bypasses were introduced. Deploy the updated admin bundle and sign in again if the old browser family was already revoked.

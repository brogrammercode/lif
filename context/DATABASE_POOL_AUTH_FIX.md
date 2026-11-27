# Authentication database pool repair

Date: 29 October 2026. Scope: API V2.

## Evidence

Google sign-in reported `PrismaClientInitializationError`, `P2024`, a 10-second pool timeout and a nine-connection pool. Runtime configuration only set a 15-second connection timeout, leaving acquisition at Prisma's shorter default. One module-level extended Prisma client is already shared by the Nest services; this investigation did not find per-request client construction.

A bounded, read-only probe of the configured pooled Neon database succeeded. Its activity snapshot had one active probe and one idle connection, with no waiting or idle-in-transaction entry. This confirms current reachability; it does not reconstruct the exact pool or provider state at the time of the reported failure.

## Repair

- Add a 30-second runtime pool acquisition default alongside the existing 15-second connection-opening default. Preserve explicit URL parameters and credentials without logging them.
- Bound Vercel pools to five connections per instance when no explicit connection limit is provided. Leave local persistent-server pool sizing unchanged.
- Align mobile/admin authentication transaction acquisition waits to 30 seconds, preserving their execution deadlines and existing identity, activation, account-status and refresh-rotation locks/checks.
- Retry acquisition once with a short randomized delay for `P2024` (including initialization errors using `errorCode`) or pre-callback `P2028`. If the transaction callback has run at all, propagate the error without replaying writes. Do not reconnect/disconnect a shared client while other requests use it, blindly retry commits, remove locks or disable timeouts.
- Preserve the existing safe `503 DATABASE_BUSY` response and `Retry-After` behavior when the database remains unavailable.

## Verification

Unit tests cover explicit/default connection options, serverless versus local pools, initialization errors, bounded retries, unrelated failures and lost commit acknowledgements. An authentication repository regression verifies one account and one notification even after a failed first acquisition and repeated sign-in.

Verified: API V2 production compile and all **200 unit/HTTP tests passed**. Formatting and Git whitespace checks pass. Six concurrent read-only PostgreSQL transactions succeeded through an explicitly constrained two-connection pool in approximately **10.4 seconds**; the runtime URL reported connection/pool waits of 15/30 seconds.

No account, session, ride or audit fixture was inserted into the live database. No schema migration, private environment edit, API V1 change or automatic deployment is required. A real Google sign-in must be retried by the user after the updated API is running; this repair cannot guarantee availability during a provider outage or sustained overload.

References: [Prisma connection pooling](https://www.prisma.io/docs/orm/v6/prisma-client/setup-and-configuration/databases-connections/connection-pool), [Prisma with Neon](https://www.prisma.io/docs/orm/v6/overview/databases/neon).

## Mobile refresh timeout follow-up

The 27 November API log shows the refresh transaction was already 16 seconds old when its first query failed with P2028. The log does not identify where the time was spent.

- Mobile refresh now looks up the session through the pool before starting the rotation transaction. Under the account lifecycle lock, it rereads the current user and conditionally claims the still-valid mobile session. The claim, new session and audit remain atomic.
- Refresh retries one pool or transaction expiry failure during its read-only checks. Once it attempts the session claim, it propagates the failure without replaying the transaction.
- The app retains stored tokens on a temporary refresh error. If the access token has expired, pending protected requests report the refresh error instead of sending it. A later request can refresh normally.

A read-only session lookup against the configured test pool succeeded once in about 12.2 seconds. Later, the local API health check returned HTTP 503 and independent Prisma reads timed out at both 15 and 30 seconds. The intermittent database connection prevented a live refresh check.

Verification passed for the API compile, 16 focused API tests and 18 Flutter networking and session tests. The broader API suite still reports the existing saved-place revision and vehicle correction failures.

# API V2 parity and runtime review — 2026-10-17

## Scope

V1 was used as a read-only reference. Backend changes are confined to `apps/api/v2`. Admin Vite configuration, its active ignored environment file, API fallback and browser fixtures were updated to reach V2. Existing unrelated work was retained.

## Confirmed login failure

The reported Vite `ECONNREFUSED` was a connection to the old development proxy target on port 4000. The running Nest server listens on 4001. The screenshot's generic server error was consistent with that proxy failure, rather than evidence that Google rejected the account.

- Development and preview now proxy `/api` to `http://127.0.0.1:4001`.
- The active admin environment, environment example and client fallback use relative `/api/v2`.
- The relative path keeps refresh cookies on the admin browser origin for localhost and 127.0.0.1 usage. Absolute localhost API URLs can otherwise introduce a cross-site cookie problem when the browser uses 127.0.0.1.
- Live requests through `http://localhost:5173/api/v2/health` and its compatibility `/api/v1/health` both returned 200 with database connected. The served client module was checked for the active V2 setting.
- The invalid-token and missing-session 401 messages with request IDs `2575c6cc-ab74-4228-8ee2-27ea93c9e308` and `1bc3ecad-4986-4da4-9057-289cd440efb1` were deliberate diagnostic requests, not the user's valid Google login.

## Backend comparison

| Area | Evidence |
| --- | --- |
| Routes | Inspected the reference Express router without starting V1. All 79 unique method/path combinations match V2's manifest; no missing or additional combinations. |
| Feature exports | Compared 165 exported repository/service/schema definitions in V1 with V2 class members/exports; none missing. |
| Data access and business logic | Compared definitions after normalizing dependency injection, formatting and numeric separators. Reviewed remaining differences individually. |
| Intentional V2 improvements | Driver verification/cancellation coordination, driver location auditing, rating aggregation, decimal fares, payment reference binding, strict coordinate validation, bounded ride pagination, nested IDs. |
| Database | V1/V2 schema hashes match. Four migrations are applied to the configured database. No migration was required for this review. |
| Framework contract | Nest controllers retain the response envelope and status codes, current-user/role checks, ownership, idempotency and `/api/v1` compatibility routes. |

Definition/route comparisons establish coverage, not complete semantic equivalence. Runtime checks below supplement the source inspection.

## Database availability

A real database check failed to open a connection to the configured Neon endpoint during suite setup. This is separate from Vite's connection refusal. V2 now supplies `connect_timeout=15` for PostgreSQL URLs that do not already specify a connection timeout. Explicit settings, SSL parameters and credentials are preserved; malformed connection URLs return a safe startup error without printing the connection string.

Known Prisma connection, operation/pool timeouts, and closed-transaction errors now return safe HTTP 503 responses (`DATABASE_UNAVAILABLE` or `DATABASE_BUSY`) and `Retry-After: 3`. Initialization errors are handled as well as query errors. Full diagnostics remain server-side with request ID, route, status and error code. This does not retry writes, hide failed transactions, or grant permissions when a check fails. External database/network availability still has to be maintained.

Permission denials now include the request ID, user ID, current database-derived role, method and path in server diagnostics, without tokens or request bodies. The integration client also records actor state for an unexpected denial of its own administrator fixture.

## Verification limits

Google verification is mocked in the new HTTP login integration scenario; user creation/linking, Nest handlers, cookies, refresh, session invalidation and database operations are real. A real Google popup and token issuance were not automated. Cloudinary and routing providers retain their existing fixture-based coverage.

The first complete database pass reported 24/25 successful scenarios; the category/quote scenario received an unexpected 403 instead of its expected stale-edit 409. An isolated run progressed further but also received an unexpected permission denial. A diagnostic retry was separately blocked at setup by a database connection failure. These observations prompted additional actor diagnostics and another complete main-suite run; they must not be represented as an initially clean database audit.

The final main-suite rerun passed all 17 scenarios, including the full category/quote/dispatch scenario, with no unexpected actor diagnostic. The intermittent 403 cause was not established. No authorization check was relaxed. Retained diagnostics make a recurrence distinguishable by request ID and actor role. A single passing rerun is not proof that an unexplained intermittent issue cannot return.

## Completed checks

| Check | Result |
| --- | --- |
| Main PostgreSQL integration suite, final rerun | 17 passed, 0 failed |
| Separate PostgreSQL account-identity suite | 9 passed, 0 failed |
| Admin Chromium regressions | 16 passed, 0 failed |
| Fast API checks, including database error handling and connection URL defaults | 54 passed, 0 failed |
| V1/V2 route comparison | 79/79 match |
| V1 feature-export coverage | All 165 have V2 counterparts |
| V2 TypeScript, Nest build, formatting | Passed |
| Admin TypeScript/Vite build and formatting | Passed |
| Migration status | Database up to date |
| Production dependency audit | 0 reported vulnerabilities |
| Live proxy health and repeated protected reads | Connected; 10 consecutive administrator catalog reads returned 200 |

Database results above come from separate runs, not a single initially clean 26-test execution. Test accounts and related records were removed by suite teardown. No real person's administrator access was changed.

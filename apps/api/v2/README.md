# 1More API v2 — NestJS

Standalone NestJS 12 implementation: 21 feature modules, 163 method/path combinations, injected services/repositories, and Prisma/PostgreSQL persistence. See [route-manifest.json](./route-manifest.json) for every route and its guards/idempotency policy.

Partner onboarding adds published rich documents, private assets, dynamic application reviews, confirmation/final PDF approval, SMTP delivery and first-login driver activation. See [PARTNER_ONBOARDING_IMPLEMENTATION.md](../../../context/PARTNER_ONBOARDING_IMPLEMENTATION.md) for routes, operator setup and delivery behavior.

Driver vehicle verification adds private WebP document uploads, requested catalog choices, multiple vehicle submissions, and versioned admin field reviews. See [VEHICLE_VERIFICATION_PLAN.md](../../../context/VEHICLE_VERIFICATION_PLAN.md) for the completed checklist and operator flow.

## Start

For Vercel, use this folder as the API project's root; `vercel.json` selects NestJS. See [VERCEL_DEPLOYMENT.md](../../../context/VERCEL_DEPLOYMENT.md) for project roots, environment settings, admin API routing and platform limits. API `npm run build` now runs Prisma generation and schema push before Nest compilation; use `npm run build:compile` for compilation without database writes.

Requires Node.js 24 or newer. Run from `apps/api/v2`:

```powershell
npm ci
npm run prisma:deploy
npm run prisma:generate
npm run dev
```

The local `.env` contains the existing API configuration with `PORT=4001`. The normal base URL is **http://localhost:4001/api/v2**. Every route also accepts `/api/v1` on this server, so clients can migrate their server address before their URL version. Both prefixes invoke the same Nest controllers.

Build and run compiled code:

```powershell
npm run build
npm run start
```

`npm run type-check` checks TypeScript without emitting files; `npm run format:check` checks source formatting. Development uses the Nest CLI watch compiler, including decorator metadata.

### Database connection waits

Runtime PostgreSQL URLs default to `connect_timeout=15` and `pool_timeout=30` seconds. On Vercel, `connection_limit=5` bounds each function instance's pool; a local persistent server retains Prisma's normal pool sizing. Explicit parameters in `DB_STRING` are respected, including provider/SSL settings. Hosted application traffic should use the database provider's pooled endpoint. These runtime defaults require no edit to a private `.env` file and do not change Prisma migration configuration.

Mobile and admin authentication transactions wait up to 30 seconds for acquisition. A `P2024` pool timeout or pre-start `P2028` is retried at most once with a short delay, only if Prisma has not entered the transaction callback. Entered transaction errors, commit failures, identity conflicts and revoked/expired sessions are never replayed. Transaction execution time limits and authorization/locking rules remain unchanged. Persistent database unavailability still returns the existing `503 DATABASE_BUSY` response with `Retry-After`.

After changing runtime connection defaults, restart the API process or redeploy API V2. See [the connection-pool investigation](../../../context/DATABASE_POOL_AUTH_FIX.md) for verification and limitations.

The API emits native ES modules for NestJS 12: package `type: module`, TypeScript `NodeNext`, and explicit `.js` extensions on relative imports. Preserve these settings for Vercel; CommonJS output can fail there with `ERR_REQUIRE_ESM`. The existing unit-test script preloads its environment using `--import`.

## Architecture

```text
src/
  app.module.ts                   Root module importing all features
  bootstrap.ts                    Nest Express adapter, body limits, CORS, versioning
  main.ts                         Listener and startup error handling
  core/
    core.module.ts                Global providers and exception filter
    guards.ts                     Auth, admin, origin, login rate, signed webhooks
    idempotency.interceptor.ts     Database-backed duplicate request protection
    http_exception.filter.ts      Existing JSON error contract plus Nest errors
    request_context.middleware.ts Request ID before body parsing
  features/<feature>/
    <feature>.module.ts           Providers, controllers and cross-feature imports
    <feature>.controller.ts       Nest route decorators and validated inputs
    <feature>.service.ts          Injectable business logic
    <feature>.repo.ts             Injectable Prisma queries and audited mutations
    <feature>.type.ts             Existing Zod schemas and TypeScript types
    <feature>.route.ts            Route path constants, including aliases
    <feature>.constant.ts         Feature constants and messages
  infra/database/
    client.ts                     Extended Prisma client and timestamp IDs
    entity_id.ts                  ID generation for direct and nested writes
    prisma.service.ts             Injected client and shutdown lifecycle
  infra/media/
    cloudinary.ts                 Injected upload service and failure cleanup
    image_transform.ts            WebP conversion before provider upload
prisma/                           Schema, matching migration history and dev seed
```

Controllers are registered with Nest modules. Services and repositories receive dependencies through their constructors. Cross-feature dependencies, including route calculations and category selection used by ride quotes, are exported/imported through their feature modules. V2 does not mount the V1 Express routers or import V1 source at runtime. Express is Nest's HTTP adapter and supplies the request/response objects, cookies, and JSON parsers.

## Feature coverage

| Module | Included behavior |
| --- | --- |
| Health | Database connectivity status |
| Auth | Verified Google mobile login, rotating refresh tokens, current user, logout |
| Admin auth | Google administrator sign-in, browser cookies, refresh families, logout |
| Admin access | Searchable administrator directory, Google-email grants, audited removal and role restoration |
| Vehicle catalog | Brands/models, deferred WebP logo uploads, driver requests and admin moderation |
| Partner requirements | Shared dynamic categories and typed Detail/Document field definitions |
| Admin users | Search/pagination, personal details, edit conflicts, unique phone validation |
| Admin | Driver verification and ride offers |
| User | Profile/avatar/location, saved places, notifications |
| Vehicle categories | Admin CRUD, two-level hierarchy, enabled rider/driver choices |
| Driver | Profile, verification/availability rules, vehicle registration/classification/selection, offers, location, ride transitions |
| Geocode | Search, reverse geocoding, road route geometry/distance/duration |
| Ride | Quotes, booking, history/detail/events/locations, cancellation, start confirmation, reviews with driver rating statistics |
| Payment | Methods, cash checkout state, raw-body-signed webhooks, receipts |
| Emergency | Owned emergency-contact CRUD, including `/me` aliases |
| Support | Owned tickets, ride linkage and messages |

Existing request schemas, response envelopes, status codes, ownership rules, transactional audit logs, category fare snapshots, assignment locks, and current account/session-family checks are retained. The source accepts the same JPEG/PNG/WebP image selection payload; the shared media service converts new images to WebP locally before uploading to Cloudinary, then supplies the returned URL to the entity transaction. Failed persistence triggers best-effort cleanup of the new asset.

Fare components use decimal arithmetic and round half-up to two decimal places. Review submission updates the driver's rating count and rounded average in the same transaction, with a shared driver lock for concurrent reviews.

## HTTP and security

- URI versioning registers both `1` and `2` under the global `api` prefix using [Nest versioning](https://docs.nestjs.com/techniques/versioning).
- `AuthGuard` checks JWT validity and the current database user, role, status, and browser session family. Admin routes add `AdminGuard`.
- Browser login/refresh/logout add `AdminOriginGuard`; login also adds the process-local rate limiter.
- V2 uses a separate `onemore_admin_v2_refresh` cookie with HttpOnly, SameSite=Strict, path `/api`, and Secure in production. Sign in again when switching an admin browser to V2. The broader path permits both supported version prefixes; the cookie name separates the two implementations.
- `PaymentWebhookGuard` verifies HMAC against the exact received JSON bytes; the parser retains the raw buffer before JSON decoding. Image form endpoints allow 8 MB JSON bodies; other routes keep their 1 MB limit.
- `IdempotencyInterceptor` enforces the same keys/body hash and database uniqueness. Scopes use the matched route and decoded parameters, so URL casing, trailing slashes, and equivalent parameter encoding cannot repeat a mutation. Parameter casing is preserved. V2 paths normalize to V1's key scope so a retry across prefixes shares the stored result. Concurrent claims return the existing in-progress/conflict responses. Successful envelopes are cached with their HTTP status; failed handlers release unsaved claims so errors can be retried.
- The global exception filter retains `{ status, message, error_code, request_id, details }`, including malformed JSON, oversized bodies, Zod validation, unique-record conflicts, and unknown Nest routes. Missing database records return 404; reference and transaction conflicts return safe 409 responses. Internal errors return generic copy.
- Nest shutdown hooks close the HTTP listener and disconnect Prisma.

## Database and configuration

API V2 is the canonical backend and migration owner. Its eleven migrations include partner onboarding, vehicle verification, Phase A fare/support configuration and Phase B driver operations. API V1 is not updated. Both API URL prefixes served by V2 invoke the same Nest controllers. For another environment, apply pending migrations with `npm run prisma:deploy` before starting the updated API.

For an empty database, configure `DB_STRING` and deliberately apply the committed migrations using `npm run prisma:deploy`. `npm run prisma:seed` is optional development data. Docker Compose retains project name `api` to reuse the existing local PostgreSQL volume.

Configuration retains `DB_STRING`, JWT settings, Google web/mobile client IDs, exact admin origins, routing URL, Cloudinary credentials, and payment webhook secret. See [.env.example](./.env.example). Cloudinary secrets and database credentials stay on the API server. The existing admin grant command is available as `npm run admin:grant -- --email you@example.com`; existing ADMIN accounts already work against the shared database.

A `.env` file is optional in development and is not loaded in production or on Vercel. Both runtime configuration and Prisma read the process environment. Configure production credentials in Vercel's API project environment settings. Public example JWT/payment secrets produce a nonfatal `EXAMPLE_SECRETS_CONFIGURED` warning; required fields, minimum lengths, and other configuration validation still apply. Configured values are preserved for signing and verification. Values must persist across invocations and deployments so existing tokens and webhook signatures remain valid. Public example secrets permit forged tokens/payment signatures and should be replaced before production use.

## Administrator access management

The admin panel's **Admin → Access → 1More Admin** page uses these protected endpoints beneath `/api/v2` (or this server's `/api/v1` alias):

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/admin/access/1more-admin` | Search/filter/page existing administrators and read overview counts |
| POST | `/admin/access/1more-admin` | Grant access to `{ email }`, provisioning an account if needed |
| DELETE | `/admin/access/1more-admin/:id` | Remove access with `{ expected_updated_at }` |

Every endpoint requires a current active administrator. Grants reject suspended/deleted and ambiguous duplicate-email accounts. Removal rejects self-removal, protects the last active administrator, restores the previous role, and revokes browser session families. Access changes and browser sign-in/refresh coordinate with database advisory locks. The initial `admin:grant` command uses the same lock and metadata rules. See [ADMIN_ACCESS_IMPLEMENTATION.md](../../../context/ADMIN_ACCESS_IMPLEMENTATION.md).

## Point clients at V2

For the admin web app, use `VITE_API_BASE_URL=/api/v2` in `apps/admin/v1/.env` during development. Vite development and preview proxy `/api` to V2 at `http://127.0.0.1:4001`. Keep the actual browser origin in `ADMIN_WEB_ORIGIN`. The relative URL keeps browser refresh cookies on the same origin when using either localhost or 127.0.0.1. Restart Vite after environment changes. Production admin builds always use same-origin `/api/v2`; route `/api` to V2 through the admin host's reverse proxy. An absolute API base override is available in development only.

For Flutter Android emulators, set `API_BASE_URL=http://10.0.2.2:4001/api/v2` in `apps/user/v1/.env` and restart the app. Physical devices use the development machine's LAN address instead of `10.0.2.2`. Existing clients can retain `/api/v1` while directing traffic to V2.

## Checks

```powershell
npm run type-check
npm run format:check
npm run prisma:validate
npm run build
npm run test:unit
```

The fast suite uses fixture secrets, a fake database for HTTP checks, mocked provider requests, and real Sharp image conversion. It checks environment validation, geocoding errors, nested IDs, compiled route metadata, both URL versions, access rules, cookies, request limits, pagination, idempotency, webhook signatures, and media handling.

Google identity checks also cover verified, nonempty normalized emails. The focused `npm run test:identity` database suite (with `LIF_RUN_DB_TESTS=1`) verifies that grant, first admin sign-in, and mobile sign-in retain one user ID and one Google link. It covers both sign-in orders, concurrent registration, saved profiles, inactive/deleted accounts and conflicting identities. It is included in `test:integration`; all integration files run sequentially.

Database integration checks are opt-in. Configure `DB_STRING` for a test database; the suite refuses database names without `test`. It creates uniquely named fixtures and removes them afterward.

```powershell
$env:LIF_RUN_DB_TESTS = '1'
npm run test:integration
```

The database suite covers personal edits and image persistence, identity binding, current admin permissions, refresh/logout races, driver location auditing, category hierarchy and conflicts, vehicle ownership, quote snapshots, ride assignment races, support/review ownership, concurrent driver ratings, payments, and signed webhooks including initial reference binding. Provider uploads are mocked; no image is sent to Cloudinary during these checks.

See [API_V2_REVIEW.md](../../../context/API_V2_REVIEW.md) for review findings, results, and remaining verification limits.

See [API_V2_PARITY_REVIEW.md](../../../context/API_V2_PARITY_REVIEW.md) for the subsequent V1 comparison, development proxy correction, database availability handling, final checks and the observed intermittent permission-test limitation.

V2 supplies a 15-second PostgreSQL connection timeout when `DB_STRING` does not specify `connect_timeout`. Explicit connection settings are preserved. Known connection and pool/transaction availability failures return safe HTTP 503 responses with `DATABASE_UNAVAILABLE`/`DATABASE_BUSY` and a short Retry-After header; no write is retried automatically. Unexpected permission denials include actor ID/current role in server diagnostics, without credentials or bodies.

## Admin workspace expansion

Admin sign-in now records optional browser-permitted coordinates or an explicitly approximate IP/ISP location in the sign-in UserLog event. Admin Access exposes the latest snapshot; existing sessions need a fresh sign-in to populate it. External lookups are bounded, outside database transactions and do not prevent login on provider failure. If deployed behind a reverse proxy, configure `TRUSTED_PROXY_CIDRS` with its explicit peer IP/CIDR allowlist so request IP attribution uses only known proxies. See [ADMIN_LOGIN_LOCATION.md](../../../context/ADMIN_LOGIN_LOCATION.md).

Migration 0005 adds brand/model moderation, shared partner requirement categories/fields, login timestamps and central admin activity records. Migration 0006 backfills login timestamps from retained authentication events. V2 is the only API package updated for this expansion; do not synchronize these new migrations into V1.

Access removal uses `expected_access_version` from the directory, avoiding unrelated profile/location/login conflicts. Missing/already-removed access is idempotent. Users can be deactivated with confirmation while retaining history; sessions/devices are revoked and active rides block deactivation. Admin requests are centrally audited alongside transactional business logs, including denied and malformed admin-route attempts. Handler outcomes are saved before returning success, with finish/close recovery and readable action names for current and historical entries. `GET /admin/activity` supports `activity=changes|reads|all` (API default `all`) plus existing query/outcome filters. Database request and business audit logs expire after seven days and are purged in batches. See [audit reliability and retention](../../../context/ADMIN_AUDIT_RELIABILITY.md).

See [ADMIN_EXPANSION_IMPLEMENTATION.md](../../../context/ADMIN_EXPANSION_IMPLEMENTATION.md) for all new endpoints, future driver proposal integration, dynamic field configuration, concurrency protections and audit/check limits. No automated tests were run for the expansion.

## New-user admin emails

Every new account created through app sign-in, admin access provisioning, or the admin grant command queues an email for each existing active admin with an email address. Repeat sign-ins and linking Google to an existing account do not create another signup email. The new account itself is excluded from the recipient list; recipient emails are deduplicated without case sensitivity.

Emails include user ID, name, email, phone (or Not provided), role, account status, creation time in India time, registration source, and a button linking directly to the user's Personal page. HTML values are escaped. The link requires normal admin authentication; after signing in, the admin returns to the linked user profile.

- SMTP uses the existing MAIL_USER and GOOGLE_APP_PASSWORD settings. Sender display name is 1More Admin.
- ADMIN_NOTIFICATION_ORIGIN optionally changes the link destination. Its default is https://adminonemore.vercel.app; configure one origin with no path.
- The existing notifications table's EMAIL channel stores the delivery queue in the same transaction as user creation. No schema migration is needed. These records are excluded from the mobile notification feed.
- Delivery starts after commit in a background task, including Vercel waitUntil. SMTP failures do not fail login. If SMTP credentials are missing, deliveries stay pending.
- Sign-ins, admin sign-ins, access grants, and visits to the admin Users list drain up to 10 queued deliveries per invocation. Failed or abandoned delivery claims become eligible again after five minutes. Recipients' current admin status and email are checked before sending; revoked/deactivated admins and changed addresses are skipped.
- Delivery state and attempts are recorded in notifications.data, with sent_at for processed records. SKIPPED means the recipient lost access or changed their email. SMTP acceptance does not guarantee inbox delivery; an interruption after SMTP acceptance can cause a retry even with a stable Message-ID.
- For an operator retry of an eligible batch, run npm run notifications:retry from this folder. Repeat for larger backlogs. Existing users are not backfilled.

Implementation checks use mocked SMTP; they do not send real customer or administrator email.

## Phase A fare, mode and support foundation

See [PHASE_A_IMPLEMENTATION.md](../../../context/PHASE_A_IMPLEMENTATION.md) for the accepted product decisions, checklist and rollout. Migration 0010 adds versioned fare/rate and public support-contact tables. No numerical rates or real contacts are seeded.

- GET/PATCH /admin/fare-policy: admin-only, expected_version on shared settings and expected_updated_at on each submitted category rate, with audit snapshots. The registry lists every current category/subcategory, including disabled/grouping entries. Each category owns max_profit_km, normal_fare_per_km and profit_fare_per_km; there is no vehicle-family or parent-price fallback. Category create/update also accepts fare_policy (all three values, or null to leave it unconfigured).
- Fresh HTTP ride quotes use the selected category's min(distanceKm, limitKm) * profitRate + max(distanceKm - limitKm, 0) * normalRate. Decimal calculation rounds once; base/time/commission are zero. Unpriced or disabled choices are excluded; grouping categories are not quoted. Snapshots retain category ID/update time, rates and payment rules. Later edits never reprice saved quotes or rides; a disabled/deleted category cannot start a new booking from an old draft. Agreed shared defaults apply until shared settings are saved.

Migration 0013 copies any former effective group rates onto each existing category once. Historical group records and legacy base/per-km/per-minute columns are retained for compatibility; current runtime pricing never reads them. New categories have no fare until configured. Builds deploy migrations before prisma db push so backfills cannot be skipped. See [category fare implementation](../../../context/CATEGORY_FARE_POLICY_IMPLEMENTATION.md).
- Launch policy stores cash/direct-UPI availability, fixed zero commission/unavailable online collection, editable free-cancellation/free-wait minutes and cancellation/no-show percentage/cap. Defaults follow the user's 2/5/10/100 choices. Booking and checkout enforce selected-quote cash availability and explicitly reject unavailable digital operations. These settings do not implement UPI receipt confirmation, fees, waiver/dispute or payment collection by themselves.
- GET /me/travel-context: active rider/driver summaries, mode eligibility and availability. GET /driver/rides/current, /driver/rides and /driver/rides/:id are authenticated owner-scoped reads. They omit trip OTPs and rider contact details. History list is paginated and excludes heavy route/event payloads.
- Cross-role participation locks prevent simultaneous rider booking and driver work. Cancellation and completion use one current-eligibility calculation before returning AVAILABLE; suspension remains preserved.
- GET /support/configuration: public contact values for authenticated app users. GET/PATCH /admin/support/configuration/contact: admin editor with expected_version and audit.

Phase B replaces the operational start/completion endpoint handlers with the combined verification and direct collection flow below.

## Phase B driver operations

Apply `0011_operational_driver_trip` before running the updated API. It adds encrypted trip-start challenges, chat messages, GPS accuracy, preferred collection method, receipt evidence, reviewed obligations and editable operational settings. No fare prices or customer fixtures are seeded.

- Driver dashboards and rider status/context reads advance matching through database transactions. Initial search is 1 km, doubling every 30 seconds up to 10 km; search stops after 180 seconds. Offers last 45 seconds. Admins can edit these settings in Fare Policy. There is no dependency on a persistent Vercel worker.
- A verified driver needs a currently eligible active vehicle and fresh precise GPS to receive/accept offers. An active trip allows viewing offers only. Acceptance is serialized; its successful retry returns the same assigned trip.
- Arrival defaults to within 150 metres of pickup, GPS at most 60 seconds old and reported accuracy at most the configured radius. Arrival records evidence, notifies the rider and starts the free waiting period.
- Both rider confirmation and the assigned driver's six-digit trip-code verification are required to start. Codes are encrypted at rest, expire after ten minutes, lock after five wrong attempts, and bind to the current assignment. Refresh after expiry resets both proofs. Neither history endpoints nor driver context expose the code.
- Assigned-trip navigation supplies OSRM steps and geometry to MapLibre. Location capture timestamps, accuracy and server freshness checks prevent cached coordinates from being presented as a fresh fix. GPS coordinates are not independent anti-spoofing attestation.
- Completion uses the immutable accepted fare, records pending collection and rechecks current eligibility before restoring availability. Driver GPS path distance is recorded only when enough usable points exist; it does not silently change the accepted fare.
- CASH and direct UPI follow the accepted quote's payment-policy snapshot. UPI comes from a uniquely approved partner-application UPI field. Only the assigned driver can confirm full receipt. A UPI intent/rider selection remains pending. Confirming a previously unpaid fare closes its open review to prevent a duplicate debt. A waived fare cannot be reopened through either checkout endpoint.
- Trip-scoped text chat uses idempotent client keys and rate limits. Ordinary calls record intent, not connection. Contact details are available during an active assignment; public history excludes live driver GPS and private vehicle documents. Masked calling has no provider and remains unavailable.
- Cancellation/no-show reports create at most one review per trip. No-show requires verified arrival, free waiting time, a post-arrival call attempt and a fresh accurate pickup location. Admins review evidence, disputes and exemptions in **App > User > Ride Reviews**, with pagination and version checks. Approval records a pending obligation; settlement records verified manual receipt by the original driver. Pending charges may be waived. Automatic deductions, online payment processing, cash refunds and driver penalty collection are not implemented.

See [Phase B tracker and release checks](../../../context/PHASE_B_IMPLEMENTATION.md) for validation and device/provider limitations.

The trip-context response includes a public `trip` summary and `driver_has_active_trip` for the current driver. Its ride/proof/payment relations are read in one Repeatable Read transaction, so the mobile controls and trip display use the same snapshot. History retains no rider telephone number in that summary. The rider locations endpoint returns the latest 500 points in chronological order; completion telemetry is queried separately. See [the follow-up audit](../../../context/PHASE_AB_AUDIT.md) for current verification results.


## Phase C rider operations

The trip-context snapshot now includes the selected quote, public driver/vehicle details, route, latest activity and current rider rating. Active driver GPS is disclosed only to the ride owner during the active assignment. GET /trips/:id/rider-route computes remaining pickup/drop-off progress from stored fresh driver GPS; there are no caller-supplied routing coordinates. GET /me/rides provides authenticated, paginated Active/Past/All rider history, excluding drafts. Booking supports a 500-character pickup note; cancellation supports structured reason codes. Identical rating retries reuse the saved review.

New quotes use pickup_eta_s=0 to mean unknown until assignment. The rider client shows a real route estimate only after assignment. No Phase C schema changes or seed data are needed; retain migrations 0010 and 0011. Deploy this API before the new mobile client. See [Phase C tracker](../../../context/PHASE_C_IMPLEMENTATION.md) for behavior, validation and device acceptance.


## Phase D driver account

Apply migration `0012_driver_account` before serving the updated driver account, matching and payment routes. Driver account/finance and vehicle-document reads are owner scoped and remain available after partner exit; operational writes retain exit guards. Admin Users > Driver Account provides the same statement and versioned destination review. Payout values are encrypted with the existing private JWT secret: preserve it or re-encrypt records before a rotation. Private reveals are audited, and old receipt destinations remain unchanged. Vehicle document replacement blocks active trips and preserves other field reviews; RC/insurance/PUC now support validated PDF as well as converted images.

See [Phase D implementation](../../../context/PHASE_D_IMPLEMENTATION.md) for API/UI contracts, direct-collection accounting boundaries, checks and rollout. No automatic platform payout or expiry enforcement is introduced.

See [entity menus, application deletion and seven-day audit cleanup](../../../context/ADMIN_ENTITY_ACTIONS_AND_AUDIT_RETENTION.md) for the exact deletion scope, safeguards, maintenance command and Vercel cron configuration.

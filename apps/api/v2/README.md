# 1More API v2 — NestJS

Standalone NestJS 12 implementation: 17 feature modules, 116 method/path combinations, injected services/repositories, and Prisma/PostgreSQL persistence. See [route-manifest.json](./route-manifest.json) for every route and its guards/idempotency policy.

Partner onboarding adds published rich documents, private assets, dynamic application reviews, confirmation/final PDF approval, SMTP delivery and first-login driver activation. See [PARTNER_ONBOARDING_IMPLEMENTATION.md](../../../context/PARTNER_ONBOARDING_IMPLEMENTATION.md) for routes, operator setup and delivery behavior.

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

V1 and V2 share the same schema and four committed migrations. Migration `0004_admin_access` adds durable grant/revocation metadata and the previous role used when removing administrator access. Existing administrator roles are retained. The local `.env` points to the same database and integrations as V1, so both processes see the same users, roles, categories, sessions and rides. Keep migration histories synchronized while both implementations are maintained; use V2 as the canonical schema after client cutover. For another environment, apply pending migrations with `npm run prisma:deploy` before starting the updated API.

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

Access removal uses `expected_access_version` from the directory, avoiding unrelated profile/location/login conflicts. Missing/already-removed access is idempotent. Users can be deactivated with confirmation while retaining history; sessions/devices are revoked and active rides block deactivation. Recognized admin requests are centrally audited alongside transactional business logs.

See [ADMIN_EXPANSION_IMPLEMENTATION.md](../../../context/ADMIN_EXPANSION_IMPLEMENTATION.md) for all new endpoints, future driver proposal integration, dynamic field configuration, concurrency protections and audit/check limits. No automated tests were run for the expansion.

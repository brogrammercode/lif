# API v2 · Raw PostgreSQL aur NestJS migration plan

28 November 2026 · Scope `apps/api/v2` · Status **API v2 runtime migration verified locally, staging and rollout pending**

## 1. Final architecture

**Saare runtime database calls handwritten, parameterized PostgreSQL SQL se chalenge.** Reads, writes, auth/session, shared guards, idempotency, audit, webhooks, workers aur health checks sab scope mein hain. Final runtime ek Nest-injected `pg` pool use karega. Repository code Prisma model API, Prisma Client raw wrappers ya Prisma-generated types import nahi karega. Existing Prisma migration history aur CLI schema deployment ke liye retain honge. CLI tooling ko retire karna separate migration decision hai. [PostgreSQL audit and benchmark](POSTGRES_SQL_ARCHITECTURE_REPORT.md) · [node-postgres queries](https://node-postgres.com/features/queries)

**NestJS feature modules request lifecycle own karenge.** Controllers HTTP contract handle karenge, services business workflow own karengi, repositories SQL execute karengi, aur provider adapters external calls handle karenge. Ye plan current API v2 routes ke andar migrate hota hai. Legacy API v1 reference ke liye rahegi. [NestJS modules](https://docs.nestjs.com/modules) · [Controllers](https://docs.nestjs.com/controllers) · [Providers](https://docs.nestjs.com/providers)

## 2. Current baseline aur gaps

| Area           | Aaj                                                                                                                                                       | Target                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Routing        | Nest modules, decorators aur URI versioning already present hain. Kuch controllers `@Controller()`, full path constants aur broad `@Req()` use karte hain | Feature/resource prefixes, HTTP method decorators, bound DTOs, deliberate aliases                     |
| Validation     | Zod parsing controllers mein inline aur `*.type.ts` mein mixed schemas milte hain                                                                         | `dto/` request schemas aur Nest validation pipe, consistent error envelope                            |
| Modules aur DI | Global `CoreModule` DB, auth, audit aur media providers export karta hai. Pending module controller file mein declared hai                                | Feature-local providers, explicit imports/exports, named shared modules                               |
| Persistence    | Shared Prisma client, 765 observed ORM calls including known aliases, 140 raw calls, 121 transaction sites at audit time                                  | Injected `pg` pool, handwritten SQL aur typed result mapping for every runtime DB path                |
| Deployment     | Vercel Nest entry point, deployed schema history, pooled runtime and direct migration URL                                                                 | Same API entry point and deployment boundary, database-independent build and versioned SQL migrations |

Baseline comparison ke liye 228 route-manifest entries, tests, schema constraints aur real request behavior use karo. NestJS feature modules recommend karta hai. Neeche ka directory layout 1More ka chosen convention hai. [App module](../apps/api/v2/src/app.module.ts) · [Core module](../apps/api/v2/src/core/core.module.ts) · [Pending controller](../apps/api/v2/src/features/admin_pending/pending.controller.ts) · [Route manifest](../apps/api/v2/route-manifest.json)

## 3. Target folder structure

```text
apps/api/v2/
  src/
    main.ts
    bootstrap.ts
    app.module.ts
    common/
      decorators/
      filters/
      guards/
      interceptors/
      middleware/
      pipes/
    config/
    database/
      database.module.ts
      postgres.service.ts
      transaction.ts
      postgres-error.ts
      row-mappers/
    features/
      rides/
        rides.module.ts
        rides.controller.ts
        rides.service.ts
        rides.repository.ts
        dto/
        sql/
        rides.mapper.ts
      wallet/
        wallet.module.ts
        controllers/
        services/
        repositories/
        dto/
        sql/
      cron/
    infra/
      mail/
      media/
    scripts/
    tests/
  prisma/
    schema.prisma
    migrations/
```

Small feature mein module, controller, service aur repository same folder mein rakho. Wallet jaise multi-controller feature mein private subfolders tab use karo jab ownership clear ho. Public exports sirf doosre modules ko chahiye wale providers ke liye. Folder moves us feature ke migration slice mein karo. Release branches mein mechanical repository-wide rename avoid karo.

## 4. NestJS conventions

- **Controllers.** `@Controller('rides')`, `@Get(':id')`, `@Post()`, `@Patch()`, `@Delete()` aur explicit `@HttpCode()` use karo jahan current contract require karta hai. Rider, driver, admin aur webhook endpoints split karo jahan guards ya transport requirements differ karte hain. `@Body()`, `@Query()`, `@Param()` aur `@CurrentUser()` se inputs bind karo. Full request access raw bytes, cookies ya headers jaise cases mein scoped rahe. Verify legacy aliases, route precedence, request IDs aur response/status parity. [NestJS controllers](https://docs.nestjs.com/controllers) · [Custom decorators](https://docs.nestjs.com/custom-decorators)
- **DTOs aur pipes.** Existing Zod rules ko `dto/` mein move karke reusable Nest `PipeTransform` se bind karo. Typed controller inputs aur same validation error paths preserve karo, including defaults, coercion and unknown-field handling. IDs opaque strings rahenge. Business validation service aur DB constraints mein rahe. [NestJS validation](https://docs.nestjs.com/techniques/validation)
- **Services, providers aur repositories.** `@Injectable()` constructor injection aur explicit module imports use karo. Services workflow, authorization decisions aur transaction boundary own karein. Repositories scoped queries, row mapping aur affected-row checks own karein. Cross-module work public service se chale. `DatabaseModule` shared pool export kare aur feature modules apni dependencies declare karein.
- **Request lifecycle.** Existing security, audit aur idempotency hooks ko Nest guards, interceptors aur filters mein standardize karo. Order test karo, especially guard decisions before execution and final outcome audit on failures. Shared exception filter current business error codes aur HTTP envelopes preserve kare. Express bootstrap mein existing trusted proxy, CORS, body-limit behavior aur provider signature ke original bytes verify karo. [NestJS request lifecycle](https://docs.nestjs.com/faq/request-lifecycle) · [Current bootstrap](../apps/api/v2/src/bootstrap.ts)

## 5. PostgreSQL implementation rules

- **One pool per runtime instance.** One shared `pg.Pool`, pooled runtime URL, bounded connection cap aur explicit acquire, query aur lock-timeout behavior. Deploy-time migrations direct URL use karengi. Bridge rollout mein Prisma aur `pg` ka combined connection budget verify karo. Transaction same checked-out client par `BEGIN`, work, `COMMIT`/ `ROLLBACK`, then release kare. Shutdown hook lifecycle pool close kare. [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) · [node-postgres transactions](https://node-postgres.com/features/transactions)
- **SQL ownership.** Domain query text feature-owned `sql/` mein typed `*.sql.ts` modules ya bundled `*.sql` files mein rahe. Build artifact mein SQL load verify karo. Values `$1`, `$2` bindings se pass karo aur sort/filter identifiers allowlist use karein. Reads explicit projection aur bounded pagination use karein. Writes `RETURNING`, revision predicates aur required constraints preserve karein. Soft-delete semantics business rules se follow hongi.
- **Prisma behavior replace karo.** ID generation, `@updatedAt`, model defaults, nested create/update, transaction isolation aur Decimal/BigInt/Date/JSON representations inventory karo. Existing IDs and timestamps preserve karo. Money exact integer paise ya decimal mein handle karo. Known SQLSTATE and constraint violations existing API errors mein map karo. Money/write retries allowed tabhi hain jab operation idempotent hai aur commit outcome clear hai. [ID generation](../apps/api/v2/src/database/entity-id.ts) · [PostgreSQL transaction boundaries](../apps/api/v2/src/database/postgres.service.ts)
- **Views aur external work.** Regular views shared projections ke liye. Materialized views sirf measured historical reporting ke liye, documented freshness aur refresh policy ke saath. Live balances, wallet ledger writes aur active trips primary tables aur transactions use karein. Razorpay, Google, routing aur media/email calls service/provider layer mein rahengi. Provider network wait transaction ke bahar rakho, aur claim/result ko safe transitions se persist karo. New refresh jobs existing single **05:00 IST** cron dispatcher se chalengi. [Daily cron plan](DAILY_CRON_PLAN.md)

## 6. Execution checklist

| Phase              | Work                                                                                                                                                                                  | Exit gate                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 0 · Baseline       | Route/guard/DTO matrix, SQL call inventory including shared hooks, known failures rebaseline, isolated PostgreSQL fixture DB and current performance baseline                         | Manifest, response envelopes, auth/role cases, cache/pool baseline aur existing failures documented                         |
| 1 · Foundation     | Nest database module, `pg` adapter, query/timeouts/error mapper, request DTO pipe, thin-controller conventions and trace metrics                                                      | Pool checkout/release, timeout behavior, transaction rollback, validation and build verified in isolation                   |
| 2 · Pilot          | Health check aur read-only admin access directory/ride history paths migrate. Catalog ke simple CRUD se standard write slice verify karo                                              | Old/new responses equivalent, page totals and permissions exact, measured DB round trips and endpoint latency               |
| 3 · Feature slices | Profile, places, support, notifications, catalog/fare policy, partner program, documents, vehicle verification aur configuration. Har slice mein Nest boundaries and raw SQL together | Every migrated route, service and background entry point has SQL and regression coverage                                    |
| 4 · Critical flows | Auth and refresh, shared guards, audit/idempotency, ride lifecycle, driver operations, payments, wallet, payouts and cron                                                             | Parallel request, duplicate webhook, insufficient balance, locks, provider retry, accounting and admin authorization parity |
| 5 · Cutover        | Remove remaining runtime Prisma dependencies, audit seeds/CLI separately, deploy to staging, canary by feature and expand after metrics pass                                          | Zero Prisma runtime client/model/generated-type imports or calls, API contracts and deployment verified                     |

- [x] Record route and SQL baseline. All 33 existing migrations replayed on the isolated PostgreSQL fixture database. The first full unit run reproduced the existing saved-place revision and vehicle correction failures.
- [x] Wire shared Nest `DatabaseModule`, parameterized `pg` access, rollback/error handling, current-user decorator and Zod DTO pipe. The real HTTP pilot passed against a freshly migrated PostgreSQL fixture. The single pg pool defaults to five connections with configurable capacity.
- [ ] Measure staging p95 and concurrent behavior against the original Nest/Prisma endpoints before promoting the pilot.
- [x] **Local schema safety.** All 33 existing migrations replayed successfully on a fresh PostgreSQL 18 database. The isolated integration suite exercised sessions, ride states, quote snapshots, vehicle review, provider references and ledger writes. The schema and migration history were unchanged.
- [ ] **Staging safety.** Run parity against a staging snapshot of existing sessions, ride states, vehicle documents, quotes and finance data before promotion.
- [ ] **Staging smoke and provider verification.** Exercise API, Flutter and admin clients on staging. Confirm Razorpay/RazorpayX and SMTP with authorized provider test accounts. Compare app and database latency, statement counts, pool waits, errors and lock timeouts under the same workload before production promotion.
- [ ] **Rollout and rollback.** Feature-wise deploy with a short-lived rollback path. One request uses one write implementation. Parallel comparison read paths par run ho sakta hai. Schema additions rollback window mein compatible rakho. Finance rollback mein provider reconciliation and idempotency keys continue hon. Public API paths and version remain stable.

**Done tab hoga** jab every runtime DB path SQL inventory mein accounted ho, `pg` adapter se end-to-end chale, aur staged regression, latency and rollback checks pass hon. Repo ke 228 routes rollout baseline hain. Raw SQL performance ka comparison measured workloads ke basis par report hoga. [Existing PostgreSQL benchmark](POSTGRES_SQL_ARCHITECTURE_REPORT.md) · [Vercel deployment rules](VERCEL_DEPLOYMENT.md)

## 7. Module migration tracker

Checked modules have completed their own Nest wiring and applicable SQL conversion. The shared authentication, audit and idempotency paths have their own gates below.

- [x] **Health** · Direct `pg` probe, resource-prefixed controller, existing 200/503 envelope. Manifest and local PostgreSQL HTTP test passed.
- [x] **Emergency Contacts** · SQL list/create/update/delete and same-transaction audit. Both aliases, validation, ownership and optional update semantics verified through PostgreSQL HTTP tests.
- [x] **Geocode** · Nest resource controller and typed query pipes; the existing provider adapter has no persistence. Geocode tests and versioned route coverage passed.
- [x] **Support** · SQL ticket CRUD paths and messages, owning-account predicates, ordered message projection and atomic audit. PostgreSQL HTTP test verified duplicate-key replay, owner-only access, creation and follow-up.
- [x] **Admin access** · SQL directory, grant and revoke, with atomic provisioning emails, audit and session revocation. PostgreSQL HTTP tests verified duplicate grant, stale revoke and role restoration. The identity suite verified that concurrent grants and sign-ins preserve one account.
- [x] **Admin accounts** · SQL user directory, profile edits, bounded ride history and atomic deactivation. Local PostgreSQL verified rider/driver scoping, stale revisions, active-ride protection and retained account history.
- [x] **Admin driver verification and manual offers** · SQL verification and offer creation, shared eligibility predicate, original lock order, duplicate handling and atomic audit. Nest DTO and PostgreSQL HTTP tests passed.
- [x] **Admin auth and session rotation** · SQL for Google account linking, browser sessions, token rotation, logout and current administrator. PostgreSQL browser tests verified both route aliases, cookie handling, origin checks and single-use concurrent refresh. The identity suite passed.
- [x] **Admin pending counts and registration email controls** · SQL snapshot and entity counts, registration email listing and conditional retry. Nest module split, ownership and scope tests, PostgreSQL HTTP and snapshot/drill-down tests passed. Provider delivery worker and shared invalidation are tracked under shared infrastructure.
- [x] **App configuration and fare policy** · SQL for ride policy snapshots, admin category fares, and public/admin support contacts. PostgreSQL tests covered monetary precision, partial-save rollback, stale updates, clearing a category fare, and editor privacy.
- [x] **Auth and rider sessions** · SQL for identity matching and linking, profile reads, session creation, refresh and logout. PostgreSQL tests verified concurrent single-use refresh, cross-app identity reuse, and rejection after logout. Unit tests cover preflight retries and prevent replay after a write or ambiguous commit.
- [x] **Cron and worker persistence** ? The single 05:00 IST Vercel trigger still invokes audit retention, top-up reconciliation, payout cycle preparation and payout transfers. HTTP tests verified dispatch and failure handling. PostgreSQL tests ran the individual jobs with local provider fixtures.
- [x] **Driver account** · SQL account and statement reads, payout change requests, private reveal and review. Local PostgreSQL verified encrypted data masking, admin-only reveal, replay and concurrent review, plus separate fare and charge totals.
- [x] **Driver operations** · Raw PostgreSQL for nearby matching, dispatch, trip context, route access, contact, chat, arrival, start proofs, completion, direct collection and settlement review. PostgreSQL verified no duplicate offers, wrong-code attempt persistence, rider and driver proof gates, one completion on replay, and cash ledger commission without balance movements. Wallet and Razorpay checkout and payout processing have separate checklist entries.
- [x] **Driver profile and vehicles** · Raw SQL for profile reads and registration, GPS, availability, legacy vehicle creation and category changes, active vehicle selection, and offer acceptance and rejection. Isolated PostgreSQL verified profile creation, stale GPS rejection, vehicle ownership, active vehicle rules and competing offer acceptance. Trip lifecycle commands and the vehicle verification workflow have separate checklist entries.
- [x] **Partner program** ? Raw SQL covers active workflow, uploads, application submission, field and confirmation reviews, final PDF access, activation, notifications, admin retry, scoped deletion and exit. PostgreSQL verified submission through activation, PDF access before and after approval, wrong-code attempt persistence, replay, and rider role restoration on exit.
- [x] **Partner requirements** · Raw SQL for public fields, admin lists, category and field writes, and scoped deletion. PostgreSQL HTTP tested document defaults, pagination, stale category deletion after a field edit and atomic removal. Unit tests retained the 200-field limit checks.
- [x] **Payment API and generic provider callbacks** · SQL for saved methods, legacy cash checkout, receipt and signed-provider processing. PostgreSQL verified ownership, checkout amount, cash callback rejection, decimal amount checks and one capture event on replay. Razorpay ride UPI, top-up and payout reconciliation are tracked with Wallet.
- [x] **Places** · SQL for scoped discovery, deduplication, bookmarks, visits, reviews, contributor edits and photo records. PostgreSQL verified cross-account isolation, archive visibility, public identity projection and photo replay and ownership. Ambiguous database failures retain uploaded media for reconciliation.
- [x] **Rider Ride API persistence** · SQL quote snapshots, booking claims, scoped lists/detail/activity and review aggregation. Local PostgreSQL verified decimal snapshot amounts, one booking per draft, owner-only reads and one review on replay. Dispatch, start proof, and cancellation commands remain tracked under Driver Operations.
- [x] **Travel context and history** · Direct SQL for five endpoints and typed Nest DTOs. PostgreSQL HTTP tests verified private projections, driver/rider ownership, IST history counts, live-ride priority, pending payment recovery and exclusion after capture.
- [x] **User profile and notifications** · SQL profile/avatar/location, personal saved-place CRUD and mobile notification feed. Typed Nest controllers and PostgreSQL HTTP tests verified ownership and private email visibility.
- [x] **Vehicle catalog** · SQL brand and model listings, review and correction writes, and CSV lookups. PostgreSQL verified public projection, CSV case-insensitive dependency lookup and duplicate handling, rejected-request correction and driver-owned request visibility.
- [x] **Vehicle categories** · Raw SQL for public and admin catalogs, quote category selection, create and edit. PostgreSQL HTTP tests covered parent visibility, decimal fares and commission, atomic audit and concurrent revision conflicts. Route manifest parity passed.
- [x] **Vehicle verification** · Raw SQL for catalog choices, private assets, upload and discard, submissions and corrections, field review, renewal and soft removal. PostgreSQL verified an entire submission and approval, concurrent upload/submission replay, active-trip removal protection, renewal replay and private-asset access.
- [x] **Wallet, payouts, ledger and reconciliation** ? Raw SQL covers balances and history, top-ups, ride UPI and Wallet checkout, cash commission, refunds, payout methods, settings, cycles and transfers. PostgreSQL verified exact paise, captured and failed transactions, webhook replay, quote commission, admin revisions, one transfer and one ledger settlement on retry. Razorpay and RazorpayX responses came from test fixtures.
- [x] **Shared session and driver guards** · Direct SQL verifies active user, matching session family and driver access. The PostgreSQL test checks valid, cross-account and revoked sessions.
- [x] **Shared idempotency** · SQL claim and replay, with an atomic expired-key takeover. Concurrent HTTP requests produced one ticket and replayed the saved response.
- [x] **Administrator request audit** · SQL records request start and completion and serves the audit list. Tests verified the recorded actor, status and action, seven-day visibility, legacy action aliases and paging.
- [x] **Audit retention** · Scheduled and CLI cleanup share one raw SQL batch with bounded deletes and the existing advisory lock. The isolated PostgreSQL test verified the seven-day boundary and that an expired checkout releases a late-arriving client.
- [x] **Pending snapshot invalidation** · Transactional SQL invalidation preserves the shared advisory lock. The HTTP fixture verified that an admin access write clears the cached snapshot.
- [x] **Account email delivery and admin provisioning CLI** · SQL outbox selection, claims, recipient verification and completion. Local PostgreSQL verified one claim under concurrency and that a different claim cannot finalize a delivery. SMTP behavior verified with a fake transport.
- [x] **Remaining shared persistence and Prisma removal** ? All API runtime paths use the injected PostgreSQL pool. SQLSTATE errors retain the API envelope, JSON and decimal types are runtime-owned, and the compiled app started with Prisma imports blocked. Prisma Client remains in CLI seeds and test fixtures. Existing IDs remain valid and new numeric IDs include instance entropy.

### Local verification

- API compilation, 258 unit tests and 29 isolated PostgreSQL integration tests passed. The route manifest covers 228 method/path pairs. All 33 migrations applied to a freshly bootstrapped PostgreSQL 18 fixture.
- The request controllers bind actors, path parameters and validated inputs through Nest decorators and Zod pipes. The wallet has separate rider, driver, admin and signed-webhook controllers. Auth and webhook handlers retain scoped request access for cookies, audit context and raw provider signatures.
- The build checks for Prisma runtime imports. The compiled API booted and handled the following requests with Prisma module resolution blocked.
- Local measurements used 160 requests per endpoint at concurrency 16, after eight warm-up requests. These values are a loopback baseline on the isolated fixture.

| API v2 endpoint | p50 ms | p95 ms | p99 ms | Peak pool waiters |
| --- | ---: | ---: | ---: | ---: |
| Health | 12.03 | 36.63 | 50.14 | 11 |
| Ride history | 25.64 | 41.29 | 46.46 | 11 |
| Wallet | 28.55 | 58.99 | 64.72 | 11 |

Staging comparisons, client smoke tests and production rollout remain open. The local database and mocked provider results cover code behavior.


### Full API v2 re-audit

- Reviewed all 26 feature modules, 32 controller files and 228 manifest entries. The runtime dependency check found zero Prisma imports or raw-query wrappers and checks the production dependency manifest as well. Prisma remains in development migration, seed and fixture tooling. The legacy API v1 application is outside this plan.
- Moved the remaining controller-local input parsing into typed Nest pipes for payment checkout, top-up checks, partner exit history and trip review filters. Standardized plain route IDs with the existing 100-character opaque-ID convention. Both checkout aliases retain route-ID precedence and idempotency handling.
- PostgreSQL releases a healthy connection after ordinary SQL errors and discards broken connections. Transaction callbacks now seal their query handles before commit or rollback. SQLSTATE mapping resolves directly to the existing API error envelope.
- The standard integration command includes the pending-count drill-down suite. Its connection-local fixtures run through the same Nest PostgreSQL adapter as the rest of the API.


### Consistency fixes

- Transaction statements use a client read deadline five seconds beyond their PostgreSQL statement deadline. A broken pipe or terminated connection maps to the existing database-unavailable response and is removed from the pool.
- Wallet refunds match the original debit and driver credit by ride, payment and ledger kind. The regression returns the original rows in reverse order and verifies the credited wallets.
- A fully refunded Razorpay UPI payment keeps its terminal status when an older partial-refund snapshot arrives. The PostgreSQL regression covers partial, full and delayed partial events with a fake provider.

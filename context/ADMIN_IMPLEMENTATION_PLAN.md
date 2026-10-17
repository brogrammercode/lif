# Lif admin implementation plan

## Scope and accepted decisions

- Location: `apps/admin/v1`; Vite, React, TypeScript, Tailwind.
- Use the module structure of `Quest/gym/apps/web`, and the visual tokens and component treatment of `Quest/gym/apps/mobile`.
- Navigation: primary left rail **App**, secondary navigation **User**, horizontal header tab **Vehicle Categories**.
- Authentication: Google identity, existing Lif users and ADMIN role, server authorization, browser session restoration and logout. No public admin signup or client-controlled role assignment.
- User decision: each vehicle chooses **one** category. Categories can contain **subcategories**. The initial hierarchy supports two levels; only enabled leaves with enabled ancestors can be selected.
- Preserve existing maps, location flow, logs, and prior uncommitted changes.

## Dependency-ordered delivery

1. [x] Inspect Gym structure, Flutter colors, typography, cards, tabs, fields, auth, and feedback components.
2. [x] Extract the component specifications into `context/WEB_DESIGN.md` before implementation.
3. [x] Add an additive category migration, seed the five existing vehicle families, and backfill existing vehicles and fare quotes.
4. [x] Implement authenticated catalog reads and admin category creation, editing, activation, hierarchy validation, and audit logging.
5. [x] Implement Google admin login, HttpOnly refresh cookies, session restoration, rotation, origin checks, active-admin checks, rate limits, and admin provisioning CLI.
6. [x] Scaffold the web app with Gym's `app/components/lib/modules/styles/types` layout.
7. [x] Build the responsive shell, login, catalog list, filters, statistics, and create/edit dialog with explicit loading/error/empty/success states.
8. [x] Connect vehicle registration to one active leaf category, expose available category trees, and validate category changes and offer eligibility. Added driver-only My vehicles registration/reclassification in Flutter.
9. [x] Build ride quotes from enabled database categories and snapshot category display metadata and pricing; render those values in Flutter's ride selector.
10. [x] Validate Prisma, regenerate the client, type-check/build API and admin, run relevant security/domain checks, and run Flutter analyze. Document setup and remaining external prerequisites.

## Storage and API contract

- `VehicleCategory`: generated identity/code, display name, description, image URL, optional parent, vehicle family, capacity, INR base/per-km/per-minute fares, sort order, enabled flag, timestamps.
- `Vehicle.vehicle_category_id`: one nullable foreign key for backward compatibility; new registrations resolve and persist one enabled leaf.
- `FareQuote.vehicle_category_id` and `category_snapshot`: historical quote presentation survives category edits. Prices are calculated on the server.
- `GET /vehicle-categories`: authenticated enabled catalog for rider/driver clients.
- `GET/POST /admin/vehicle-categories`, `PATCH /admin/vehicle-categories/:id`: current active admin required; edits use `updated_at` to detect conflicting changes.
- `POST /admin/auth/google`, `POST /admin/auth/refresh`, `POST /admin/auth/logout`, `GET /admin/auth/me`.
- Driver registration accepts `vehicle_category_id`; legacy `type` resolves its seeded category. Driver category changes remain owner scoped and compatible with the vehicle's physical family.

## Important invariants

- No signup can promote itself to ADMIN. Provisioning requires direct server CLI access.
- Browser refresh tokens are never put in JavaScript storage, responses, logs, or URLs; access tokens stay in memory.
- Every protected admin request verifies the current database role and account status, not only a role embedded in an old access token.
- One category per vehicle, no cycles, maximum two hierarchy levels, no selection of grouping categories, no selection under a disabled ancestor.
- Categories with registrations or quote history are deactivated, not deleted. Historical fares never change when current rates change.
- Editing a category cannot silently invalidate existing vehicle types or reparent a category into its own descendant.
- Category writes and audit logs commit together. Quote generation performs external routing before opening a database transaction.

## Setup and verification boundaries

Migration application must not drop or reset existing data. Check the live database migration state before applying additive migrations. Google requires a web OAuth client and authorized browser origin; do not invent credentials. An actual human admin is provisioned explicitly with the CLI. Build and local automated checks can run without Google credentials; the final report must distinguish those from a live Google sign-in.

## Completed verification and handoff

- Prisma schema validated, client regenerated, and additive migration `0002_vehicle_categories` applied to the configured `lif_test` database without resetting data.
- API TypeScript build and admin TypeScript/Vite production build passed.
- Admin formatting check passed.
- Twelve browser checks passed, covering catalog CRUD/subcategories, refresh/retry, protected routes, Google callback retry/logout, responsive layout, timeouts, sign-out across tabs, logout/refresh ordering, duplicate submissions, save/refresh failures, and conflicting edits. Google identity and API responses are fixtures in these browser checks.
- Six real-database HTTP integration checks passed, covering authorization, session-family revocation and races, mobile refresh/suspension, malformed JSON, idempotency privacy, hierarchy/edit conflicts, driver ownership/selection/compatibility, quote history/capacity, concurrent requests/acceptance, and cancellation. Temporary fixture users and categories were confirmed removed.
- Flutter analysis completed with no issues; no APK was built.
- Initial administrator access was provisioned with the CLI for the Google account explicitly supplied by the user.
- Review migration `0003_admin_session_families` was applied additively. The schema is up to date; API/admin dependency audits report zero vulnerabilities.
- Detailed findings, fixes, and verification boundaries are recorded in `context/ADMIN_REVIEW.md`.
- Second review completed: 16 browser tests, 15 API unit tests, 8 database integration tests, and 9 Flutter HTTP-client tests passed. Flutter analysis and both builds pass. Additional authorization, ownership, payment integrity, configuration, provider-response, and mobile account-isolation fixes are documented in the review.
- Live human Google sign-in remains to be exercised after the browser origin is authorized in Google Cloud. Configuration and local run commands are documented in `apps/admin/v1/README.md`.

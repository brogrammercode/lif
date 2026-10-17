# Admin workspace expansion — 2026-10-17

## Scope and account safety

Backend changes are confined to `apps/api/v2`. The admin frontend remains in `apps/admin/v1`. No API V1 source or migration was changed for this expansion.

The user selected **deactivate and retain history** for ordinary user removal. There is no hard-delete action for real accounts. A database inventory found one account: the active administrator `harshsharma55115@gmail.com`, ID `1791301496552`. No accounts matching the reserved integration-fixture patterns remained, and the reported stale ID `1792224260697` was absent. No account was deleted or deactivated during implementation. See `TEST_FIXTURE_CLEANUP.md`.

## Access removal

The admin directory supplies `access_version`, taken from the active AdminAccess record, or null for legacy grants. Removal sends `{ expected_access_version }`. Profile edits, mobile location changes and logins no longer cause false access conflicts. A genuine revoke/regrant changes the version and requires a fresh selection. Older callers using `expected_updated_at` retain their previous conflict checks.

Removing access that is already gone, including an absent user, is idempotent. Self-removal and last-active-admin protection remain. Revocation restores the previous non-admin role, retains personal/ride history and revokes browser admin session families. The directory refreshes on window focus.

## Login timestamps and audit

- Successful mobile sign-in updates `User.last_login_at`; successful admin Google sign-in updates both `last_login_at` and `last_admin_login_at`. Refresh does not count as a new login.
- Migration `0006_login_history` recovers real historical dates from existing `CREATE_SESSION` and `ADMIN_SIGN_IN` events. Missing evidence displays **Not recorded**.
- The admin access table displays last admin login; Personal displays both timestamps.
- A global Nest interceptor creates a durable pending AdminActivity record before a recognized authenticated admin handler executes. Admin browser sign-in, refresh and logout are also covered, including failed anonymous session requests. Authentication guards attach the verified actor identity when known.
- Response completion updates the HTTP outcome, actor and completion time. Guard/body errors on admin auth routes and failures for recognized admin actors are recorded through the response middleware. Requests rejected before an actor can be verified on other routes cannot be attributed to an administrator.
- Audit metadata includes request ID, actor, method, path, route action, status, IP, user agent and timestamps. Request bodies, query strings, tokens and cookies are excluded.
- Existing transactional UserLog business events remain. New brand, model, category, field and deactivation mutations write before/after business audits in their database transactions. CLI provisioning keeps its existing UserLog audit.
- **Admin / Access / Audit log** provides search, success/failure/pending filters, server pagination and refresh. Reading the audit log is itself audited.

Completion metadata is written asynchronously after the response. A process interruption or database failure may leave an entry pending; failures emit `ADMIN_ACTIVITY_SAVE_FAILED` with request ID. A failure to create the initial pending entry prevents the recognized admin handler from executing. This does not claim that terminal errors or arbitrary anonymous requests are administrator actions.

## User deactivation

Personal includes a confirmed **Deactivate user** action. The operator must type the displayed email or ID. The API rechecks the current admin actor, prevents self-deactivation/last-admin loss, detects stale edits and rejects accounts with requested, searching, assigned or ongoing rides.

The transaction marks the user DELETED with `deleted_at`, revokes all sessions and devices, removes admin access, expires draft rides, cancels unaccepted driver offers and takes a driver offline. Personal information, rides, identities and audit history remain. Deactivated accounts leave the active directory and cannot sign in or use protected endpoints. No reactivation workflow is added.

Account lifecycle advisory locks serialize mobile session creation/refresh and quote/booking creation against deactivation. Existing driver locks coordinate deactivation with offer acceptance and driver state changes. New catalog and requirement admin writes recheck the admin role in their write transaction, including after image upload. The lock order matches access grant/revoke and deactivation.

## Vehicle catalog

Navigation: **App / User / Vehicle Models**.

Brands have name, description, country, HTTPS website, logo, active state and moderation state. Models belong to one brand and have name, description, logo, physical vehicle family, fuel type, seating capacity, optional first/final year and moderation/active state. Brand names are unique after whitespace/case normalization; model names are unique within a brand. Server validation enforces family, seats, fuel and year ranges.

Both directories have independent search, review-state filtering and server pagination. Select a brand to add its models, or use All brands to review all requested models. Editors expose REQUESTED, VERIFIED and REJECTED; rejection requires a reason. Requested-by and reviewed-by metadata are persisted. A model cannot be verified before its brand is verified. Public choices include only verified, active models under verified, active brands.

Brand and model logos use the existing file picker/drop zone, local preview, replace/remove/undo controls and submit-time serialization. No cloud upload occurs on selection. API V2 centrally converts new images to WebP before signed Cloudinary upload; persistence failures trigger best-effort cleanup of the new asset.

Future driver integration is supported by authenticated proposal APIs. A driver profile is required; driver requests are forced to REQUESTED and cannot self-approve or provide admin review fields. A model request can reference an approved brand or the driver's own pending brand. The future Flutter brand/model selection and suggestion screens, and binding those catalog records to registered vehicles, remain separate future work; existing registration is compatible.

## Partner requirements

Navigation: **Partner program / Requirements / Details** and **Documents**.

One PartnerRequirement table stores all fields. STRING, TEXT, NUMBER, DATE and BOOLEAN appear in Details; FILE, IMAGE and PDF appear in Documents. Changing type moves the field to the corresponding tab. Categories are shared across both tabs and can be created/edited in the category manager before assigning fields. Disabling a category hides its fields from the public partner configuration.

Field configuration includes category, stable unique key, label, help text, placeholder where applicable, required/active settings and display order. Number fields have optional min/max; text fields have optional maximum characters. Documents have size limit (1–20 MB), allowed types and single/multiple-file settings. IMAGE fixes extensions to JPG/JPEG/PNG/WebP, PDF to PDF; generic FILE requires an explicit allowlist. Irrelevant validation settings are cleared on type changes. Field keys cannot change after creation. Saves use optimistic versions and transactional business audits.

The authenticated public configuration endpoint returns active categories/fields split into Details and Documents. This feature configures the form definitions; partner submission, document upload/storage, answer validation and review screens are not introduced by this configuration request.

## New API surface

Paths are relative to `/api/v2`. Nest retains its `/api/v1` URL alias on the V2 server.

| Method | Path | Access |
| --- | --- | --- |
| GET | `/admin/activity` | Admin; query, actor_id, outcome, page |
| DELETE | `/admin/users/:id` | Admin; expected_updated_at and confirmation; deactivation |
| GET, POST | `/admin/vehicle-brands` | Admin directory/create |
| PATCH | `/admin/vehicle-brands/:id` | Admin update/review |
| GET, POST | `/admin/vehicle-models` | Admin directory/create |
| PATCH | `/admin/vehicle-models/:id` | Admin update/review |
| GET | `/vehicle-brands`, `/vehicle-models` | Authenticated; verified active choices |
| POST | `/driver/vehicle-brands/requests`, `/driver/vehicle-models/requests` | Authenticated driver profile; forced REQUESTED |
| GET, POST | `/admin/partner-program/requirement-categories` | Admin directory/create |
| PATCH | `/admin/partner-program/requirement-categories/:id` | Admin update |
| GET, POST | `/admin/partner-program/requirements` | Admin directory/create |
| PATCH | `/admin/partner-program/requirements/:id` | Admin update |
| GET | `/partner-program/requirements` | Authenticated; active grouped definitions |

Prisma migration `0005_admin_workspace` adds five tables, two enums and nullable login timestamps. Migration `0006_login_history` performs the login backfill. Both were deployed to the configured shared database. Prisma CLI now also uses the existing connection URL helper's default 15-second connect timeout, preserving explicit settings. Other deployment databases must run `npm run prisma:deploy` and regenerate the V2 client before starting this code.

The route manifest contains **98** method/path combinations across **16** feature modules, without duplicate method/path combinations. New routes preserve authentication/admin guards; public configuration routes still require authentication.

## Checks and limits

| Check | Result |
| --- | --- |
| Admin TypeScript and Vite production build | Passed |
| Admin full package formatting | Passed |
| API V2 TypeScript check | Passed |
| API V2 Nest production build | Passed after fixing the audit actor type narrowing |
| API V2 full package formatting | Passed |
| Prisma schema validation | Passed |
| Prisma migration deployment/status | 0005/0006 applied; all 6 migrations up to date |
| Compiled route metadata inventory | 98 routes, 87 AuthGuard routes, no duplicate method/path pairs |
| Git whitespace check (admin, V2 and context) | Passed |

Checks used for this feature are TypeScript compilation, production builds, Prisma validation/migration status and source formatting. No automated tests, browser flows, real Google sign-in, Cloudinary uploads or driver proposals were run for this feature request. Earlier test results in historical review documents predate this expansion.

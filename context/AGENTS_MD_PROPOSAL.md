# Proposed root AGENTS.md for Lif / 1More

Status: **adopted**, 30 October 2026. Following user approval, the reviewed instructions were copied to the repository root [AGENTS.md](../AGENTS.md). That root file is now the authoritative instruction source; this document retains the proposal and review notes for reference.

The conventional filename is **`AGENTS.md`**, with an S. Codex discovers repository instructions using that name; `AGENT.md` would require custom fallback configuration. Keep durable rules here and detailed specifications in `context/`, so every small task does not load the entire project history. [Official OpenAI documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

The material between the following two markers records the approved content initially installed in `lif/AGENTS.md`. Make future instruction changes in the root file.

<!-- BEGIN PROPOSED AGENTS.md -->

# Lif / 1More repository instructions

## Project and scope

This repository contains the 1More ride platform: one Flutter application with rider and driver modes, a React admin workspace, and a NestJS API. The Git repository is called Lif; user-facing branding is 1More / 1More Admin.

| Directory | Purpose | Default treatment |
| --- | --- | --- |
| `apps/user/v1` | Flutter rider and driver application | Active development; retain one role-based binary. |
| `apps/admin/v1` | Vite, React, TypeScript and Tailwind admin | Active development; reuse its common components and design system. |
| `apps/api/v2` | NestJS, TypeScript, Prisma and PostgreSQL backend | The only backend to change by default. |
| `apps/api/v1` | Legacy Express backend | Read-only reference; change only when the user separately requests it. |
| `context` | Designs, decisions, implementation trackers and investigations | Read documents relevant to the task and update affected behavior records. |

Treat explicit current user instructions as the scope of the task. Plans describe intent; inspect running code and tests before claiming an item is implemented. Preserve unrelated user changes, existing data and account identities.

## Working approach

- Investigate the actual failing path, then implement the complete affected flow across clients, API, validation, storage and feedback. Do not stop after hiding an error or changing a label.
- Inspect Git status, nearby code and applicable context before editing. Search with `rg`; use the existing implementation as the starting point.
- For substantial features, maintain a task checklist in the relevant `context/` plan. Mark a task complete only when its behavior and appropriate verification are complete. Keep device/provider-dependent work explicitly outstanding.
- Resolve ordinary implementation choices independently. Ask only for missing product decisions, credentials or approval that genuinely blocks the authorized work. Continue independent work while awaiting an answer.
- When investigating crashes, distinguish a native process crash, a Flutter exception, a failed API request and an authentication redirect. Capture useful evidence; do not describe an unobserved cause as proven.
- Keep fixes focused. Do not perform unrelated rewrites, dependency upgrades, formatting sweeps or broad renames during a bug fix.
- Report the outcome, verification and remaining limitations plainly. Do not claim that analysis proves a real-device workflow works, or that a push proves deployment succeeded.

## Design rules

### Admin workspace

Read `context/WEB_DESIGN.md` before UI work. The admin design comes from the Gym reference, adapted to this workspace: amber brand, Space Grotesk, pale gray canvas, white bordered panels, restrained shadows and consistent spacing. Preserve the existing 1More logo and branding.

- Reuse components under `apps/admin/v1/src/components`, especially `CatalogPanel`, `PanelNote`, `ActionMenu`, `Skeleton`, `Dialog`, shared fields, badges, vehicle identities and trip review components. Extend a shared component when several pages need the same behavior.
- Use matching page widths, section spacing, header sizes, field heights and compact metadata. Avoid oversized cards, tiny secondary text, duplicate headers and uncontrolled nested scrolling.
- Use skeletons matching the destination layout for loading. Keep loaded data visible during refresh of the same query; do not show previous-filter data as if it matches a new query. Busy controls must retain their size.
- Put entity actions in the shared menu. Keep primary form submission and important review decisions explicit where the existing design does so.
- Show actual names and useful context; keep raw IDs as supporting references. Vehicles use the common circular logo/avatar with appropriate fallback, registration, category and status.
- Use inline attachment previews and separate explicit downloads. Retain safe rich-document rendering and private-asset authorization.
- Cover keyboard focus, labels, disabled/busy states, error/retry/empty states, small viewports and reduced motion.

### Flutter application

Reuse `lib/core/theme.dart`, `lib/core/color.dart` and nearby shared widgets. The mobile visual language uses its existing green/Outfit theme; do not copy the admin amber theme into mobile.

- Preserve rider/driver routing, account-scoped preferences, session restoration and active-trip recovery.
- Reuse upload/capture components, permission handling and progress/error feedback. Keep camera-only live selfie behavior where required.
- Preserve map attribution, coordinate-anchored markers, consistent marker sizes and existing route/gesture behavior. Keep MapLibre; do not introduce a paid map dependency without an explicit decision.
- Handle safe areas, keyboards, text scaling and variable screen heights without layout overflows.

## Architecture and contracts

- Preserve module structure and naming conventions in the area being changed. Admin features belong in `src/modules`; API features use Nest modules/controllers/services/repositories; Flutter features use the existing pages/models/repositories pattern.
- Keep transport concerns, business rules and persistence separated. Validate untrusted input on the server even when the client validates it.
- Reuse centralized admin API/session code and Flutter Dio/token refresh code. Handle transient failures separately from expired or revoked sessions; do not log out a valid shared session because a request timed out.
- Keep API V2 routes, response envelopes, error codes and `route-manifest.json` consistent. Preserve existing compatibility routes unless the user requests their removal.
- Treat IDs as opaque values using existing ID validation helpers. Do not coerce them through lossy numeric conversions. Handle case-insensitive matching deliberately for emails, catalog names and CSV dependencies while preserving display text.
- Return paginated, bounded lists; counts endpoints return counts rather than loading complete records. Use database counts/aggregations for totals.
- Avoid duplicate polling, hidden-tab requests and serial optional work on critical loading paths. Do not introduce caching that bypasses current account/role/ownership checks or serves another user's data.

## Business invariants to preserve

Read the specific implementation document before changing one of these flows. Explicit new product decisions can replace these defaults; update code, tests and documentation together.

- **Fare policy:** configured per actual vehicle category/subcategory, including newly added categories. Physical vehicle families and parent categories do not supply inherited prices. Preserve quote expiry, policy snapshots and server-calculated fares.
- **Payments:** cash/direct UPI to the driver, recorded receipt confirmation, currently zero commission/platform fee. Opening a UPI app is not proof of payment. Reviewed cancellation/no-show obligations remain separate from later rides and other drivers' collections.
- **Trip start:** rider confirmation and per-trip code both apply; partner activation codes are a separate mechanism. Availability, GPS freshness, verified arrival and trip transitions remain server-enforced. Active-trip offers are view-only until queuing is explicitly designed.
- **Partner onboarding:** dynamic details/documents, per-field review/rejection reasons, policy and confirmation snapshots, final PDF, then first-login one-time driver activation. Activation codes have no time expiry by the accepted requirement and do not become a requirement for every subsequent login.
- **Vehicles:** activated drivers must satisfy vehicle registration/verification gates. Support several vehicles, requested brands/models, front/back images and the required vehicle documents. Do not bypass field reviews because an application is approved.
- **Deletion:** ordinary user removal deactivates and retains history. Partner application deletion is allowed only before driver activation, with a scoped deletion preview, revision/identity confirmation and audit. Preserve the user, vehicles and ride history. Never broaden a cascade without checking every relation.
- **Audit:** preserve verified administrator actions and browsing, readable action titles, request context, correct actor identity and seven-day retention. Do not turn rider/driver requests into administrator activity unless the actor actually has verified admin access. Keep cleanup bounded and separate from business-data deletion.
- **Email/media:** use the existing SMTP and retry/delivery mechanisms. Manual WhatsApp sharing uses the established web/share flow; do not add WhatsApp Cloud API. Images go through centralized API WebP conversion before cloud upload. Preview local selections without uploading until the intended submission step; preserve private-document controls.

## Data, secrets and external effects

- Do not commit or print `.env` contents, access/refresh tokens, SMTP/Cloudinary secrets, private documents, signing passwords, `key.properties` or keystores. `.env.example` contains placeholders and documentation only. Mobile bundled environment values are public client configuration, never server secrets.
- Use existing schema/migration conventions. Inspect generated SQL for destructive operations. Do not run `prisma migrate reset`, destructive seeds or `db push --accept-data-loss` against shared data as a verification shortcut.
- Keep multi-record changes and the required business audit atomic. Preserve lifecycle/lock ordering and version checks. Do not retry an entered write transaction or an ambiguous commit in a way that can duplicate side effects.
- Use isolated fixtures for tests. Do not delete users, grant admin privileges or send real notifications just to check a code change. When cleanup is requested, identify exact fixtures and preserve real accounts.
- Keep private assets private, preserve ownership checks, sanitize document HTML, and avoid embedding user-supplied URLs in unsafe contexts.
- Keep machine-specific SDK/JDK paths in local configuration. Do not edit a global package cache or SDK source to fix the project; use a maintained compatible dependency/configuration change.
- Fix local Java selection before considering Android toolchain changes. Do not change Gradle, AGP, Kotlin, package versions or add wrapper checksum changes merely to silence unrelated warnings. Coordinate intentional toolchain migrations separately; preserve other projects' and teammates' existing setups.

## Verification commands

Use the package's own scripts and lockfiles. Run relevant checks for the changed area, with focused regressions for meaningful failures. Do not run checks for unaffected applications automatically.

| Area | Working directory | Checks |
| --- | --- | --- |
| Flutter | `apps/user/v1` | `flutter analyze`; relevant `flutter test` targets, or the suite when shared flows change. Run `flutter pub get` after dependency changes. |
| Admin | `apps/admin/v1` | `npm run build`; `npm run format:check`; relevant `npm run test:e2e -- ...` Playwright tests. Broaden for shared UI/session changes. |
| API | `apps/api/v2` | `npm run build:compile`; `npm run test:unit`; `npm run format:check`. Validate/regenerate Prisma when its schema changes. |
| Working tree | repository root | `git diff --check`; inspect intended changes and ignored sensitive/generated files before committing. |

- **Do not build an APK for ordinary analysis or routine bug checks.** For Android build configuration/native failures, use targeted Gradle configuration/compilation tasks. Build release artifacts only when the task calls for them.
- **API `npm run build` changes the database:** it runs Prisma generation, migration deployment and schema push. Use `build:compile` for code-only verification. Database-backed integration tests must target an explicitly verified isolated test database or their documented isolated tables.
- Run API `test:unit` and `build:compile` sequentially: both generate a shared dependency file and can race on Windows.
- Preserve deliberate dependency constraints, notably the documented `html` compatibility pin. A newer-version notice is not evidence that a package must be upgraded.
- For native changes, report which targeted tasks passed and which device/release checks remain. Do not hide warnings with validation-skip flags.

## Git, release and deployment

- Commit/push when requested. Include intended source, tests, migrations and documentation; exclude local secrets, logs, generated builds and test artifacts. Check the complete diff and final status.
- Preserve existing branch history and unrelated work. Do not force-push, hard-reset or discard changes to make a push easier. After pushing, report the commit and branch and verify the remote head.
- A version/build bump happens when requested or required by an authorized new base release. Read `pubspec.yaml` instead of relying on version numbers from old documents.
- Use the registered Shorebird app and existing signing identity; never reinitialize or replace them. Follow `apps/user/v1/README.md` for release/patch commands and the installed base's exact Flutter/build settings.
- Native code, plugins, Gradle, permissions or bundled asset changes require a new base release; do not force an incompatible Dart patch. Publishing a Shorebird release does not distribute/install its APK or publish to Google Play.
- Keep Vercel roots and rewrites in `apps/api/v2/vercel.json` and `apps/admin/v1/vercel.json` aligned. Preserve same-origin admin API/cookie behavior. Deployment secrets belong in the hosting environment; a repository `.env` file must not be required in production.

## Context to consult when relevant

| Change | Starting documents |
| --- | --- |
| Admin UI | `context/WEB_DESIGN.md`, `context/ADMIN_SKELETON_AND_AUDIT_VISIBILITY_FIX.md`, `context/ADMIN_RIDE_VEHICLE_UI_REWORK.md` |
| Rider/driver screens | `context/USER_DRIVER_SCREEN_CATALOG.md`, relevant `PHASE_*_IMPLEMENTATION.md` |
| Onboarding/submission | `context/PARTNER_ONBOARDING_IMPLEMENTATION.md`, `context/PARTNER_APPLICATION_SUBMISSION_FIX.md` |
| Vehicle verification | `context/VEHICLE_VERIFICATION_PLAN.md` |
| Fare calculation | `context/CATEGORY_FARE_POLICY_IMPLEMENTATION.md` |
| Sessions/audit/deletion | `context/ADMIN_SESSION_RECOVERY_FIX.md`, `context/ADMIN_AUDIT_RELIABILITY.md`, `context/ADMIN_ENTITY_ACTIONS_AND_AUDIT_RETENTION.md` |
| Loading/database | `context/LOADING_PERFORMANCE_AUDIT_AND_PLAN.md`, `context/DATABASE_POOL_AUTH_FIX.md` |
| Deployment/release | `context/VERCEL_DEPLOYMENT.md`, each application's README |

Use these as navigational references. Code, verified current behavior and explicit current user decisions resolve stale documentation; repair affected documentation rather than repeating an old claim.

<!-- END PROPOSED AGENTS.md -->

## Points for our review

1. **Scope:** This draft keeps all shared rules in one root file. We can later move platform-specific details into `apps/admin/v1/AGENTS.md`, `apps/api/v2/AGENTS.md` and `apps/user/v1/AGENTS.md` if the root becomes too long.
2. **Release behavior:** The default is no automatic push, version bump or Shorebird publication without the task calling for it. Existing authorization within an active task still applies.
3. **Business rules:** The important accepted decisions are included as guardrails, with links for the full flows. They should change when you change the business rules, rather than becoming permanent product restrictions.
4. **Verification:** The draft explicitly distinguishes safe compilation from the API deployment build that applies database changes, and routine Flutter analysis from an APK release.
5. **Avoiding drift:** Review the instructions when the architecture or release process changes. Do not add temporary debug notes, credentials, changing test counts or every historical bug to the active file.

The root `AGENTS.md` is now installed. Start a fresh Codex session and ask it to summarize the instruction files it loaded to verify automatic discovery. Keep future instruction updates in the root file rather than maintaining two active copies.

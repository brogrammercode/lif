# My Rides and contextual form guidance

31 October 2026. Flutter rider application; use the Settings material from the app-local and canonical `MOBILE_DESIGN.md` guides. The supplied reference informs content placement, not invented trip data or a new palette.

## Tasks

- [x] Restyle rider history filters, cards, pagination and refresh/loading/error/empty states with shared glass controls and matching skeletons.
- [x] Arrange trip details around a route/date header, pickup/drop-off timeline, driver/vehicle and recorded/quoted metrics, rating and cost details.
- [x] Preserve ownership checks, active-trip route/location freshness, start/payment/review/support/rebooking and startup recovery behavior.
- [x] Retain MapLibre attribution and actual coordinates/geometry; do not fabricate map activity or fares/taxes/discounts from the mockup.
- [x] Keep Partner Program field descriptions contextual to focus/editing; leave validation errors and review/rejection feedback visible.
- [x] Preserve vertical uploads, draft restoration, camera provenance and deferred sequential submission.
- [x] Verify initial and retained-data refresh, filter/page boundaries, completed/active trip details, focus-only guidance and responsive/accessible layouts.
- [x] Update design guides and run Flutter analysis/tests and Git whitespace checks. Device map/keyboard/camera checks remain explicit.

## Implementation

- `ride_glass.dart` supplies the shared history cards, semantic status badges, endpoint timeline, compact facts, server fare/collection presentation and layout-specific skeletons.
- History retains All/Active/Past, pagination, exact ride-reference navigation and last loaded rows during refresh. Errors and refresh feedback scroll with the list so they do not crowd out the viewport. A different filter/page clears the previous rows.
- Finished-trip details show stored route coordinates/booking geometry and date, endpoints/timestamps, actual driver/vehicle, rating and recorded metrics (or explicitly quoted metrics when unavailable). Missing coordinates have an explicit preview-unavailable state. Historical maps never render live driver locations.
- Active trips retain the existing map, recenter, GPS/route freshness, matching/waiting, combined start proof, payment, review and safety workflows. Settled completed trips use the compact collection summary instead of a duplicate status-only action panel; unresolved collection/review controls remain.
- Receipt, cancellation, rating and pickup-confirmation surfaces use shared glass material. Receipt opening is serialized and exposes a stable busy state while re-reading the trip. Rebooking and recovered-trip return-home actions remain available.
- `FocusFieldHint` shows optional supporting guidance only while an editable field has descendant focus. Labels, values, required markers, validation errors and per-field decisions/rejection reasons stay visible. File limits/formats remain available in the file-review sheet and during focused editing. Postal attribution remains visible.

## Initial styling verification

- `flutter analyze`: no issues.
- Full Flutter suite: **133 tests passed**, including seven new history/navigation/detail/layout and contextual-guidance checks.
- Existing rider/driver isolation, active matching/route freshness, retained refresh, payment/receipt, recovered-trip, file-upload/draft/camera provenance and protected-submission regressions pass.
- New fixtures cover retained history refresh and failures, filter/page isolation, exact ride IDs, stored map metadata, actual vehicle/rating/duration, server fare/zero-fee presentation, receipt open/close, 200% text size and small landscape/skeleton layouts. Focus tests verify hidden-at-rest guidance, focus/blur behavior and always-visible validation/rejection feedback.
- Rendered header/facts/cost previews with Outfit and icon fonts were inspected under ignored `apps/user/v1/build/ui-review`. Map surfaces in those automated previews are labelled test substitutes; they do not verify native MapLibre rendering.
- Dart formatting and Git whitespace checks pass. The initial styling pass did not change backend contracts. The content follow-up below extends API V2 history. Native files, dependency versions, release metadata and production data remain unchanged. No APK build was needed.

## Device acceptance

- [ ] Inspect the real stored-route map, pins, attribution and live map controls on a target phone.
- [ ] Exercise keyboard/focus transitions, native camera/file pickers, draft reopening and submission with the real configured application.
- [ ] Run a paired rider/driver trip through arrival/start, collection, receipt, review and recovery to confirm native rendering and external intents.

## Content mapping follow-up — reference folder `Downloads/my_rides`

Reviewed all three supplied screens: history, unfulfilled fare details and trip safety/help. Keep the accepted glass material and no-bottom-navigation rule. Reuse their information hierarchy, but bind every amount, count, status, identity, contact and event to actual app records.

- [x] Enrich bounded rider history with selected category, route metrics, actual driver/vehicle, collection and cancellation review context.
- [x] Add server-side text/category/month and outcome filters with database-aggregated counts, preserving rider isolation and existing All/Active/Past compatibility.
- [x] Map cards to trip reference/date/status, endpoints/metrics, driver/vehicle and paid/pending/no-charge states, with contextual details/retry/receipt/help actions.
- [x] Separate quoted fare, final ride fare, recorded collection/refund and cancellation/no-show review obligations. Never label an unfulfilled quote as charged, refunded or an amount due without evidence.
- [x] Replace generic terminal facts with outcome-specific assignment, coordinates/route estimates and recorded activity.
- [x] Structure the safety sheet around the actual trip/account, configured contacts and existing manual sharing/support actions. No invented service-level promises or encrypted/live-share claims.
- [x] Verify API V2 filters/projections, money/outcome mapping, card actions, responsive layouts and existing recovery/payment/application regressions; update guides.

The references' sample base tariffs, tax rates, payment authorizations, offer counts, response-time badges, invoice PDF downloads and bottom navigation are not existing product contracts and will not be represented as real features. Current cash/direct-UPI and per-category quote snapshots remain authoritative. Month filtering uses India time (IST), with that boundary documented in the UI.

### Content and API mapping

| Reference area | Actual application content |
| --- | --- |
| History and filters | All/Active/Past and Completed/Cancelled/Unfulfilled; pickup/destination/reference search; category and month/year; bounded pagination and database status counts across the matching history. |
| Card identity | `TRP-` plus the original opaque ID, actual timestamp, selected category snapshot/image, actual driver name/avatar/rating only when recorded, vehicle make/model/registration and actual-or-estimated route metrics. |
| Outcome and cost | Actual status and cancellation reason, recorded search duration when timestamps exist, selected quote components, final fare, recorded collection/full-refund state and separate cancellation/no-show/unpaid review amounts. Partial refunds do not invent a remaining net amount. |
| Actions | Tap for owned trip details; completed receipt intent re-reads and validates the trip; Retry/Book again opens Home with the original coordinates and requires fresh routing/quotes. Failed receipt refresh retains the trip and retry feedback without opening a stale receipt. |
| Safety and activity | Current account and trip endpoints, configured support contacts/hours, static summary copy/manual WhatsApp, existing emergency-contact management and idempotent trip support. Activity shows only recorded events; call requested does not mean a connected call. |

`GET /api/v2/me/rides` retains its route and envelope. It validates bounded pagination, outcome, trimmed search, opaque category ID and `YYYY-MM`. Rider ownership is part of every list/count/group query; unbooked drafts are excluded. Selected quote relations and public driver/vehicle selectors keep other quotes and private driver data out of history. Rows, matching total and status aggregation share a read snapshot. Category choices load only when filters open. Query changes invalidate older reads; same-query refresh keeps the current rows.

Deploy API V2 before distributing this mobile change. No Prisma schema migration is required. The existing All/Active/Past query remains compatible. No API V1, Android/iOS tooling, dependencies, version/build, signing or production data changes are part of this follow-up.

### Follow-up verification

The subsequent [saved-place/glass-filter rework](SAVED_PLACES_GLASS_REWORK.md) replaces My Rides' native Chip controls with `LiquidGlassChip` for the status tabs and Date/category/removable filters. It retains the counts, query invalidation, clear actions and navigation contracts. That later pass records the current full-suite verification.

- Full Flutter suite: **143 passed**. Covers the ten added mapping/filter/action/receipt/support checks and the existing upload, protected application submission, vehicle gate, role/session, payment, active-trip and recovery regressions.
- Flutter analyzer: no issues. Dart formatting and Git whitespace checks pass.
- API V2: **221 unit tests passed**; `build:compile` and `format:check` passed. Filter/projection tests use mocked Prisma clients; no shared database changes or real notifications.
- New tests cover database status counts, opaque IDs, rider scope, selected quote relations, IST month boundaries, rejected malformed queries, no quoted-as-collected money, legacy provider collection, partial/full refunds, debounced search and stale reads, exact rebooking/receipt intents, failed receipt verification, actual unfulfilled events and configured static support content.
- Phone-size previews of history, unfulfilled detail, cost and safety content were inspected under ignored `build/ui-review`. Responsive checks include narrow screens, 200% text, scrolling and stable layout-specific skeletons. Automated map previews are labeled substitutes; native MapLibre and external sharing/contact intents still require the device acceptance checks above.
- Both mobile design guides and the app README record the new content and API rollout requirements. No APK build, release or push was performed for this task.

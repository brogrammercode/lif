# Phase C: rider matching and active trip

Started 24 October 2026. Builds on Phase A/B and both audit passes. Backend changes are API V2 only. No APK build or deployment is part of implementation checks.

## Accepted scope

Retain the existing Flutter design, Home map/pins and three-second search/map-settle behavior. Server fare and trip/payment state remain authoritative. Cash and direct driver UPI, combined rider confirmation/trip OTP, foreground polling and manual support/sharing use the already accepted rules.

No scheduling, destination changes during a trip, automatic category expansion, masked-calling provider, fabricated pickup ETA/driver counts, public live-share URL, automatic fee collection or invented operating polygon. Document unavailable services honestly.

## Tasks and completion tracker

- [x] C1: Extend the public trip snapshot with the selected quote, route, driver/vehicle, timestamped active location, history/ratings and cancellation policy; rider-scoped remaining-route ETA; paginated active/past history.
- [x] C2: Preserve Home selection rules; repair saved-address stale selection/search lifecycle; booking review with addresses/category/seats/fare policy, quote expiry, optional pickup note, stable retries and uncertain-result reconciliation.
- [x] C3: Rider trip page for searching/assigned/arrived/in-progress/final states; one snapshot, visible refresh/error/freshness state, timed polling/resume recovery, real driver/vehicle and route information.
- [x] C4: Pair OTP/start confirmation with the existing driver flow; structured cancellation reasons and reviewed-fee preview; no-driver/cancelled/rebooking outcomes that obtain fresh quotes.
- [x] C5: Completion, collection/refund/waiver states, readable receipt, rating/comment, event timeline and trip-linked support.
- [x] C6: Active/past paginated ride history, active-trip re-entry, relevant notification targets and safe fresh-quote rebooking.
- [x] C7: Minimum safety: configured contacts, contact management, trip-linked issue and explicit manual WhatsApp/copy sharing of a static trip summary. No false emergency-dispatch or live tracking claim.
- [x] C8: API/mobile regressions, API/admin builds, Prisma validation, formatting and Flutter analysis/tests. Update catalog, route inventory and release notes with actual results and device limits.

## Verification and release

Tests must cover role/ownership, private location disclosure, current route origin/freshness, history pagination/filtering, quote expiry/retry, stale selected address, rider start/payment controls, refresh/recovery and cancellation/final outcomes. Physical MapLibre, phone/WhatsApp/UPI intents and paired device testing remain release acceptance checks on the new native base required by Phase B.

## Implemented screens and behavior

| Surface | Display and actions | Recovery and restrictions |
| --- | --- | --- |
| Home / place picker | Existing map/pin positions and three-second settle/search; saved locations; visible Resume active trip control | Manual rebooking pickup survives device location refresh. Serialized travel-context checks prevent overlapping booking sheets. Existing role/active-trip server locks remain authoritative. |
| Saved-place editor | Label, type and provider search results; three-second debounce; results after keyboard dismissal | Editing address clears old coordinates; obsolete requests cannot overwrite newer text. Saving requires selecting a result. |
| Booking review sheet | Pickup/drop-off, category/seats, trip distance/duration, distance fare, zero commission/platform fee, cash/direct UPI policy, expiry and optional pickup instructions | No fabricated pickup ETA. Freeze request after first submission, retain one idempotency key and reconcile the exact draft after a lost response. Expired quotes require fresh options. |
| Searching / no match | Matching status and elapsed time, server search radius, addresses/category/fare; cancellation and help | Only server status ends searching. No invented available-driver count. No-driver outcome explains no collection and offers fresh-quote rebooking. |
| Assigned / approaching | Map with pickup/drop-off/driver markers, actual driver photo/name, vehicle/plate and remaining pickup route estimate | Route uses server GPS. Last-known location is labelled, route-provider failures remain explicit, expired estimates disappear. Recenter includes both endpoints and driver. |
| Arrived | Free waiting clock, rider trip code, separate pickup/driver confirmation and both proof states | Check vehicle/driver before sharing code; expiry/lock refresh remains server controlled. Driver verification and rider confirmation are both required. |
| In progress | Drop-off route estimate, driver location, route map, Call/Chat/Help | Navigation target switches only after server start. No rider cancellation or destination edit after start. Polling/resume retain last confirmed data on failure. |
| Completed | Fixed final fare, pending/received/waived/refunded/provider-managed collection, driver cash/UPI actions, receipt and rating | Rider cannot mark payment received. Re-read payment before UPI launch; resolved receipt prevents another payment intent. Rating retry is idempotent; altered repeat rating conflicts. |
| Receipt | Trip/vehicle/category, addresses, completed time, measured distance/duration when available or explicitly quoted values, zero fees, final fare and separate collection status | Copy readable summary; waived fare is explicitly not payable. No generated tax invoice/PDF claim. Timestamp identifies last check. |
| Cancellation / review | Structured reason, optional details, free deadline, capped potential fee and separate review/dispute/payment status | No immediate deduction, no double cancellation/no-show charge, no next-driver collection. Safety/late/refusal exemptions require admin review. |
| History / detail | Active/Past/All, paginated rider-only rows with date/fare/payment state, current detail and activity timeline | Excludes drafts and driver work; startup, Home and already-read notifications can reopen owned trips. Rebook sends endpoints to Home for a new quote. |
| Safety / support | Configured operator contacts, emergency contact management, trip-linked issue form, existing support inbox, manual WhatsApp or clipboard summary | Static summary only; no public live tracking or emergency dispatch claim. Support retry keeps the same idempotency key and frozen payload. |

## API contract and compatibility

- GET /trips/:id/context supplies one consistent public trip, selected quote, route, driver/vehicle, start controls, collection and review snapshot. Live driver GPS is disclosed only to that ride's rider during an active assignment; old history has no live GPS.
- GET /trips/:id/rider-route validates rider ownership, active assignment and fresh/accurate GPS before calling OSRM from the stored driver point toward pickup/drop-off. Drivers and unrelated accounts cannot use it for rider tracking.
- GET /me/rides accepts section=all|active|past, page and page_size (maximum 100). Rows/counts share a Repeatable Read snapshot and the authenticated rider predicate.
- Booking accepts optional rider_note (maximum 500); issue reports accept an optional enumerated reason_code. Repeated identical ratings reuse the saved review.
- Legacy non-null pickup_eta_s is zero (unknown) in newly generated quotes. Actual pickup estimates are obtained after assignment; mobile never displays zero as a zero-minute promise.
- Route manifest: 165 route definitions, checked against compiled Nest security metadata. Mobile still has 21 named routes: the new rider surfaces share the existing ride-detail route or sheets/dialogs.
- No new dependencies or schema migration for Phase C. Existing Phase A/B migrations remain required. Deploy matching API V2 before releasing the mobile client; an old context response without trip is rejected with a recoverable message.

## Acceptance still required on devices

Use the new Phase B native base, not a patch of the old base with different location permissions. Run a real paired-device trip: quote/review, matching, assignment, GPS arrival, both start proofs, live drop-off progress, completion, real cash/UPI receipt, rating and support. Repeat with process restart, permissions denied, background/resume, network loss, expired quote/code, provider failure, cancellation/no-match and admin-reviewed fee/waiver. Confirm real map attribution/markers and phone/chat/WhatsApp/UPI handlers on supported devices.

Scheduling, voice/traffic navigation, destination changes, masked calling, queued rides, public live tracking, automatic emergency dispatch/fee collection, payout ledger and exact operating polygon remain outside this phase.

## Verification results - 24 October 2026

- API V2: 135/135 unit and HTTP tests passed, including compiled route/security-manifest parity (165 route definitions), server-GPS route origin/target, rider role/ownership/freshness, historical GPS privacy, scoped history pagination and rating retry conflict protection.
- API V2 Nest compile passed using npm run build:compile; Prisma schema validation and Prettier checks passed. Build verification deliberately did not run prisma db push or mutate deployment data.
- Flutter: 52/52 tests passed; flutter analyze reports no issues. New regressions cover expired quotes, lost-response reconciliation, immutable booking retries, stale address coordinates/debounce, server-authoritative matching, retained trip on failed refresh, rider/driver isolation, local GPS age, UPI receipt race, reviewed cancellation preview, waived receipt, read-notification navigation and history filters. Existing start-proof/payment/recovery tests remain passing.
- Admin: production TypeScript/Vite build passed; 35/35 Chromium browser tests passed against intercepted API fixtures.
- Whitespace diff check passed; no new mobile dependency, APK build, Shorebird release, deployment, commit or push was performed in this phase. Existing API V1 workspace deletions were left untouched.

Automated checks use isolated fixtures/mocks for persistence, route providers and browser requests. They do not certify live database transactions or physical map/intent/background behavior; the acceptance list above remains a release gate.

## Follow-up audit

See [Phase C audit](PHASE_C_AUDIT.md) for corrected booking/route/freshness/recovery races and the current verification totals: 137 API tests and 58 Flutter tests, with clean analysis and passing API compile/schema/format checks.

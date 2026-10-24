# Phase B: first operational driver trip

Started 24 October 2026. Continues the uncommitted Phase A workspace. API V2 only.

Follow-up: [Phase A/B audit findings and verification](PHASE_AB_AUDIT.md) records the later matching, payment, privacy, lifecycle and response-validation fixes. Its final check results supersede the initial counts below.

## Confirmed rules

- One app and map-first driver mode; eligibility/vehicle gates remain mandatory.
- Search expands while no driver accepts; offers expire and acceptance is atomic.
- Active drivers may view offers but cannot accept/queue another ride.
- The user confirmed the original arrival option: 150 metres and a location fix no older than 60 seconds. Keep both editable in Fare Policy. Matching distance is a separate setting.
- Trip start requires rider confirmation and a six-digit trip OTP, separate from partner activation. The two proofs must belong to the current assignment.
- In-app MapLibre navigation uses routing steps, progress and rerouting; no external navigation launch.
- Cash/direct-to-driver UPI after completion; server fare is immutable, commission zero. A rider payment-link tap never marks a ride paid. Assigned driver confirms receipt.
- No masked-call provider. Ordinary calls and trip-scoped text chat are available channels.
- Cancellation/no-show fees require review, GPS arrival/wait/contact evidence and one charge at most. Approved fees belong to the affected driver; no next-driver collection.
- No fabricated service polygon, payout account, fare prices or contact numbers. Scheduling/rejoining/document expansion remain their separately tracked work.

## Work tracker

- [x] B1: Persist start challenges, messages, receipt evidence and reviewed trip issues; additive migration.
- [x] B2: Driver readiness, fresh location, progressive matching, expiring/view-only offers and concurrent acceptance protection.
- [x] B3: GPS arrival notification/waiting; combined start proofs, expiry, attempt limits, idempotent retries and legacy endpoint migration.
- [x] B4: Driver map home, availability, offer actions, trip restoration and location lifecycle.
- [x] B5: In-app pickup/destination navigation, maneuver progress and rerouting.
- [x] B6: Trip-scoped contact/chat and rider OTP/confirmation controls.
- [x] B7: Authoritative completion, cash/UPI receipt confirmation, unpaid issue reporting and truthful outcome/availability.
- [x] B8: Cancellation/no-show/dispute evidence and admin review/waive/settlement UI.
- [x] B9: Regression coverage, API/admin builds, Prisma validation and Flutter analysis; no APK build.
- [x] B10: Route inventory, screen catalog, deployment/native-permission notes and operator setup.

## Implementation notes

- Routing is server-scoped to the assigned trip. [OSRM route steps](https://project-osrm.org/docs/v5.22.0/api/) supply maneuvers and leg geometry; pickup and destination routes are recomputed on deviation.
- Android tracking uses the existing [geolocator foreground notification](https://pub.dev/documentation/geolocator/latest/geolocator/AndroidSettings-class.html) while online/on a trip. New manifest/background settings require a new base APK; this work is not a Dart-only Shorebird patch. Process death and platform restrictions must remain visible through location freshness checks and restart restoration.
- Poll-based matching/chat/status runs within normal API invocations, suitable for the existing Vercel deployment; no unhosted in-memory worker/socket dependency.
- Matching starts at 1 km, doubles every 30 seconds to at most 10 km, stops after 180 seconds and gives each offer 45 seconds. All are editable admin settings; these defaults do not define a service boundary or fare.
- The configured database has migration `0011_operational_driver_trip` applied; Prisma Client was regenerated. The migration is additive. No customer accounts, prices or contact values were seeded. API V1 was not edited by this work.
- API inventory is 21 feature modules and 163 method/path combinations; Flutter has 21 named routes. Existing arrival/start/complete endpoints now invoke the new lifecycle. The rider detail poll also drives search progression independently of lazy action-panel mounting.

## Validation completed on 24 October 2026

| Check | Result |
| --- | --- |
| API V2 TypeScript check and Nest compilation | Passed (`type-check`, `build:compile`; no local build-time schema push) |
| Prisma schema validation | Passed; migration 0011 applied |
| API unit/HTTP regression suite | 117 passed |
| Admin TypeScript/Vite production build and formatting | Passed |
| Admin Chromium suite | 31 passed with one worker |
| Flutter tests | 34 passed with concurrency 1 |
| Flutter analyzer | No issues |
| API formatting | Passed |

Coverage includes both start-proof orders, assignment binding, expiry/attempt locking, fresh GPS/radius checks, idempotent completion, immutable fare, private trip access, pending UPI versus driver receipt, waiver protection, unpaid-debt closure, admin approval/version/settlement rules, OSRM steps compatibility, navigation progress/deviation, rider/driver controls and restored-trip navigation. The first concurrent UI run encountered editor-loading and a two-second network-test timeout under load; serial reruns passed. The restored-trip test also identified a missing return-home action, which was restored before the final passing run.

No physical trip, APK build, release, push, live payment, customer fixture or email/message delivery was performed for this phase. Automated tests use mocked services; they do not substitute for native-device or deployed multi-client checks.

## Operator setup and release acceptance

1. Deploy API V2 with migrations 0010/0011 applied and the existing persistent signing secret. Deploy the admin changes. Other environments require `npm run prisma:deploy` first.
2. Configure real fares for all three groups, operational radius/timing and Support contacts. For direct UPI, approve exactly one valid UPI application field for each participating driver. No UPI destination is invented or taken from the rider's saved payment methods.
3. Publish a new signed native base APK/iOS build after the deliberate release checks. Android foreground location/notification/wake-lock permissions and iOS background location configuration make this incompatible with a Dart-only patch to the old base.
4. On paired rider/driver devices, verify go-online, expanding offers/expiry/concurrent accept, pickup navigation, arrival boundaries, both proof orders, wrong/expired code, active GPS, view-only offers, completion, real cash/direct-UPI receipt and automatic eligible availability.
5. Repeat with app resume/process restart, revoked location, stale/poor GPS, lost connectivity, routing failure, changed vehicle eligibility, suspended/exited driver, and cash/UPI app availability. Verify native map markers, camera framing, foreground notification and OS background restrictions.
6. In admin, check late-cancellation/free-period/no-show evidence, exemptions/disputes, stale review versions, waivers and verified original-driver settlement. Charge payment links remain pending until manual verification; the next driver never collects them.

## Explicit boundaries

- Offers, messages and status use foreground polling; inbox notices persist in the database. Background offer push, sockets, voice guidance and traffic-aware navigation are not claimed.
- Masked calling has no provider. Calls record intent only, and chat provides an alternative when phone details are unavailable.
- The operating polygon is still unspecified. Expanding matching is not legal/operational service-area enforcement.
- Automatic fee deductions, driver penalties, app-held funds, cash refunds and reversal of an already settled charge are separate operator/ledger work. This phase reviews proposed obligations, waives pending charges and records verified manual receipt.
- Scheduling, new earnings/payout pages, payout-account editing and expanded legal/rejoin flows remain later phases. No new code was pushed or published in this turn.

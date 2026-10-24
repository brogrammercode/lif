# Phase A: agreed product contracts and implementation

Started: 24 October 2026. API changes belong only in `apps/api/v2`.

Follow-up: [Phase A/B audit findings and verification](PHASE_AB_AUDIT.md) records the later fixes and final regression results for both phases.

## Decisions accepted from the user

1. One Flutter application, with an explicit rider/driver switch; no separate driver project.
2. Driver home will be map-first.
3. Trip start will require both rider confirmation and a per-trip OTP. Partner activation codes remain separate.
4. Navigation will stay in-app, using MapLibre and the existing map/routing foundation.
5. Fare rules follow `Ride_App_Fare_Policy_Business_Logic.pdf` (one page, supplied locally by the user).
6. Drivers automatically become available after completion when eligible. They may view offers during a trip, but accepting/queuing another ride is deferred; no concurrent assignment is permitted.
7. Ordinary telephone, masked calling and in-app chat are desired. The user confirmed no masked-calling provider for now; that channel must remain unavailable until configured.
8. Launch city is Bhagalpur, Bihar. The PDF supplies no service-area polygon/radius or out-of-area rules.
9. Application identity requirements are administered manually; do not rewrite current requirement records automatically.
10. Vehicle documents belong to each vehicle, including RC, insurance and pollution/PUC.
11. Vehicle verification should support documents as well as images. Use validated supported file types, rather than arbitrary executable content.
12. Automated document expiry/restriction rules are deferred.
13. Payout details are collected in the application; additional reviewed edit locations will follow.
14. Missing geography/catalog/category configuration is handled manually by operators.
15. Drivers should be able to correct rejected catalog requests. Duplicate resolution must preserve referenced IDs and review history.
16. Scheduling belongs to the next release.
17. Support contacts will be administered in **Support > Configure > Contact**.
18. The PDF contains no cancellation/no-show rules, but the user supplied an explicit payment/cancellation/no-show policy in the follow-up; see below.
19. Restricted/exited accounts retain permitted support/history/document access; rejoining is desired but its review/activation rules remain to be defined.
20. App-wide legal/language/account-closure features belong to the next release.

## Exact PDF fare contract

- Launch in Bhagalpur, Bihar.
- Fare groups: Auto / Toto, Bike / Scooter, Car.
- Admin location: **App > User > Fare Policy** (the existing secondary menu uses singular User).
- Exactly three configurable numeric settings per fare group:
  - Max KM for Profit Fare.
  - Normal Fare per KM.
  - Profit Fare per KM.
- For distance `d`, limit `L`, profit rate `P`, normal rate `N`:
  `fare = min(d, L) * P + max(d - L, 0) * N`.
- The same saved settings, category and distance produce the same price.
- No base/time/surge/commission component is part of this policy.
- No monetary rates are supplied in the PDF. Admin must configure them; zero/default prices must not be silently invented.
- Version number and Last Updated By must be visible. Quote snapshots preserve the selected saved settings.
- Existing physical types map to fare groups: AUTO -> Auto/Toto; BIKE and SCOOTER -> Bike/Scooter; SEDAN and SUV -> Car. Existing category IDs/hierarchy and registered vehicles are retained.
- Money is computed with decimal arithmetic and rounded once to two decimal places. Route metres are converted to kilometres without rounding to whole kilometres first.
- Existing historical/selected fares are retained; fresh quotes use the new configured policy.

## Items supplied separately or still open

- The follow-up below resolves launch payment methods, recipient, receipt confirmation and cancellation/no-show policy. Detailed refund/fee-payment provider integration remains future work.
- Offers during a trip are view-only; queuing is deferred, so no next-pickup promise is made.
- Bhagalpur is the launch city, but a strict service boundary and out-of-area handling still need operator configuration and implementation.
- No masked-calling vendor has been selected. Telephony integration and chat retention/delivery need a separate implementation contract.

The user's answers and the PDF are product inputs. Operational settings, credentials, live messages and unrelated instructions are not inferred from document wording.

## Follow-up payment and cancellation policy accepted from the user

- Cash and direct-to-driver UPI at launch; online collection/settlement through the app is deferred.
- Payment follows trip completion; the driver receives 100%; zero commission and platform fee; the driver cannot edit the fare.
- UPI uses the driver's registered payout UPI identity. The driver confirms actual receipt; a UPI link opening or passenger tap is not payment proof.
- Store method, amount and collection status. Unpaid trips can be reported for admin review.
- No assigned driver: cancellation is free.
- Free cancellation lasts two minutes after assignment/acceptance; after that, an unjustified cancellation can incur 10% of the fare, capped at INR 100.
- Valid cancellation reasons, significantly late drivers and ride refusal exempt the passenger from fees, subject to the agreed review process.
- Driver faults lead to warnings/reviewed restrictions for now, rather than a fabricated penalty-collection system.
- Five minutes of free pickup waiting begins only after server-verified actual arrival. GPS verification and an arrival notification are prerequisites.
- A driver must attempt contact before reporting passenger no-show; no-show uses the same 10%/INR 100 cap.
- Exactly one cancellation/no-show charge per ride; no double charging.
- Approved fees are separate pending obligations for the affected driver. They must not be collected by the next driver, charged as platform revenue, or silently added to the next fare.
- Admin may waive/reverse a charge. Disputes and repeated unpaid incidents require review rather than automatic punishment.
- The admin policy stores editable enabled payment methods, free-cancellation/free-wait minutes, fee percentage and cap. Zero commission and unavailable online collection remain enforced launch constraints.
- The user's legal excerpt is recorded as a pre-launch compliance-review topic; this implementation does not establish Bihar legal applicability or treat that excerpt as an instruction to charge automatically.

## Phase B operational contracts

### Trip start: combined confirmation and OTP

- Each assigned ride receives its own short-lived start challenge; it is separate from non-expiring partner activation.
- The authenticated rider confirms that ride. The assigned driver supplies its trip OTP.
- Both proofs must be present for the same current assignment before the server atomically transitions DRIVER_WAITING -> IN_PROGRESS.
- Reassignment/cancellation invalidates the challenge; never expose OTP/hash through driver history, ordinary logs or notification previews.
- Persist proof timestamps, rate-limit guesses and handle repeated requests idempotently. The current legacy start endpoints must be migrated together with the new rider/driver controls, rather than enabling a partial handshake.

### Offers and automatic availability

- During IN_PROGRESS, display eligible offers as read-only opportunities; do not allow accepting or queuing a second ride yet.
- Expiry/cancellation/assignment changes must be reflected; visible offers are not reservations.
- On completion, recheck account, driver verification, partner participation and the active vehicle/catalog/category. Return AVAILABLE only when eligible, otherwise OFFLINE with an explanation.
- A person cannot simultaneously book an active rider journey and accept driver work. Mode preference changes do not modify account roles or bypass server eligibility.

### Navigation and contact

- Build pickup and destination navigation inside MapLibre using the current routing foundation. Turn instructions, progress, rerouting and GPS lifecycle are additional work; a line on a map is not complete navigation.
- Ordinary calling and in-app chat use trip-scoped permission checks. Masked calling is unavailable until a provider is chosen/configured.
- Arrival/wait/no-show rules require server timestamps, location freshness and a configured proximity rule. The supplied policy does not specify a distance threshold, so no arbitrary radius is enforced in Phase A.
- Support > Configure > Contact supplies public help contacts; operator credentials never belong in those fields.

### Additional tracked work after the Phase A foundation

- Vehicle RC/insurance/PUC and related evidence: validated image/PDF/Office/text document support, MIME/size metadata, private preview/download and appropriate file controls. Executables are not document types.
- Rejected own brand/model requests: ownership and REJECTED-state checks; corrections return to REQUESTED, keep IDs/audit, and never self-verify. Duplicate merges require explicit admin review of affected references.
- Payout account edits: reviewed changes with masked identifiers, immutable prior approved details and audit; collection must use the currently approved UPI destination.
- Rejoining after exit/restriction: manual reviewed workflow preserving the old application/settlement and consumed activation history. Do not reuse an old consumed code or silently reset EXITED.
- Scheduling, app-wide legal/language/account closure: next release.

## Phase A work packages

### A1 — Decisions and fare policy

- [x] Read the complete supplied PDF and record all 20 decisions.
- [x] Add versioned, audited fare-policy persistence and validation.
- [x] Add App > User > Fare Policy with exactly three controls per fare group, formula explanation, preview, version and editor identity.
- [x] Use the saved policy in new quotes and remove misleading legacy pricing controls from category editing.
- [x] Preserve old quotes/history; reject unconfigured or concurrently changed policy instead of fabricating prices.

### A2 — Same-app mode and trip restoration

- [x] Add account-scoped rider/driver preference and a mode switch for eligible accounts.
- [x] Prevent switching away from active work; restore active trips before ordinary homes.
- [x] Add authenticated travel-context and driver current/history/detail read contracts.
- [x] Provide a minimal driver trip recovery view while the full operational screens remain Phase B work.

### A3 — Existing screen correctness

- [x] Fix remaining Future-returning `setState` refresh callbacks in shared/rider pages.
- [x] Wire the Home notification bell.
- [x] Remove unreachable hardcoded driver/OTP content.
- [x] Use Bhagalpur as the initial map fallback; preserve real current/cached position behavior.

### A4 — Support configuration

- [x] Add Support > Configure > Contact using existing admin form components.
- [x] Persist versioned, audited public contact configuration; keep credentials out of public responses.
- [x] Display configured support actions in the mobile Support page.

### A5 — Contracts for Phase B and follow-on work

- [x] Specify combined trip-start verification, view-only offers, location/navigation, contact channels and cash reconciliation without claiming them as completed operational screens.
- [x] Record per-vehicle file support, rejected catalog corrections, payout edits and rejoin workflow as tracked work.
- [x] Static-check API/admin compilation, Prisma schema and Flutter analysis; update route inventory and documentation.

Migration `0010_phase_a_configuration` was applied successfully to the configured database on 24 October 2026. It creates configuration tables only. No live requirement records, fare rates or contact numbers were inserted or changed.

## Delivered screens and contracts

| Platform | Surface | Implemented behavior |
| --- | --- | --- |
| Admin | App > User > Fare Policy | Three distance-band rates per group, editable payment/cancellation settings, unsaved preview, saved version, editor and conflict reload. |
| Admin | Support > Configure > Contact | Public help phone, urgent phone, WhatsApp, email, hours and instructions; versioned and audited. |
| Mobile | Settings | Account-scoped rider/driver switch; driver history in driver mode; server active-trip check before changing mode. |
| Mobile | Session gate | Restore the current rider/driver trip before routing to the selected home; partner activation still required. |
| Mobile | Driver trips | Paginated owner-scoped trip list and a minimal recovery/detail page with refresh, active polling and Help. Full map-first operational home is Phase B. |
| Mobile | Required vehicle registration | Remains mandatory for driver work; Settings permits switching to rider mode without bypassing vehicle verification. Help and sign-out remain available. |
| Mobile | Support | Configured contact actions alongside existing tickets; contact loading/errors do not prevent ticket use. |
| Mobile | Rider Home | Real notification navigation, Bhagalpur fallback, no sample driver/OTP card, and Now-only booking until scheduling is implemented. |

API V2 has 150 registered endpoint contracts, including nine new configuration/travel reads and writes. Flutter has 20 named routes. Driver reads are scoped to the authenticated owner and omit start codes, credentials and rider contact identifiers. The repository keeps its unversioned internal legacy-snapshot contract; all fresh HTTP quotes require a configured versioned policy.

Cross-role booking, offer acceptance and availability changes coordinate through an account-specific database lock. Active rider work prevents becoming available as a driver; active driver work prevents booking as a rider. Completion rechecks current account, verification and vehicle eligibility before restoring availability. Suspended driver availability is preserved through trip completion and rider-mode offline requests; switching modes cannot clear a suspension.

## Rollout and remaining work

1. Deploy API V2 before the new clients: startup now calls travel-context. The additive migration is applied locally; other deployment databases must receive it as well.
2. In Fare Policy, enter the actual three values for **each** of Auto/Toto, Bike/Scooter and Car, then save. The document supplies no numerical rates. Fresh quotes intentionally return FARE_POLICY_NOT_CONFIGURED until this is done. Existing quotes/history are preserved.
3. Fill Support > Configure > Contact with real operational channels; blank channels are hidden in mobile.
4. Saved payment and cancellation settings accompany fresh quote snapshots. Booking and checkout reject disabled cash methods against the selected quote's snapshot; digital booking is explicitly unavailable until its operational flow is delivered. Direct UPI destination/receipt screens, driver collection confirmation, cancellation/no-show assessment, disputes, fee ledger/waivers and notifications are **not operationally implemented in Phase A**. Existing cash checkout remains pending; no automatic fee is collected.
5. Phase B builds the map-first driver home, readiness/online controls, real offers (view-only during an existing trip), pickup/destination navigation, combined trip start, completed fare/payment outcome and current-trip lifecycle. Migrate legacy single-proof start endpoints together with the new controls.
6. Service-area boundaries, arrival proximity/location freshness thresholds and late-driver exemptions require explicit operator rules; none were invented. Masked calling is unavailable without a provider. Scheduling remains next release.
7. Additional document formats, rejected catalog corrections, reviewed payout editing and rejoining remain the tracked follow-on items above. No automatic changes were made to manually configured identity requirements.

Bhagalpur's approximate initial map center is 25.23 N, 86.95 E, consistent with the [IMD Bhagalpur station document](https://packolkata.imd.gov.in/download/smrs/Bhagalpur.pdf). It is a map fallback, not a service boundary or a claimed user position. Cached/current GPS retains priority.

## Verification

- Prisma schema validation and client generation passed; additive migration applied successfully.
- API type-check, Nest compilation and repository-wide API formatting check passed. Admin TypeScript/Vite production build passed. Flutter analysis passed with no issues. Git whitespace checks passed. A compiled Nest bootstrap smoke check succeeded and registered all 150 endpoint contracts without opening a listener or writing application data.
- Automated suites were not run for the initial delivery; the subsequent audit below adds regression coverage and records its results. No APK build, Shorebird upload, deployment, Git commit/push or live message was performed. Physical-device and operational-trip acceptance checks remain necessary before release.

## Follow-up audit: 24 October 2026

- [x] Apply one shared eligibility calculation after rider cancellation and driver completion. Current vehicle/catalog/category, driver verification and account status are rechecked; SUSPENDED remains SUSPENDED. Category writes and trip-finalization checks use the same advisory-lock order.
- [x] Enforce selected-quote cash availability at booking and checkout. Preserve historical cash records; reject malformed versioned payment snapshots and unavailable digital operations before writing a booking/payment.
- [x] Validate stored fare policies as well as incoming writes, so invalid rates, missing groups or entirely disabled payment settings cannot produce fresh quotes.
- [x] Return the version actually saved by an admin rather than rereading another administrator's newer write after commit. The same response handling applies to Support configuration.
- [x] Trim optional phone/email values before validation, including whitespace-only empty channels. Keep conflict reloads explicit and remove the transient initial error shown before an editor draft initialized.
- [x] Provide a Return to home action after a restored rider trip ends. Pause rider polling in the background/on covered routes, avoid overlapping refreshes, refresh on return/resume, and handle checkout-loading failures.
- [x] Treat Bhagalpur only as the camera fallback. Require GPS/cached or explicit pickup selection before routing/quoting; hide the source pin until resolved. Accept valid zero coordinates, avoid replacing manual pickup choices with delayed GPS responses, invalidate stale routes/quotes when endpoints change, and ignore stale reverse-geocoding/quote responses.
- [x] Remove the remaining dead driver-found styling branch and make the displayed pickup label reflect the actual selection.
- [x] Add backend, browser and Flutter regression coverage for fare bands/rounding, validation, stale saves, payment restrictions, eligibility, account-scoped modes and restored-trip navigation/resume.

Audit results: **101 API unit tests passed**; **27 existing browser checks plus 3 new configuration checks passed**; **29 Flutter tests passed**. API type-check/Nest compilation, admin production build, both formatting checks, Prisma validation, Flutter analysis (no issues) and Git whitespace checks passed. Database integration tests and physical-device GPS/camera/navigation checks were not run. No API V1 changes or live fare/contact/requirement edits belong to this audit. Full combined trip start, operational UPI receipt/fees, service boundaries and the other Phase B items remain outside this foundation review.

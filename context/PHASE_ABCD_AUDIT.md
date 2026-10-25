# Phases A-D: combined consistency audit

Date: 25 October 2026. Scope: API V2, admin V1 and the shared rider/driver Flutter app. This follows the individual [A/B](PHASE_AB_AUDIT.md), [C](PHASE_C_AUDIT.md) and [D](PHASE_D_AUDIT.md) audits.

## Scope checked

- [x] Phase A: role preference/restoration, active-trip protection, fare-policy snapshots and validation, support configuration and private history access.
- [x] Phase B: matching and offer acceptance, current driver/vehicle eligibility, GPS arrival, combined rider confirmation/trip code, pickup/drop-off navigation, completion, collection and reviewed cancellation/no-show charges.
- [x] Phase C: booking retries and expiry, rider status/route recovery, receipt/payment presentation, history, notifications, communication and safety entry points.
- [x] Phase D: earnings reconciliation, approved payout destinations, encrypted/masked account changes, catalog corrections, vehicle document replacement and restricted/exit account reads.
- [x] Run the API regression suite, Nest compile, Prisma validation, Flutter analysis/tests, admin production build/browser tests and formatting checks.

## Corrections in this audit

1. **Pickup directions surviving trip start.** The driver trip page now clears route geometry, turn instructions, progress and old navigation errors immediately when its target changes or the trip ends. It does this before awaiting tracking startup or an outstanding route. A delayed pickup response or error cannot replace current drop-off directions.
2. **Ambiguous navigation responses.** API V2 driver navigation now returns the target used by its route calculation: `PICKUP` or `DROPOFF`. The client rejects a response tagged for a different target. The field is additive; older responses without it remain compatible. Invalid or out-of-range route/map coordinates use the existing shared validation helpers.
3. **Tracking restart blocked by an old startup.** Stopping tracking releases the old startup reference. Completion of that old future only clears its own reference, so it cannot clear a newer startup. Generation checks also stop obsolete permission/startup work before it continues.
4. **Old uploads interfering with new tracking.** Upload serialization now belongs to a tracking generation. An old upload no longer suppresses a new generation's initial upload, clears its pending-upload reference or updates its error state. Stream teardown detaches and clears the old state before awaiting native cancellation; an obsolete stop does not take a restarted tracker offline.
5. **Cancelled GPS refresh counted as success.** If tracking stops during `freshFix`, the refresh fails rather than authorizing arrival. Going online also requires a running tracker, and driver operations check that the page remains mounted after GPS work.
6. **Lost action response recovery.** Driver trip actions refresh the authoritative trip after both success and failure. A completion committed before a connection failure therefore displays the completed state rather than leaving the old completion action active until the next poll.
7. **Driver snapshot validation.** Before exposing trip actions, the page checks the requested ID against both envelope and nested trip IDs, known status values and agreement between the two status fields. This matches the rider page's existing validation.
8. **Account status changing after HTTP authentication.** A second pass found five older driver write paths without the transaction-level active-account recheck: profile creation, vehicle creation, category changes, active-vehicle selection and offer rejection. They now acquire the shared account lifecycle lock and recheck the user before category/driver locks or resource access, matching the existing booking, location, acceptance and payment paths. Requests that passed authentication before deactivation cannot continue writing after deactivation commits. Missing, inactive and soft-deleted accounts are rejected; active drivers can still select eligible vehicles.

The changes reuse existing navigation, map, UI and network components. No dependency, native permission, fare rule, schema migration or live record change was introduced in this audit.

## Regression evidence

New API coverage verifies driver navigation targets, pickup/drop-off coordinates, assigned-driver ownership and terminal-trip denial. New Flutter tests exercise actual trip-page rendering during an outstanding pickup request, wrong-target responses, malformed trip snapshots and a committed completion with a failed response. Tracking tests use the real service with an isolated GPS platform/repository to reproduce overlapping startup/upload generations and cancellation during refresh.

The existing combined suites also cover matching radius/deadline checks, start verification, preserved suspension, immutable accepted fares, direct-UPI receipt confirmation, provider-managed payment protection, reviewed-fee versioning and duplicate prevention, booking recovery, owner-scoped histories, payout masking/review, document renewal and admin recovery/viewport behavior.

The follow-up adds five parameterized repository regressions modelling an account changing after the HTTP guard, including missing, deactivated, suspended and soft-deleted records. They assert rejection under the lifecycle lock before access to driver resources. A sixth regression verifies successful eligible-vehicle selection for an active account. These use isolated transaction fixtures; no live account was deactivated for testing.

## Verification

- API V2: 158/158 unit and HTTP tests passed after the follow-up; Nest compile and formatting passed. Prisma schema validation passed in the initial combined pass; this follow-up makes no schema changes.
- Flutter: 73/73 tests passed; `flutter analyze` reports no issues. All five changed/new Dart files passed formatting.
- Admin: 37/37 Chromium tests passed; TypeScript/Vite production build and formatting passed.
- Git whitespace checks passed.

Logs are local ignored files named `.phase-abcd-*` in the corresponding app directories. No APK build, deployment, Shorebird release, commit or push was performed. API V1 was not modified by this audit.

## Device and release acceptance

Automated checks do not replace paired physical-device trips. Still verify foreground/background GPS and permission changes, pickup-to-drop-off MapLibre camera behavior, real calls/UPI apps, native file pickers/viewers and restricted-account flows on the release build. Phase B's native changes still need the previously documented signed base release. Follow the rollout and manual acceptance steps in the phase trackers before production release.

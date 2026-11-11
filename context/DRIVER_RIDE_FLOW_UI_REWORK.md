# Driver ride flow UI — 11 November 2026

## Scope and implementation

Every driver phase uses `RiderFlowScaffold`, `RideStagePanel` and `RideArrivalStrip`: a solid black status bar directly above the white draggable body, with an 80% map behind it. The shared shell measures short content to cap expansion, and completion starts at 90% with a 94% ceiling.

Where rider pages show the driver's identity, driver pages show the passenger's identity. The actual assigned vehicle, registration, model and brand logo stay unchanged. Rider ratings are not invented or copied from driver ratings.

| Phase | Production page / composition | Actions |
| --- | --- | --- |
| New request | `DriverRequestPage`, shared vehicle/identity card and route timeline | Accept, decline; request refreshed and expiry/acceptance checked; incoming actionable offers open from driver home |
| Arriving / waiting | `DriverTripPage`, same vehicle/identity card, call/chat/support and route timeline | GPS-verified arrival, prominent QR scanner, manual trip-code fallback and trip review/cancellation controls |
| In progress | `DriverTripPage`, compact passenger row and shared `RideDestinationProgressBar` | Confirm Complete ride; nearby offers remain view-only |
| Payment | Completed trip with unresolved payment, shared arrival-style composition | Existing direct cash/UPI receipt confirmation, unpaid reporting and provider/settlement restrictions |
| Completed | Same `RiderCompletionPanel` in driver mode under the black completed strip | Passenger identity with assigned vehicle, trip/cost details, receipt and return home; no rider-to-driver rating control |

QR capture submits the same six-digit trip code as manual entry. When scanned during approach, a fresh GPS fix and server arrival verification happen before start verification. The server still enforces rider confirmation and correct trip code; an activation code cannot start a trip. Errors are shown and the trip snapshot reloaded after ambiguous write outcomes.

Driver-only offer responses now include the rider's name/avatar, passenger count/note, and the current eligible driver's vehicle brand details. No new API endpoint or migration.

## Demo

Home → Demo → **Driver ride flow** uses these production pages with `DriverDemoController`. Its scoped transport and `DemoDriverTracking` cannot fall through to real HTTP, GPS, token storage or location uploads. The toolbar supports Request, Arriving, At pickup / QR, In progress, Payment, Completed, Next and Restart. Demo code: **162904**. QR capture itself still uses the device camera when explicitly tapped; manual code and stage controls work without it.

Fixtures and state transitions live in the controller, not the page. Profile swaps preserve vehicle identity. Driver payment confirmation changes the pending collection snapshot into a captured collection and opens the completed phase.

## Checklist

- [x] Shared solid sheet geometry for every driver phase.
- [x] Passenger identity plus actual vehicle brand/registration across phases.
- [x] Actionable request presentation, expiry and duplicate-response guards.
- [x] Arrival, QR/manual start, completion and collection keep existing server gates.
- [x] Distance-based progress and stale/late-route protection.
- [x] Driver demo registry entry and isolated controller source.
- [x] Focused Flutter regressions: all driver demo phases, route invalidation, mismatched snapshots, ambiguous completion and payment restrictions (12 passing, including production Complete/collection taps and 320 px / 1.3 text scale).
- [x] API compile and unit suite (230 passing).
- [x] Final Flutter analyzer and API formatting checks. Broader shared regression run compared to isolated baseline; no new failing tests.
- [ ] Real-device acceptance: live offer arrival, camera QR scan against rider, GPS arrival checks, cash/direct UPI collection and layout/dragging at device text scale.

No release, version bump or push is part of this task.

## Driver phase refinements — 11 November 2026

- Arrival ends at **I have arrived at pickup**; pickup ends after the destination row. QR start remains available beside contacts.
- Complete ride appears only with valid route progress and less than 10% of the estimated journey distance remaining. Missing route data never unlocks completion.
- Passenger count uses the compact profile badge in request, arrival, pickup, progress, payment and completion.
- Payment uses the shared swipe control labelled **Payment received**, with server-side collection policy and receipt confirmation. Both apps refresh the authoritative payment snapshot; a captured payment moves them to completion. Opening an external UPI app does not constitute a captured payment.
- Call and chat remain authorized for trip participants during pending/failed payment collection. Existing ownership, rate limits and resolved-trip contact restrictions still apply.
- Flutter analyzer and API compilation passed. Device GPS, calls, camera and real payment delivery still require device acceptance.

## Baseline regression evidence

The broader `flutter test test/features/demos test/features/driver_operations test/features/rides` run completed with 71 passing and 11 failing tests before the final extra driver interaction test was added. The identical suite at committed baseline `00c59b7` in a detached temporary worktree completed with 69 passing and the same 11 failing test names. The two additional passing tests were the initial new driver demo regressions. The final focused run including the extra production Complete/collection interaction has 12 passing tests.

Existing failures are in rider demo header uniqueness, phase-C selectors/live refresh, restored finished-ride navigation, old completed-detail/receipt expectations, and vehicle-selection button labels. They are recorded here as outstanding baseline work rather than marked fixed by this driver rework. The API compile and all 230 API unit tests passed; API `format:check` passed. No device test or deployment is implied by these checks.

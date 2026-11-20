# Driver ride flow UI — 11 November 2026

## Scope and implementation

Every driver phase uses `RiderFlowScaffold`, `RideStagePanel` and `RideArrivalStrip`: a solid black status bar directly above the white draggable body, with an 80% map behind it. The shared shell measures short content to cap expansion, and completion starts at 90% with a 94% ceiling.

Where rider pages show the driver's identity, driver pages show the passenger's identity. The actual assigned vehicle, registration, model and brand logo stay unchanged. Rider ratings are not invented or copied from driver ratings.

| Phase              | Production page / composition                                                      | Actions                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Go online          | `DriverGoOnlineStage`, map background, black strip / white draggable sheet         | Drag through owned vehicle brand circles; swipe Go online selects the active eligible vehicle, starts GPS and enables requests |
| New request        | `DriverRequestPage`, shared vehicle/identity card and route timeline               | Accept, decline; request refreshed and expiry/acceptance checked; incoming actionable offers open from driver home      |
| Arriving / waiting | `DriverTripPage`, same vehicle/identity card, call/chat/support and route timeline | GPS-verified arrival, prominent QR scanner, manual trip-code fallback and trip review/cancellation controls             |
| In progress        | `DriverTripPage`, compact passenger row and shared `RideDestinationProgressBar`    | Confirm Complete ride; nearby offers remain view-only                                                                   |
| Payment            | Completed trip with unresolved payment, shared arrival-style composition           | Existing direct cash/UPI receipt confirmation, unpaid reporting and provider/settlement restrictions                    |
| Completed          | Same `RiderCompletionPanel` in driver mode under the black completed strip         | Passenger identity with assigned vehicle, trip/cost details, receipt and return home; no rider-to-driver rating control |

QR capture submits the same six-digit trip code as manual entry. When scanned during approach, a fresh GPS fix and server arrival verification happen before start verification. The server still enforces rider confirmation and correct trip code; an activation code cannot start a trip. Errors are shown and the trip snapshot reloaded after ambiguous write outcomes.

Driver-only offer responses now include the rider's name/avatar, passenger count/note, and the current eligible driver's vehicle brand details. No new API endpoint or migration.

## Production driver account integration

The completed driver demo is the visual source of truth for the signed-in driver ride flow. Production uses the same go-online, request, arriving/waiting, in-progress, payment and completed compositions while replacing the demo controller/transport/tracking with authenticated production state and real APIs.

The normal application path is:

1. `SessionController` restores an active driver ride directly to `AppRoutes.driverRideDetail`; otherwise it opens `AppRoutes.driverHome` when the saved account mode is Driver and the server allows driver access.
2. When eligible and offline, `DriverHomePage` opens `DriverGoOnlineStage`, loading the driver's owned vehicle records through `VehicleVerificationRepository`. The carousel displays every owned vehicle's brand identity and keeps unverified vehicles visible but unavailable for activation.
3. Swiping Go online calls the existing `/driver/vehicles/:id/active` endpoint for the selected eligible vehicle, starts `DriverTrackingService`, and only then calls `/driver/availability`. A failed location start leaves the driver offline. Once online, dashboard polling presents the existing actionable offers and request UI.
4. `DriverHomePage` loads the real `DriverOperationsRepository` dashboard and polls while foregrounded. A live actionable offer opens `DriverRequestPage`. Accept/reject calls `/driver/offers/:id/accept` or `/reject`; accepting replaces the request with `AppRoutes.driverRideDetail` and the returned ride ID.
5. `DriverTripPage` loads the ride through the normal authenticated client, verifies driver ownership and matching trip/status snapshots, then drives arrival, QR start, route progress, completion and collection through the existing driver operations endpoints. Nearby offers remain view-only during a trip.
6. Trip history and notification recovery also navigate to the same production `DriverTripPage` route. Returning to Driver Home refreshes the dashboard and resumes any current trip.

The demo uses `DriverDemoHost` and an isolated `DriverDemoController` transport/tracking adapter to preview those same pages. The demo registry entry is not the production route, does not enable driver mode, and does not handle real offers. No demo launcher has been added to Driver Home.

| Production entry       | Implementation                                  | Data source                                                           |
| ---------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Restore driver account | `SessionController` → `AppRoutes.driverHome`    | Authenticated session, saved account mode and travel context          |
| Go online / choose car | `DriverHomePage` → `DriverGoOnlineStage`        | Owned vehicles, active-vehicle API, availability API and real GPS     |
| Receive/accept request | `DriverHomePage` → `DriverRequestPage`          | Real `/driver/operations` polling and offer accept/reject endpoints   |
| Resume/operate trip    | `AppRoutes.driverRideDetail` → `DriverTripPage` | Authenticated trip context, navigation and driver operation endpoints |
| Preview UI             | `DemoLauncher` → `DriverDemoHost`               | Scoped demo controller and simulated tracking only                    |

The phase UIs are shared between demo and production; only their injected data source differs. The pre-request **Go online** stage loads every owned vehicle through `VehicleVerificationRepository`, selects the active eligible vehicle through `/driver/vehicles/:id/active`, starts real tracking, then calls `/driver/availability`. Production route integration is source-verified. Real GPS, offer delivery, camera scanning, calls and payment collection still require device acceptance; analyzer checks do not establish those device behaviors.

## Demo

The demo now starts at **Go online**, with a controller-owned fixture carousel of owned brand circles. Its swipe advances to Ride request. The stage selector can still jump among Go online, Request, Arriving, At pickup / QR, In progress, Payment and Completed.

Home → Demo → **Driver ride flow** starts at **Go online** and uses the same ride-stage widgets with `DriverDemoController`. Its scoped transport and `DemoDriverTracking` cannot fall through to real HTTP, GPS, token storage or location uploads. Swiping Go online advances to Ride request. The toolbar supports Go online, Request, Arriving, At pickup / QR, In progress, Payment, Completed, Next and Restart. Demo code: **162904**. QR capture itself still uses the device camera when explicitly tapped; manual code and stage controls work without it.

Fixtures and state transitions live in the controller, not the page. Profile swaps preserve vehicle identity. Driver payment confirmation changes the pending collection snapshot into a captured collection and opens the completed phase.

## Checklist

- [x] Shared solid sheet geometry for every driver phase.
- [x] Passenger identity plus actual vehicle brand/registration across phases.
- [x] Actionable request presentation, expiry and duplicate-response guards.
- [x] Go online is the pre-request stage in production and demo, with owned-brand carousel and swipe-to-go-online action.
- [x] Arrival, QR/manual start, completion and collection keep existing server gates.
- [x] Normal driver account entry, live offer presentation/response and active-trip recovery use the production flow pages and authenticated repositories.
- [x] Distance-based progress and stale/late-route protection.
- [x] Driver demo registry entry and isolated controller source.
- [x] Focused Flutter regressions: all driver demo phases, route invalidation, mismatched snapshots, ambiguous completion and payment restrictions (12 passing, including production Complete/collection taps and 320 px / 1.3 text scale).
- [x] API compile and unit suite (230 passing).
- [x] Final Flutter analyzer and API formatting checks. Broader shared regression run compared to isolated baseline; no new failing tests.
- [ ] Real-device acceptance: live offer arrival, camera QR scan against rider, GPS arrival checks, cash/direct UPI collection and layout/dragging at device text scale.

No release, version bump or push is part of this task.

## Driver phase refinements — 11 November 2026

- Arrival ends at **I have arrived at pickup**; pickup ends after the destination row. QR start remains available beside contacts.
- Complete ride is visible throughout `IN_PROGRESS` for now. The former client-side requirement for a valid route and less than 10% remaining is retained as a comment in `DriverTripController`; the API still requires an ongoing ride.
- Passenger count uses the compact profile badge in request, arrival, pickup, progress, payment and completion.
- Payment uses the shared swipe control labelled **Payment received**, with server-side collection policy and receipt confirmation. Both apps refresh the authoritative payment snapshot; a captured payment moves them to completion. Opening an external UPI app does not constitute a captured payment.
- Call and chat remain authorized for trip participants during pending/failed payment collection. Existing ownership, rate limits and resolved-trip contact restrictions still apply.
- Flutter analyzer and API compilation passed. Device GPS, calls, camera and real payment delivery still require device acceptance.

## Driver availability home refinements — 19 November 2026

- Production Driver Home now always uses `DriverGoOnlineStage`; the prior map dashboard, availability card, workspace shortcuts and inline offer list are removed. Actionable offers still arrive through the existing foreground polling and open `DriverRequestPage`.
- The stage remains visible when online. Its selected owned vehicle remains displayed and the same slider changes to red **Slide to go offline**; swiping uses the existing availability endpoint and stops tracking. The offline slider remains blue and still activates an eligible selected vehicle before starting GPS and setting availability.
- The stage has the rider-style profile avatar at top-left and notification action at top-right. Avatar data is loaded once into `DriverHomeController`, not fetched on every dashboard poll.
- The driver vehicle eligibility gate displays the first-stage sheet while checking, rather than a separate full-page skeleton. The session restoration gate has no branded loading screen while routing resolves; authentication and active-trip recovery remain enforced.
- Rider and driver location prompts use `LocationAccessSheet`, a black-header/white-body ride-flow sheet with the supplied `assets/images/location_access.png` illustration, concise rationale and permission/settings action. The operating system's permission dialog remains OS-rendered after the user continues.
- Flutter analyzer passed for these latest refinements. Device acceptance for online/offline GPS permission prompts and layout remains pending.

## Baseline regression evidence

The broader `flutter test test/features/demos test/features/driver_operations test/features/rides` run completed with 71 passing and 11 failing tests before the final extra driver interaction test was added. The identical suite at committed baseline `00c59b7` in a detached temporary worktree completed with 69 passing and the same 11 failing test names. The two additional passing tests were the initial new driver demo regressions. The final focused run including the extra production Complete/collection interaction has 12 passing tests.

Existing failures are in rider demo header uniqueness, phase-C selectors/live refresh, restored finished-ride navigation, old completed-detail/receipt expectations, and vehicle-selection button labels. They are recorded here as outstanding baseline work rather than marked fixed by this driver rework. The API compile and all 230 API unit tests passed; API `format:check` passed. No device test or deployment is implied by these checks.

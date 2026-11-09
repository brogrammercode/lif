# Ride booking flow — ordered screens and code map

Verified against source: 9 November 2026.
Scope: the rider's booking journey in the shared Flutter rider/driver application, including its demo, supporting sheets and history entry points.

All source links below are relative to this report. In VS Code, Ctrl+click a file link; use **Ctrl+P** with the repository path when needed, then **Ctrl+F** for the exact symbol shown.

## Start here: there are not seven separate page files

The reference journey has seven visual frames, but several frames are states of the same page:

| Flow order | What you see                                                  | Actual page / variant                                        | Main source                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | Home map, places and pickup/drop-off card                     | `HomePage()`                                                 | [home_page.dart](../apps/user/v1/lib/features/home/pages/home_page.dart)                                                                                                                                      |
| 2          | Search/pick pickup and destination                            | `HomePage(locationSelection: true)`                          | [home_page.dart](../apps/user/v1/lib/features/home/pages/home_page.dart)                                                                                                                                      |
| 3          | Choose category/vehicle, passengers, payment preference; book | `VehicleSelectionPage`                                       | [vehicle_selection_page.dart](../apps/user/v1/lib/features/rides/pages/vehicle_selection_page.dart)                                                                                                           |
| 4          | Finding your driver                                           | `RideDetailPage`, status `REQUESTED` / `SEARCHING`           | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart) + [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart)                           |
| 5          | Driver assigned / approaching pickup                          | Same `RideDetailPage`, `DRIVER_ASSIGNED` / `DRIVER_ARRIVING` | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart) + [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart)                           |
| 5a         | Driver arrived, trip code and rider confirmation              | Same `RideDetailPage`, `DRIVER_WAITING`                      | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart) + [trip_actions_panel.dart](../apps/user/v1/lib/features/driver_operations/widgets/trip_actions_panel.dart)           |
| 6          | Ride in progress                                              | Same `RideDetailPage`, `IN_PROGRESS`                         | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart) + [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart)                           |
| 7          | You've arrived / completion and rating                        | Same `RideDetailPage`, `COMPLETED` during a live journey     | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart) + `RiderCompletionPanel` in [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart) |

**Important:** `RiderLivePanel` and `RiderCompletionPanel` are both in **rider_live_panel.dart**. There is no separate searching-page, arriving-page or completion-page file.

```text
HomePage
  → HomePage(locationSelection: true)
  → returns confirmed endpoints to HomePage
  → VehicleSelectionPage
  → RideDetailPage [searching]
  → RideDetailPage [assigned / arriving]
  → RideDetailPage [waiting + start verification]
  → RideDetailPage [in progress]
  → RideDetailPage + RiderCompletionPanel [completed]
       → TripReceiptSheet, rating, help, or Home
```

The real flow advances through server-confirmed trip states. The demo simulates those states using its controller, while rendering these same pages.

**Shared stage container:** every current booking stage uses `RideStagePanel` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart). It is one black title/status header joined to the rounded white content sheet. Home/location entry, map stages and completion all use this same parent; each stage supplies its own title and current data.

## 1. Home / ride entry

**File:** [home_page.dart](../apps/user/v1/lib/features/home/pages/home_page.dart)  
**Class:** `HomePage`; State: `_HomePageState`. Default `locationSelection` is false.

Visible composition:

1. `MapLibreMap` in `build()`: full map, camera, location puck, route/place sources.
2. `_buildLayer1()`: current-user avatar/settings, notifications and top controls.
3. `DemoLauncher`: the Demo button over the main Home map.
4. Resume-trip action when an active trip exists.
5. `_buildLayer2()`: bounded, scrollable coordinator for the external place strip and route panel.
6. `_buildPlaceStrip()`: floating `PlaceCard(compact: true)` carousel outside the route panel; `RideStagePanel` holds the black `RideArrivalStrip` above the white route-entry body.
7. `_endpointRow()`: Pickup and Drop-off rows, each opens an independent endpoint picker.
8. Route distance/duration and validation feedback.
9. `RideSwipeButton`: shown only after both endpoints are confirmed; its blue trail and bike thumb require a deliberate swipe to request options.
9. Map recenter and center-pin overlays in the page's Stack.
10. Assigned-driver vehicle image comes from `assets/images/ride_car_marker.png` through `RiderTripMap`; zero viewport rotation keeps its nose pointing up.

**Supporting widgets:** `PlaceCard` / `PlacePhoto` in [place_components.dart](../apps/user/v1/lib/features/saved_places/widgets/place_components.dart); shared surfaces/buttons in [solid_ui.dart](../apps/user/v1/lib/components/ui/solid_ui.dart).

**Data:** [HomeController](../apps/user/v1/lib/features/home/controllers/home_controller.dart) owns endpoint/location data, routes, suggestions, places, profile and active-trip context.

**Navigation symbols:** `_chooseLocations()` opens the location variant. `_loadRideQuotes()` gets quotes through the controller and pushes `VehicleSelectionPage`.

## 2. Choose locations / search / pick on map

**Same file:** [home_page.dart](../apps/user/v1/lib/features/home/pages/home_page.dart). This is another instance of `HomePage`, with `locationSelection: true`, endpoint arguments and optionally `editPickup: true`.

Visible composition:

1. The same map, camera controls and coordinate-anchored markers.
2. `_buildLayer2()`, inside its `if (widget.locationSelection)` branch.
3. The black header names the one active endpoint: Pickup or Drop-off.
4. Exactly one `_buildSearchField()` plus the saved-Home shortcut.
5. “Pick active location on map” action and the active center pin.
6. `RideFlowSkeleton` during suggestion loading.
7. `_buildSuggestionRow()` renders a leading location icon, primary place name, secondary address and optional distance; saved-place rows appear when there are no suggestions.
8. Route-checking/error text and distance/duration.
9. `SolidButton('Confirm pickup')` or `SolidButton('Confirm drop-off')` returns one typed `RideEndpointSelection` to Home.

**Search/edit symbols:** `_onSearchChanged()`, `_fetchSuggestions()`, `_onSuggestionSelected()`, `_reverseGeocode()`, `_fetchRoute()`, `_activateEndpoint()`.

The fixed map-center pin is rendered by the Home overlay while the map camera moves; `_onMapCameraMove()` records the settled coordinate and `_reverseGeocode()` updates the active endpoint label.

**Map/pin symbols:** `_onMapCameraMove()`, `_buildMarkerWidget()`, `_buildPreviousMarkerImage()`, `_syncMapData()`.

**Data:** `HomeController`. The page keeps focus/text/map handles and coordinates their presentation.

**Exit:** `_confirmLocationSelection()` returns only the active endpoint. The originating Home updates only that endpoint, returns to phase 1 and calculates a route when both endpoints exist. It never opens vehicle selection automatically.

## 3. Choose vehicle / category and book

**File:** [vehicle_selection_page.dart](../apps/user/v1/lib/features/rides/pages/vehicle_selection_page.dart)  
**Class:** `VehicleSelectionPage`; State: `_VehicleSelectionState`.

Visible order:

1. `RiderTripMap` showing pickup, destination and route.
2. `RiderFlowScaffold`: shared black `RideStagePanel` header, back/recenter controls and draggable lower sheet.
3. Horizontal configured-category tiles, each using `SolidSurface`, `RideFlowImage` and category name.
4. Nearby availability previews using `RideVehicleDriverCard`.
5. Availability explanation / loading / empty state.
6. `RideEndpoints`, distance and duration estimate.
7. Passenger count with minus/plus controls.
8. `LiquidGlassDropdownFormField` for payment preference; the inherited solid theme controls its appearance.
9. Pickup-note text field, quote/booking feedback and explanatory text.
10. `_bookingAction()`: the explicit `SolidButton` that books the ride.

**Shared UI files:** [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart), [rider_trip_map.dart](../apps/user/v1/lib/features/rides/widgets/rider_trip_map.dart), [ride_glass.dart](../apps/user/v1/lib/features/rides/widgets/ride_glass.dart), [solid_ui.dart](../apps/user/v1/lib/components/ui/solid_ui.dart).

**Data/commands:** [VehicleSelectionController](../apps/user/v1/lib/features/rides/controllers/vehicle_selection_controller.dart) handles quotes, category, previews, passengers, payment preference and note. [RiderBookingController](../apps/user/v1/lib/features/rides/rider_booking_controller.dart) handles frozen submission data, retries and booking identity.

**Exit:** `_submit()` calls the controller and replaces this route with `AppRoutes.rideDetail`.

**There is no extra booking-review step in this sequence.**

## 4. Finding your driver

**Page:** [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart), `RideDetailPage`.  
**Branch:** `build()` → `_referenceJourney()`.  
**Panel:** `RiderLivePanel.build()` in [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart), its `searching` branch.

Visible order:

1. `RiderTripMap` under `RiderFlowScaffold`.
2. `RideStagePanel` black header reads “Finding your driver” with elapsed search time; map controls remain floating over the map.
3. `DriverSearchRadar`.
4. Elapsed/search-radius message and search explanation (the stage title is kept in the shared header, not duplicated in the content).
5. `RideEndpoints`.
6. Cancel ride action.
7. Safety/sharing/support action.

**Data:** [RiderTripController](../apps/user/v1/lib/features/rides/controllers/rider_trip_controller.dart): `data`, `status`, `trip`, clock, route data, refresh and polling.

**Exit:** the real server reports assignment. In the demo, Next/stage selection supplies assignment data.

## 5. Driver assigned / arriving

**Same page:** [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart), `_referenceJourney()`.  
**Same panel:** [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart), `RiderLivePanel` non-searching, non-moving branch.

Visible order:

1. Map with route, driver marker/label, pickup and destination.
2. `RideStagePanel` black `RideArrivalStrip` with pickup ETA or Updating.
4. `RideVehicleDriverCard`: registration, make/model/color, vehicle image/category; then driver photo, name/rating and contact actions.
5. `RideRouteTimeline`: pickup and destination.
6. Expandable Trip actions.
7. Safety/sharing/support action.

**Widget definitions:** card, timeline and arrival strip are all in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart). Map markers and fitting are in [rider_trip_map.dart](../apps/user/v1/lib/features/rides/widgets/rider_trip_map.dart).

**Contacts/actions:** [trip_actions_panel.dart](../apps/user/v1/lib/features/driver_operations/widgets/trip_actions_panel.dart). The page creates a `contactsOnly: true` instance for inline contact controls and a `hideContacts: true` instance for the remaining actions.

**Data:** `RiderTripController`; operational action context belongs to [TripActionsController](../apps/user/v1/lib/features/driver_operations/controllers/trip_actions_controller.dart).

## 5a. Arrived / ready to start

**Same page/panel**, status `DRIVER_WAITING`.

Changes to the assigned composition:

1. Title becomes “Your driver has arrived”.
2. Arrival strip shows “Your driver is waiting” and elapsed arrival time.
3. Driver/vehicle identity and endpoint timeline remain.
4. `TripActionsPanel` is displayed directly instead of being tucked into the Trip actions expansion.
5. Its start section shows the trip code and rider/driver verification state.
6. Rider confirmation uses the page's `_confirm()` handler.

**Edit the code/verification section in:** [trip_actions_panel.dart](../apps/user/v1/lib/features/driver_operations/widgets/trip_actions_panel.dart).  
**Confirmation dialog/handler:** `_confirm()` in [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart).  
**Business command:** `RiderTripController.confirm()`.

Rider confirmation and driver code verification are separate start proofs. The partner activation code is unrelated to this screen.

## 6. Ride in progress

**Same page:** [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart), status `IN_PROGRESS`.  
**Panel:** `RiderLivePanel` with `moving == true` in [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart).

Visible order:

1. Live map/remaining route to drop-off.
2. “On your way to your destination” title.
3. `RideArrivalStrip` with time-to-drop-off or stale-estimate feedback.
4. Smaller lower panel: `panelFraction: .34` in `_referenceJourney()`.
5. Compact `RideVehicleDriverCard` with driver/contact information.
6. `RideRouteProgress` for remaining versus total distance.
7. Trip actions and safety/support entry.

**Edit:** shared layout in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart); moving-panel contents in [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart); map behavior in [rider_trip_map.dart](../apps/user/v1/lib/features/rides/widgets/rider_trip_map.dart).

**Exit:** server-confirmed completion.

## 7. Completion / payment / rating

**Host:** [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart), `_referenceJourney()` completed branch.  
**Actual completion UI:** `RiderCompletionPanel` / `_CompletionState` in [rider_live_panel.dart](../apps/user/v1/lib/features/rides/widgets/rider_live_panel.dart).

Visible order:

1. `RideStagePanel` titled “You've arrived” with the completion status; back and refresh controls remain available.
2. Dismissible belongings reminder.
3. Vehicle image with overlapping driver avatar.
4. Driver name and vehicle identity.
5. Trip reference and completion time.
6. Star selection, optional comment and Submit rating, or saved-rating message.
7. Endpoint/trip facts surface: `RideEndpoints` + `RideTripFacts`.
8. `RideCostDetails`.
9. `TripActionsPanel` for applicable payment/review actions.
10. Back to Home and View receipt.
11. Safety/sharing/support.

**Rating callback:** `onRate` in the completed branch of [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart) → `RiderTripController.rate()`. The live completion panel has its inline rating controls; the historical detail path also has a separate `_RatingDialog`.

**Fare/payment presentation:** [ride_fare_summary.dart](../apps/user/v1/lib/features/rides/ride_fare_summary.dart) and [ride_glass.dart](../apps/user/v1/lib/features/rides/widgets/ride_glass.dart). Completion and recorded payment receipt remain separate states.

## Supporting pages, sheets and dialogs

These are opened from the journey rather than extra mandatory booking steps.

| Surface                                              | Exact class / symbol                                               | File / data owner                                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancel ride                                          | `TripCancellationDialog`; page `_cancel()`                         | [trip_cancellation_dialog.dart](../apps/user/v1/lib/features/rides/widgets/trip_cancellation_dialog.dart); [ride_feedback_controller.dart](../apps/user/v1/lib/features/rides/controllers/ride_feedback_controller.dart)                                      |
| Rider start confirmation                             | `_confirm()`                                                       | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart); `RiderTripController`                                                                                                                                                |
| Trip chat                                            | `TripChatPage`, route `/trip-chat`                                 | [trip_chat_page.dart](../apps/user/v1/lib/features/driver_operations/pages/trip_chat_page.dart); [TripChatController](../apps/user/v1/lib/features/driver_operations/controllers/trip_chat_controller.dart)                                                   |
| Driver call / UPI / payment receipt / review actions | `TripActionsPanel`, `_call()`, `_payUpi()`, `_payReviewedCharge()` | [trip_actions_panel.dart](../apps/user/v1/lib/features/driver_operations/widgets/trip_actions_panel.dart); `TripActionsController`                                                                                                                            |
| Safety/help/sharing                                  | `TripSafetySheet`; page `_safety()`                                | [trip_safety_sheet.dart](../apps/user/v1/lib/features/rides/widgets/trip_safety_sheet.dart); [TripSafetyController](../apps/user/v1/lib/features/rides/controllers/trip_safety_controller.dart)                                                               |
| Trip issue/dispute form                              | `TripSupportDialog`                                                | Same `trip_safety_sheet.dart`                                                                                                                                                                                                                                 |
| Configured support contacts                          | `SupportContactCard`                                               | [support_contact_card.dart](../apps/user/v1/lib/features/support/widgets/support_contact_card.dart); [SupportContactController](../apps/user/v1/lib/features/support/controllers/support_contact_controller.dart)                                             |
| Receipt sheet                                        | `TripReceiptSheet`; page `_receipt()`                              | [trip_receipt_sheet.dart](../apps/user/v1/lib/features/rides/widgets/trip_receipt_sheet.dart)                                                                                                                                                                 |
| Historical rating dialog                             | `_RatingDialog` / `_RatingState`; `_rate()`                        | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart); `RideRatingController` in `ride_feedback_controller.dart`                                                                                                            |
| Failed/cancelled/no-driver outcome                   | `_content()`, `RideOutcomePanel`, `RideActivityTimeline`           | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart); [ride_outcome.dart](../apps/user/v1/lib/features/rides/widgets/ride_outcome.dart)                                                                                    |
| Historical ride details                              | `RideDetailPage._content()`                                        | [ride_detail_page.dart](../apps/user/v1/lib/features/rides/pages/ride_detail_page.dart); same `RiderTripController`                                                                                                                                           |
| My Rides list / history filters                      | `RidesPage`, `RideHistoryCard`, `RideHistoryFilters`               | [rides_page.dart](../apps/user/v1/lib/features/rides/pages/rides_page.dart); [ride_glass.dart](../apps/user/v1/lib/features/rides/widgets/ride_glass.dart); [ride_history_filters.dart](../apps/user/v1/lib/features/rides/widgets/ride_history_filters.dart) |
| Login / active-trip recovery                         | `SessionGate`, `SessionController.resolveDestination()`            | [session_gate.dart](../apps/user/v1/lib/features/auth/pages/session_gate.dart); [session_controller.dart](../apps/user/v1/lib/features/auth/controllers/session_controller.dart)                                                                              |

A completed ride opened from history can render the **historical detail** composition rather than the live completion composition. The choice is in `RideDetailPage.build()`, using `active`, `liveJourney` and status. [RideDetailIntent](../apps/user/v1/lib/features/rides/ride_detail_intent.dart) carries receipt/live-presentation intent.

## Shared appearance: change these to update several stages together

| What you want to change                                                    | Exact implementation                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colors, base text theme, buttons, surfaces, page/sheet style               | `RideTokens`, `SolidTheme`, `SolidScope`, `SolidSurface`, `SolidIconButton`, `SolidButton`, `SolidSheet`, `SolidPage` in [solid_ui.dart](../apps/user/v1/lib/components/ui/solid_ui.dart)                                                       |
| Shared black-header/white-content stage parent                            | `RideStagePanel` and `RideArrivalStrip` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart)                                                                                                    |
| Map controls, draggable stage panel sizing and map inset                   | `RiderFlowScaffold` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart)                                                                                                                      |
| Vehicle/driver card sizing and arrangement                                 | `RideVehicleDriverCard` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart)                                                                                                                  |
| Vehicle/avatar image rendering                                             | `RideFlowImage` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart)                                                                                                                          |
| Black ETA/waiting strip                                                    | `RideArrivalStrip` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart)                                                                                                                       |
| Pickup/drop-off vertical timeline                                          | `RideRouteTimeline` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart)                                                                                                                      |
| Journey progress indicator                                                 | `RideRouteProgress` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart)                                                                                                                      |
| Driver-search graphic                                                      | `DriverSearchRadar` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart)                                                                                                                      |
| Heading and loading placeholders                                           | `RiderFlowHeading`, `RideFlowSkeleton` in [rider_flow_components.dart](../apps/user/v1/lib/features/rides/widgets/rider_flow_components.dart); `RidesSkeleton` in [ride_glass.dart](../apps/user/v1/lib/features/rides/widgets/ride_glass.dart) |
| Maps, route lines, location markers and camera fitting after booking       | `RiderTripMap` / `_RiderMapState` in [rider_trip_map.dart](../apps/user/v1/lib/features/rides/widgets/rider_trip_map.dart)                                                                                                                      |
| Main Home/location map and marker drawing                                  | Map/pin methods in [home_page.dart](../apps/user/v1/lib/features/home/pages/home_page.dart)                                                                                                                                                     |
| Endpoint summaries, fact rows, cost rows, history cards                    | `RideEndpoints`, `RideFact`, `RideTripFacts`, `RideCostDetails`, `RideStatusBadge`, `RideHistoryCard` in [ride_glass.dart](../apps/user/v1/lib/features/rides/widgets/ride_glass.dart)                                                          |
| Search/payment dropdown component                                          | [glass_dropdown.dart](../apps/user/v1/lib/components/ui/glass_dropdown.dart); keep solid-theme behavior when used in this flow                                                                                                                  |

The filename **ride_glass.dart** is historical. It contains actively used endpoint/fact/cost/history widgets. Its name does not mean those widgets should be redesigned with glass. The current source of design rules is [MOBILE_DESIGN.md](../apps/user/v1/MOBILE_DESIGN.md).

## Demo: where its screens and dummy records live

Entry: **rider Home → Demo → Ride booking flow**.

| Responsibility                                                                            | File                                                                                                          |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Home Demo button and flow-list bottom sheet                                               | [demo_launcher.dart](../apps/user/v1/lib/features/demos/widgets/demo_launcher.dart)                           |
| Flow IDs, titles and descriptions                                                         | [demo_registry_controller.dart](../apps/user/v1/lib/features/demos/controllers/demo_registry_controller.dart) |
| Scoped Navigator, route-to-page mapping, stage selector / Next / Restart / Close          | [ride_demo_host.dart](../apps/user/v1/lib/features/demos/pages/ride_demo_host.dart)                           |
| Dummy profile, places, categories, quotes, vehicles, routes, trip context and transitions | [ride_demo_controller.dart](../apps/user/v1/lib/features/demos/controllers/ride_demo_controller.dart)         |
| Source injection contract                                                                 | [data_source_scope.dart](../apps/user/v1/lib/core/state/data_source_scope.dart)                               |

Search `RideDemoStep`, `preview()`, `next()`, `restart()`, `contextData`, `quote`, `vehicleFor()` and `request()` in the demo controller.

For UI changes, edit the production files in sections 1–7. For dummy names/prices/statuses/locations, edit the demo controller. Do not create another searching/pickup/completion page just for the demo.

## Routes and files that can be misleading

- [core/routes.dart](../apps/user/v1/lib/core/routes.dart) maps `/home` to `HomePage`, `/ride-detail` to `RideDetailPage`, `/rides` to history, and `/trip-chat` to chat.
- Location selection and vehicle selection are pushed as `MaterialPageRoute` instances from Home. They do not need separate named-route entries.
- `AppRoutes.search = '/search'` and `AppRoutes.ride = '/ride'` are declared constants but are not entries in the current named-route map. They are not the new booking screens.
- [booking_review_sheet.dart](../apps/user/v1/lib/features/rides/widgets/booking_review_sheet.dart) contains the older `BookingReviewSheet`. Source search found no caller outside that file; it is not a step in the current vehicle → finding-driver flow.
- Earlier plans use conceptual names such as `RiderMapCanvas`, `CompactRouteEntry` and `NearbyPlaceStrip`. Those are planning labels, not the concrete class names to search for now. Use this report's actual symbols.
- The driver operational ride screen is [driver_trip_page.dart](../apps/user/v1/lib/features/driver_vehicles/pages/driver_trip_page.dart), `DriverTripPage`. It is not the rider booking screen, despite sharing operational widgets.

## Transport and data files

| Responsibility                                                                          | Source                                                                                                    |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Rider profile, places, quote, booking, start confirmation and rating requests           | [user_app.repo.dart](../apps/user/v1/lib/features/user_app/user_app.repo.dart)                            |
| Trip context, rider remaining route, messages, contact/payment and operational requests | [driver_operations.repo.dart](../apps/user/v1/lib/features/driver_operations/driver_operations.repo.dart) |
| Formatting, status lists, coordinate/geometry helpers                                   | [ride_display.dart](../apps/user/v1/lib/features/rides/ride_display.dart)                                 |
| Shared controller lifecycle                                                             | [feature_controller.dart](../apps/user/v1/lib/core/state/feature_controller.dart)                         |
| Route visibility observer                                                               | [route_observer.dart](../apps/user/v1/lib/core/route_observer.dart)                                       |

## Existing tests to use while changing this flow

All paths below start at `apps/user/v1/test/features/`.

| Area                                                          | Test file                                  |
| ------------------------------------------------------------- | ------------------------------------------ |
| Demo source isolation, stages and production-page reuse       | `demos/ride_demo_test.dart`                |
| Category/passenger selection and booking navigation           | `rides/vehicle_selection_test.dart`        |
| Booking retry/idempotency controller                          | `rides/rider_booking_controller_test.dart` |
| Solid assigned-screen composition and text scale              | `rides/rider_solid_reference_test.dart`    |
| Search, trip context, route/start/payment regression coverage | `rides/phase_c_test.dart`                  |
| History/receipt/reference content mapping                     | `rides/ride_reference_mapping_test.dart`   |
| Restored trip navigation                                      | `rides/ride_recovery_test.dart`            |

This report maps source code; it does not claim new device or provider verification. No app behavior was changed to create it.

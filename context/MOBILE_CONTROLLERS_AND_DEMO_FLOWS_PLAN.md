# Mobile controllers and demo flows

Date: 8 November 2026
Status: implemented and verified locally; device acceptance tracked below.

## Accepted request

Home gets one Demo button. It opens a reusable bottom-sheet flow registry, initially containing Ride booking flow. The demo drives the production Home/location/vehicle/search/pickup/ongoing/completion widgets with controller-owned fixture data. No duplicate demo screens, real bookings, account writes, contacts, payments or uploads.

Production and demo records belong in controllers. Pages own navigation, focus, text-editing handles, animation/map handles and presentation-only expansion state. Repositories retain transport. Existing Flutter ChangeNotifier controllers are used; no new state-management dependency is needed.

## Tasks

- [x] Inventory every mobile page and data-owning form/widget.
- [x] Add reusable controller lifecycle / async state foundations.
- [x] Extract Home/location data and effects into controller.
- [x] Extract quote/category/availability/passenger/payment selection into controller.
- [x] Extract rider trip snapshots, route freshness, polling and mutations into controller.
- [x] Add demo-only fixture controller and repository adapters with no real-network fallthrough.
- [x] Add extensible demo registry and Home bottom-sheet launcher.
- [x] Reuse real routes/pages in demo, including back navigation and restart.
- [x] Add demo stage controls for deterministic search, assignment, arrival, start and completion; stop all demo activity on exit.
- [x] Migrate account/settings/profile/notifications/emergency/payment/support data ownership.
- [x] Migrate saved-place lists/details/picker/directions data ownership.
- [x] Migrate driver account/finance/documents/fleet/operations/chat data ownership.
- [x] Migrate onboarding/activation/exit/catalog/vehicle form data ownership.
- [x] Add regressions for source isolation, fixture transitions, controller disposal, retry and unchanged production routing.
- [x] Final Flutter analyzer, full tests, formatting and whitespace checks.
- [x] Update architecture/design instructions and record remaining device-only acceptance.

## Rules for review

1. Fixture maps, example names, geometry, quotes and transition scripts live only under demo controllers/data adapters.
2. Production views never branch into alternative demo layouts. They read the same controller contract and invoke the same actions.
3. Demo transitions are deterministic and manually adjustable. A persistent labelled demo control surface is outside the production page composition.
4. Session/account scope, protected-route recovery, quote expiry, idempotency, GPS freshness, dual trip-start proofs and private media behavior remain intact for real data.
5. Controllers ignore late replies after disposal/query change and avoid duplicate polling on covered/background routes.
6. Audit findings and unfinished migrations are recorded explicitly; moving a page file or renaming State does not count as separating data from UI.

## Initial findings

The app declares flutter_bloc but has no implemented Bloc/Cubit layer. One ChangeNotifier booking controller exists. Numerous pages currently own API snapshots, lists and query state inside Flutter State; 141 repository/call references were found across features. This requires a staged code migration, not a global rename.

## Verification record


- Analyzer: clean after extraction; final verification runs below.
- Initial full suite: **174 passed**.
- Expanded demo suite: **5 passed**, including launcher → production Home, category → real booking action → production search, assignment preview, restart/disposal and transport isolation.
- A subsequent full run caught an eager auth-client initialization introduced by the login extraction. Repaired by lazy initialization: displaying Login again does not initialize networking or require environment access.
- The demo's realistic vehicle preview exposed a 9 px overflow in the fixed-height preview carousel. It now sizes to its content.
- Final full suite: **175 tests passed**. Targeted recheck after the last demo-only adjustment: **5 tests passed**.
- Final `flutter analyze --no-pub`: **no issues found**. Changed Dart files formatted; `git diff --check` passed. No APK build, dependency/toolchain update, database write or release was performed for this task.

## How to use

1. Open rider Home and tap **Demo**.
2. Select **Ride booking flow** in the bottom sheet.
3. Use the normal pickup/drop-off, category, passenger, payment preference and booking controls. The production pages receive local responses through their usual repositories/controllers.
4. **Next** simulates the next external event. The stage menu can jump directly to Home, Locations, Vehicles, Finding driver, Assigned, Arriving, Arrived/start code, In progress, Completed, Cancelled or No driver found.
5. Confirm/rate/chat/cancel actions update only this demo's controller. Live driver actions are simulated through the stage controls.
6. **Restart** restores fixture state. **Close** disposes the local session and returns to the original app. Nested Back navigation stays inside the flow.
7. Stage controls sit outside the production page composition.

## Screen/component inventory and ownership

| Production screen/component | Controller | Owned records/state |
| --- | --- | --- |
| Home and location selection | HomeController | Endpoints, location, saved/community suggestions, routes, profile, travel context |
| Vehicle/category selection | VehicleSelectionController + RiderBookingController | Quotes, availability, category, passengers, payment preference, note, frozen retry payload/key |
| Rider live/history trip detail | RiderTripController | Verified trip snapshot, clock/freshness, remaining route, polling and trip mutations |
| Ride history and filter sheet | RideHistoryController / RideHistoryFilterController | History, pagination/search/filters and category options |
| Rating / cancellation dialogs | RideRatingController / TripCancellationController | Score/reason and canonical cancellation reason options |
| Trip help | TripSafetyController / SupportContactController | Account/contact snapshots; external sharing policy |
| Trip chat and action panel | TripChatController / TripActionsController | Messages, sender, immutable send retry key, action context and collection selection |
| Login and session recovery | LoginController / SessionController | Login command/busy state, destination resolution and recovery Future |
| Settings, role switch, profile | SettingsController / AppModeController / ProfileController | Account, role/preference, profile snapshot and refresh state |
| Notifications | NotificationsController | Notifications and selected filter |
| Emergency contacts / payment methods | EmergencyContactsController / PaymentMethodsController | Contact/method collections and mutation/load state |
| Support list / request / conversation | SupportController / SupportRequestController / SupportTicketController | Tickets, request key/priority, participant and conversation data |
| Saved places map/list | SavedPlacesController | Places, selected entity, search/filter/page/total and query generation |
| Place detail/reviews/directions | PlaceDetailController / PlaceReviewController / PlaceDirectionsController | Place/reviews, review score, directions/GPS origin |
| Place picker/save/legacy editor | PlacePickerController / PlaceSaveController / SavedPlaceEditorController | Coordinates, search/reverse results, photos, field selections and retry state |
| Driver dashboard / trip | DriverHomeController / DriverTripController | Dashboard, trip/offers, navigation target/progress and tracking state |
| Driver history / finances / account | DriverTripsController / DriverFinancesController / DriverAccountController | History, ranges, pagination, account and requested changes |
| Driver documents / fleet / registration gate | DriverDocumentsController / DriverVehiclesController / DriverVehicleGateController | Private document/fleet data and eligibility |
| Vehicle registration / catalog picker / suggestion | VehicleRegistrationController / CatalogSelectorController / CatalogSuggestionController | Registration, document buffers/paths/keys, categories, brand/model and logo selection |
| Payout changes | PayoutChangeController | Request key, submission/retry/error state; inputs remain TextEditingControllers |
| Partner application / address selection | PartnerProgramController / PartnerAddressController | Workflow validation, answers, files, draft/upload identifiers, policy/confirmation acceptance, postal options |
| Activation / exit | ActivationController / DriverExitController | Activation command, exit record/version and refresh state |
| Demo sheet and fixture session | DemoRegistryController / RideDemoController | Flows, dummy profiles/places/quotes/vehicles/geometry and scenario transitions |

Controllers are separate classes without BuildContext, navigation or page widgets. Existing pages retain typed forwarding accessors where needed to preserve their event handlers. The underlying records belong to the controller instance. TextEditingControllers remain input controllers; view State retains focus, scrolling, native picker handoffs/recovery, map handles/render caches, dialog visibility and animation state. Native capture/image-memory safeguards were preserved.

This is a data-ownership migration. Some existing view event coordinators still assemble temporary command payloads or coordinate draft/native callbacks with the controller's injected repository. New business actions should be controller commands.

## Adding another demo flow

1. Add its metadata/ID to DemoRegistryController.
2. Add a controller containing its sample records, state changes and an allowlisted local transport implementation.
3. Route its ID from DemoLauncher to a scoped host. Supply existing repositories/controllers through a data source scope.
4. Reuse production pages. Do not add a demo copy, inline sample response in a page, or a global fake-mode flag.
5. Add isolation, navigation and disposal regressions.

## Isolation and lifetime

DemoTransport **implements** the real client interface and never delegates to the real Dio singleton. Unimplemented calls throw a disabled-action error. The demo cannot use real tokens, mutate secure storage, make a booking on the API, upload documents, collect money or call a real driver. Driver contact/payment mutations are blocked by the transport. WhatsApp launch from trip help is blocked by the controller; copying the sample summary remains an explicit local action.

MapLibre still uses the existing map style/tile provider. This is not an offline tile package. Demo location/route responses are simulated; GPS permission/location-service business calls are skipped by HomeController's simulated source.

The host has its own Navigator and RouteObserver. Covered rider trip pages pause polling; controllers ignore late asynchronous updates after disposal. Demo state is discarded on Close and never saved to account storage.

## Device acceptance still pending

- [ ] Run the demo on a phone with MapLibre rendering, gestures, keyboard and system Back.
- [ ] Compare each stage visually at the tester's preferred size and adjust shared production components.
- [ ] Check background/resume during demo chat and map interaction.
- [ ] Exercise actual Google login, camera/document picker and driver GPS on hardware. Widget/fake transport tests do not prove provider/device behavior.

## Driver demo — 11 November 2026

Home's registry now includes **Driver ride flow**. `DriverDemoController` extends the scoped sample source and drives production `DriverRequestPage` / `DriverTripPage` through Request, Arriving, At pickup/QR, In progress, Payment and Completed. A simulated tracking adapter implements the tracking contract without accessing real GPS or uploading location. Real trip pages receive the injected repository in nested `TripActionsPanel` controls as well. Manual code: 162904. Vehicle identity is preserved while the counterparty profile switches to the passenger. Detailed acceptance tracker: `DRIVER_RIDE_FLOW_UI_REWORK.md`.

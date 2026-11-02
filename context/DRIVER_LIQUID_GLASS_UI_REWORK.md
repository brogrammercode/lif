# Driver liquid-glass UI rework

## Objective

Bring every current driver-mode route, state and reusable driver widget into the mobile design system defined by [`MOBILE_DESIGN.md`](MOBILE_DESIGN.md), without changing driver authorization, vehicle eligibility, polling, GPS, trip transitions, payment rules or route recovery.

The driver experience remains part of the single rider/driver Flutter binary. It has no bottom navigation. MapLibre remains the map provider and the map canvas stays visually clear while controls use bounded glass overlays.

## Complete screen inventory

| Area | Screen / route | Content placement and visual treatment | Status |
| --- | --- | --- | --- |
| Entry | `DriverVehicleGate` at driver-home entry | Ambient glass skeleton; glass error/retry; routes eligible drivers to the map and blocked drivers to vehicles | Complete |
| Entry | `PartnerActivationPage` — `/partner-program/activation` | Approval hero, six-digit glass input, lock guidance and dark activation action | Complete |
| Vehicles | `DriverVehiclesPage` — `/driver/vehicles` | Readiness hero, vehicle identity, status badge, field review/rejection feedback and explicit selection/registration actions | Complete |
| Vehicles | `VehicleRegistrationForm` | Calm vertical sections, glass inputs/selectors, full-width uploads, local previews, review notes and dark submit | Complete |
| Catalog | `CatalogSelector` | Glass search, logo identity rows, status badges, matching skeleton/pagination and suggestion action | Complete |
| Catalog | `CatalogSuggestionForm` | Brand/model context hero, glass fields, vertical logo upload, local preview and requested-state guidance | Complete |
| Operations | `DriverHomePage` — `/driver/home` | Map-first canvas, floating profile/help, compact availability capsule and bottom status/offer workspace panel | Complete |
| Operations | Driver offer card | Fare/distance hierarchy, pickup/drop-off rows, live/expired badge and explicit accept/decline | Complete |
| Operations | `DriverTripPage` — `/driver/ride-detail` | Clear map, glass navigation overlay, draggable glass trip sheet and stable loading/error/busy states | Complete |
| Operations | `TripActionsPanel` | Contact/start/payment/cancellation/review controls grouped within the trip sheet; glass dropdown/dialogs/actions | Complete |
| Operations | `TripChatPage` — `/trip-chat` | Privacy note, contrasting glass message bubbles, list skeleton/empty/error states and glass composer | Complete |
| History | `DriverTripsPage` — `/driver/rides` | Count/page hero, compact route cards, status/fare/time metadata and glass pagination | Complete |
| Account | `DriverAccountPage` — `/driver/account` | Glass tabs and hierarchy for account, payout, requests and safety/help | Complete |
| Account | Payout change form | Glass field wells, contextual validation, stable attempt state and dark submit | Complete |
| Account | `DriverDocumentsPage` | Private-document hero, vehicle identity/status, field review/rejection context and preview/replace dialogs | Complete |
| Finance | `DriverFinancesPage` — `/driver/finances` | Glass period chips, statement summary, transactions, empty/error/loading states and pagination | Complete |
| Exit | `DriverExitPage` — `/driver/exit` | Exit/settlement hero, status and dues hierarchy, correction, PDF download and confirmation | Complete |

## Shared driver widgets

| Widget | Responsibility | Status |
| --- | --- | --- |
| `DriverStatusPill` | Consistent semantic statuses | Complete |
| `DriverPageIntro` | Icon well, title, concise description and optional context | Complete |
| `DriverLinkTile` | Shared glass navigation/entity row | Complete |
| `DriverInfoRow` | Compact label/value metadata | Complete |
| `DriverNotice` | Information, warning/error and optional retry/action | Complete |
| `DriverListSkeleton` | Destination-shaped list/summary loading | Complete |
| `DriverMap` | MapLibre route, markers, manual location and attribution; intentionally not blurred | Retained and integrated |
| `AppEmptyState` / `AppLoadError` | Glass variants inside `LiquidGlassScope` | Complete |

## Rules applied

- Screen order is context hero, current state, actionable records and secondary workspace links.
- Status, vehicle, fare, route and review content is server-backed; no mock data was introduced.
- Maps remain readable; blur is limited to bounded overlays and sheets.
- Primary transitions use dark glossy glass actions. Secondary and destructive choices remain subordinate.
- Loading follows the destination layout. Circular page loaders and changing-size busy controls are removed from driver routes.
- Error, empty, stale-GPS, rejection and retry states remain explicit and usable on short screens and with large text.
- Dropdowns remain on the shared glass dropdown; catalogs keep dedicated search routes.
- Image/document selection remains local until intended submission and preserves permission/validation behavior.
- Polling, foreground checks, idempotent actions, tracking, ownership and active-trip recovery were not weakened.

## Second-pass consistency and resilience audit

- Driver summaries and metadata now reflow vertically on narrow screens and at 200% text scaling instead of forcing status pills into overflowing rows.
- The live-trip navigation overlay is height-bounded and scrollable, so long directions, GPS errors and accessibility text cannot overflow the map stack.
- Trip status, nearby-offer review and trip-return actions now use the same bounded glass surfaces and controls as the rest of driver mode.
- Dashboard and in-trip offers are decoded defensively. Malformed list entries are ignored and malformed response envelopes become readable errors instead of runtime cast crashes.
- Driver account, operations and vehicle repositories validate response shapes before conversion. Vehicle registration also verifies its account identity before creating an account-scoped draft key.
- Vehicle-document and trip-card headers use responsive shared metadata rows so long status labels remain usable.

## Verification tracker

- [x] Enumerated every registered driver route and driver-owned widget.
- [x] Reworked legacy flat page surfaces, circular page loaders, dialogs and filled-tonal controls in driver routes.
- [x] Added shared driver glass primitives instead of duplicating page styling.
- [x] Preserved MapLibre attribution and route/marker behavior.
- [x] Formatted all affected Flutter files.
- [x] Scanned driver sources for legacy circular/linear loaders, native chips/dialogs and flat page colors.
- [x] Final `flutter analyze` after all edits.
- [x] Driver operations, navigation/tracking, account and vehicle regression suites (41 tests, including narrow-screen 200% text scaling).
- [x] Partner onboarding/category/upload/glass regression suite that feeds driver activation (34 tests).
- [ ] Physical-device acceptance: short/tall screens, text scaling, keyboard, GPS recovery, gestures, camera/file selection and paired trip.

Physical-device acceptance remains required because static analysis cannot prove map/plugin/native-intent behavior.

# User application liquid-glass completion audit

Updated: 2 November 2026

## Objective

Apply the mobile design authority in `context/MOBILE_DESIGN.md` to every reachable rider, shared and driver surface in the single Flutter application. Preserve one role-based binary, MapLibre, session and active-trip recovery, account-scoped data, server-backed content and all existing business gates. No bottom navigation or legacy drawer is part of the application.

## Complete screen inventory

| Journey | Screen/state | Content placement | Status |
| --- | --- | --- | --- |
| Startup | Session restoration gate | Centered 1More identity and destination-shaped glass skeleton; bounded retry card on failure | Complete |
| Authentication | Google sign-in | Brand header, route visual, concise product value, feature context and one dark glass Google action | Complete |
| Rider home | Map and location state | Clear MapLibre canvas, bounded profile/notification/location controls and honest location/search feedback | Complete |
| Rider booking | Pickup/drop-off search | Bottom glass workspace, expandable route fields, bounded glass suggestions and map-pick marker | Complete |
| Rider booking | Category and payment selection | Server category image/name/capacity/ETA/fare cards, selected state, shared payment dropdown and explicit booking action | Complete |
| Rider booking | Review/confirmation sheet | Route timeline, category/fare facts, quote validity, direct-payment choice, note and idempotent confirmation | Complete |
| Active/history | My Rides | Glass tabs, filters, search, cards, pagination, skeleton/error/empty and retained refresh | Complete |
| Active/history | Trip details | Map/date, endpoints, real identity/metrics, fare/collection, activity and contextual actions | Complete |
| Active/history | Receipt, cancellation, rating and safety | Bounded glass sheets/dialogs, shared chips, honest payment/support semantics | Complete |
| Places | Saved Places map | Full MapLibre canvas, glass search/filter controls, synchronized pins and equal-size carousel | Complete |
| Places | Place picker/editor | Map selection, chosen-location preview, glass details form and final-submit-only photos | Complete |
| Places | Place details/directions | Map, identity, gallery, real visitors/actions/reviews and in-app route preview | Complete |
| Account | Settings | Profile hero, five primary glass tiles, mode switch, account actions and no bottom navigation | Complete |
| Account | Personal profile | Identity hero, linked-account explanation, validated personal form and stable save action | Complete |
| Account | Notifications | Counts, All/Unread controls, semantic notification rows and destination navigation | Complete |
| Safety | Emergency contacts | Purpose intro, E.164 add/edit, call/action sheet, remove confirmation and empty/error states | Complete |
| Support | Help and support | Configured channels, requests, create form, states and retry/empty handling | Complete |
| Support | Request conversation | Request identity/status, participant-aligned messages and reply composer | Complete |
| Payments | Payment methods | Direct cash/driver-UPI policy, saved provider summaries and safe add/remove explanations | Complete |
| Partner | Policy, application categories and uploads | Rich policy, category steps, contextual hints, vertical local previews and resilient final submission | Complete |
| Partner | Submitted/corrections/confirmation/final document | Field review, rejection reasons, document consent, PDF result and activation handoff | Complete |
| Partner | Driver activation and exit | Approval/code entry plus exit/dues/settlement document states | Complete |
| Driver | Vehicle gate, fleet, form and catalogs | Glass eligibility states, vehicle review, requested catalogs, uploads and approval feedback | Complete |
| Driver | Map home, offers and active trip | Map-first bounded glass controls, responsive trip sheet, tracking and server transitions | Complete |
| Driver | Trips, account, documents, finance and chat | Shared intros/statuses/metadata, destination skeletons and compact glass records | Complete |

## Code-level route inventory

Every registered route was traced to its current screen, including the screens opened with direct `Navigator` pushes rather than a named route.

| Route or push | Screen | Main glass composition |
| --- | --- | --- |
| `/` | `SessionGate` | Identity, destination skeleton and bounded recovery state |
| `/login` | `LoginPage` | Brand/route hero, feature pills and focused sign-in panel |
| `/home` | `HomePage` | Clear MapLibre map, bounded controls and bottom booking workspace |
| `/profile` | `ProfilePage` | Identity hero and validated personal-information form |
| `/settings` | `SettingsPage` | Profile hero, navigation tiles, mode and account actions |
| `/rides` | `RidesPage` | Glass tabs/filters, ride cards, retained refresh and pagination |
| `/ride-detail` | `RideDetailPage` | Trip map, route, identity, fare, activity and contextual actions |
| `/saved-places` | `SavedPlacesPage` | Map canvas, filters, pins and synchronized place carousel |
| direct push | `PlacePickerPage` / `PlaceSaveForm` | Map selection, selected-place card and explicit save form |
| direct push | `PlaceDetailPage` | Map, place identity, gallery, visitors, actions and reviews |
| direct push | `PlaceDirectionsPage` | In-app MapLibre route preview and place facts |
| `/notifications` | `NotificationsPage` | Counts, glass filters and semantic notification rows |
| `/emergency-contacts` | `EmergencyContactsPage` | Safety context, contacts and add/edit/remove dialogs |
| `/support` | `SupportPage` | Configured contacts, request list and create-request dialog |
| `/support-ticket` | `SupportTicketPage` | Request identity, message timeline and reply composer |
| `/payment-methods` | `PaymentMethodsPage` | Payment policy, provider summaries and safe account actions |
| `/partner-program` | `PartnerProgramPage` | Policy, category steps, uploads, review, confirmation and final states |
| `/partner-program/activation` | `PartnerActivationPage` | One-time activation-code handoff |
| `/driver/home` | `DriverHomePage` | Map-first availability, offers and active-trip workspace |
| `/driver/vehicles` | `DriverVehiclesPage` | Verification gate, fleet records and registration entry point |
| direct push | `VehicleRegistrationForm` | Brand/model/category, requested catalogs and document capture |
| `/driver/rides` | `DriverTripsPage` | Driver trip filters, records and retained refresh |
| `/driver/ride-detail` | `DriverTripPage` | Route, rider, payment, activity and driver transitions |
| `/trip-chat` | `TripChatPage` | Trip-scoped conversation and composer |
| `/driver/account` | `DriverAccountPage` | Driver identity, documents, payout, activity and exit links |
| direct push | `DriverDocumentsPage` | Reviewed personal and vehicle documents with replacement flow |
| `/driver/finances` | `DriverFinancesPage` | Earnings truth, statements and payout maintenance |
| `/driver/exit` | `DriverExitPage` | Exit request, dues and settlement-document states |

## Widget and surface inventory

| Area | Reusable widgets | Status |
| --- | --- | --- |
| Shared material | `LiquidGlassScope`, backdrop, surface, page, icon button, button, dialog, sheet and form skeleton | Complete |
| Shared controls | Glass dropdown/select, glass chip, scoped `AppCard`, `AppButton`, empty/error states and shimmer skeletons | Complete |
| Settings | Profile header, mode tile, intro, section heading, status pill, empty card and list skeleton | Complete |
| Rides | Status badge, endpoints, facts, fare details, history card, outcome, activity, maps and filter/review/support sheets | Complete |
| Places | Place card, review card, map markers, editor, image/contact/review components and saved-place skeletons | Complete |
| Partner | Rich document, address input, category/application skeleton, upload tile, contextual field guidance and draft recovery | Complete |
| Driver | Driver intro, status pill, link tile, metadata, notices, list skeleton, map and trip controls | Complete |

The modal/pushed surface audit also includes `BookingReviewSheet`, `TripReceiptSheet`, `TripCancellationDialog`, `TripSafetySheet`, `TripSupportDialog`, the ride rating dialog, emergency-contact editor, support-request editor, saved-place editor, catalog selector/suggestion form, payout change form, partner upload tiles and all vehicle registration upload fields.

## Removed competing implementations

- The unused legacy drawer was removed. Settings remains the only account/navigation workspace opened from the rider map.
- The unused dummy login implementation was removed. There is one maintained authentication screen.
- The retained legacy saved-address editor is test/compatibility code but now uses the same glass dialog, dropdown, skeleton and address-result surfaces.

## Consistency rules applied

- No native circular page loader, native Material chip, flat alert dialog, bottom navigation or drawer remains in application feature code.
- MapLibre canvases remain clear; glass is bounded to controls, sheets and error overlays.
- Loaded records remain visible during recoverable refreshes where the existing flow supports it.
- Busy actions retain size; skeletons represent the destination geometry.
- Forms use shared wells/dropdowns, 16–20 px spacing, readable errors and keyboard-safe scrolling.
- Primary actions use dark glass; status meaning always includes readable text or an icon.
- IDs, route ownership, active-trip recovery, local-before-submit media, payment truth and role gates remain unchanged.

## Verification tracker

- [x] Enumerate every named route and every pushed modal/detail page.
- [x] Audit shared and feature widgets for legacy loaders, chips, dialogs, drawer and bottom navigation.
- [x] Rework authentication, session restoration, rider home/booking, profile and remaining shared rider surfaces.
- [x] Retain previously completed Settings, Rides, Saved Places, Partner and Driver glass implementations.
- [x] Flutter analyzer after final source changes: no issues.
- [x] Full Flutter test suite: 163 tests passed.
- [x] Git whitespace and final legacy-pattern scan.
- [ ] Physical-device acceptance for native Google sign-in, MapLibre, keyboard, GPS, camera/file picker and external intents.

Physical-device acceptance is deliberately not marked complete by static analysis or widget tests.

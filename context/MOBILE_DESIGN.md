# 1More mobile design system

Current authority: 8 November 2026. This specification replaces the previous liquid-glass specification in full.

## Reference and scope

Profile/Settings reference (14 November 2026): `image 208.png` supplies content placement. Render its upper banner in black, with the solid white rounded body and neutral ride typography. Use role-specific 2×2 summary cards, compact grouped menu rows and a vehicle-brand avatar badge for driver mode. See `PROFILE_SETTINGS_REWORK.md` for the requested sections and temporary controller-owned sample data.

The visual authority is `C:/Users/harsh/Downloads/image 163.png`, the supplied assigned-driver screen. Match its solid surfaces, neutral typography, compact scale, white/black palette, blue category badge and blue map route. The screenshot shows a phone frame; the app renders the inner screen only. Do not reproduce the hardware frame, notch, status-bar pixels, sample identity or example map labels.

The user explicitly rejected glassmorphism. New screens and future mobile reworks follow this document. The current implementation scope is the complete rider ride flow, including Home, endpoint entry, vehicle selection, search, assigned/arrived, ongoing ride and completion. Other existing modules retain their implementation until explicitly migrated; they are not design references for new work. Admin continues to use its separate web design.

The seven-stage ride sequence remains unchanged. This update replaces its visual treatment, not server transitions or booking rules.

## Material rules

Ride action slider exception (11 November 2026): rider Home after both endpoints are selected and driver payment receipt use `RideSwipeButton`, following `C:/Users/harsh/Downloads/image 193.png`. Use a 40 px solid blue pill within a 48 px touch area, light blue rounded thumb with four white chevrons, and 12 px white inline text. Rider text is “Slide to continue”; driver text is “Slide to confirm payment”. Do not add the car, floating hint, or exposed track to these actions. The read-only destination progress bar retains its car treatment.

- Use fully opaque white sheets and cards. Black status strips and black circular contact controls are solid black.
- No backdrop blur, frosted inputs, translucent fills, pastel lighting, reflective rims, glossy gradients or oversized soft shadows.
- Cards use a fine neutral border and, only where needed, an almost imperceptible neutral shadow.
- The map remains clear and fills the space above the sheet. Sheets are edge to edge with rounded top corners.
- Reuse `components/ui/solid_ui.dart`: `SolidScope`, `SolidSurface`, `SolidButton`, `SolidIconButton`, `SolidSheet`, `SolidPage` and `RideTokens`.
- `SolidTheme` is captured by dialogs/sheets. Legacy shared trip controls must render solid when hosted within this scope. They must not reintroduce their old glass renderer inside a ride.
- Do not add a glass package or duplicate a visual primitive per feature.

## Palette

| Role | Color |
| --- | --- |
| Screen, sheet, card | #FFFFFF |
| Main text and controls | #101010 / #000000 |
| Secondary labels | #858585 |
| Dividers and fine card borders | #EEEEEE |
| Muted input background | #F5F5F5 |
| ETA pill on black strip | #333333 |
| Category badge and route accent | #4258ED |
| Handle | #CCCCCC |

Green/red/amber remain available for real success/error/review meaning. Do not turn primary ride actions green, navy or amber. Do not copy example reward/trophy claims. Blue belongs to the route, category badge and selected emphasis.

## Scale and typography

Use the platform's neutral sans-serif through `SolidScope`; the ride flow no longer inherits Outfit. The screenshot's font cannot be uniquely identified from its raster, so do not claim a licensed typeface match. Use regular/medium bodies and semibold titles, avoiding heavy headings.

| Element | Logical size / treatment |
| --- | --- |
| Top message pill | 14 px, semibold, centered |
| Black strip text | 14 px, regular/medium |
| ETA pill | 12 px, semibold |
| Vehicle plate | 20 px, bold/semibold |
| Make/model/color | 12 px, regular |
| Driver name | 16 px, semibold |
| Driver secondary label | 12 px, gray |
| Rating below avatar | 11 px, black with star |
| Route labels | 12 px, gray |
| Route addresses | 16 px, medium |
| General section heading | 18–20 px |
| Primary action | 14–15 px, semibold |

Use logical pixels rather than multiplying every element by screen width. Standard body text is 14 px with approximately 1.35 line height. Respect system text scaling; grow/scroll content instead of clipping names or addresses. The reference hierarchy must remain recognizable on 320 px phones.

## Geometry and spacing

- At a normal portrait phone size, the assigned screen's map occupies about the upper 52–56%; the black strip and white sheet occupy the remainder.
- Initial assigned white sheet is approximately 43% of available height, with a 54 px black ETA strip directly above it. The ongoing sheet is smaller.
- Sheet top radius: 18 px. Vehicle card radius: 12 px. Message/category/ETA pills: fully rounded.
- Sheet side padding: 20 px; vehicle card padding: 12–14 px.
- Vehicle card precedes the driver row by 16 px. Driver row precedes the divider/route block by 16–20 px.
- Handle: approximately 36 × 3 px with 9 px vertical margins.
- Vehicle visual: approximately 108 × 66 px, contained, never cropped into a square avatar. Category badge overlays its lower-right area.
- Driver avatar: about 48 × 48 px with softly rounded corners; rating sits immediately below it.
- Contact circles: visually about 36–40 px, with at least a 44 px interactive target. White line icons on black.
- Primary buttons: minimum 48 px high, radius 14 px, solid black with white text. Busy state retains geometry.
- Keep additional trip controls collapsed below the main reference content, except required start verification or actionable failure feedback.

## Assigned driver screen — exact content hierarchy

1. Map from the top safe area to the ETA strip. Use the configured MapLibre map, actual coordinates and blue route.
2. Centered opaque white message pill: Get ready, the driver will come soon. Change the wording for arrived/in-progress states.
3. Coordinate-anchored vehicle marker and actual driver label. The vehicle must not float at screen center. Keep route endpoints, attribution and recenter available.
4. Black ETA strip, above the sheet: hourglass icon, arrival label on the left and dark-gray time pill on the right.
5. White sheet with small gray handle.
6. Fine-bordered vehicle card: plate on left, make/model/color under it; contained vehicle photo on right with blue category badge.
7. Driver row: avatar/rating left, actual name and real rating context center, round call/chat actions right.
8. Light divider.
9. Pickup/destination timeline: black pickup circle and destination pin, light connector; gray labels above black addresses.
10. Start code and rider confirmation appear when the server reports arrival. Secondary safety/cancel/support controls remain accessible below the main composition.

Never show Top Rated Driver, trophies, unread-message badges, exact ETAs or photos unless backed by actual data. An unrated driver reads Unrated. Missing photos have a restrained type-appropriate icon, not an unrelated stock car.

## Remaining ride screens

| Stage | Required composition |
| --- | --- |
| Home | Clear map, small profile/control buttons, actual place-photo strip, shared black-header/white-content panel with pickup/drop-off and Continue |
| Location selection | Map above the same joined black-header/white-content panel; compact gray input wells; readable suggestions; explicit map selection and confirmation |
| Vehicle selection | Route map, shared stage panel, dynamic category tiles, white vehicle/driver previews, passenger control, payment/note and booking action |
| Finding driver | Route map and shared stage panel; bounded blue radar illustration, elapsed/search status, cancellation below |
| Pickup/arrived | Shared black ETA header and white sheet with assigned-driver identity, route and honest waiting/start verification states |
| In progress | Clear route map, same stage panel with remaining-time header, compact driver/vehicle/contact row and restrained blue progress track |
| Completion | Same black-header/white-content stage parent, belongings reminder, real driver/vehicle hero, trip reference/date, inline stars, compact route/fare/payment summary, Home and receipt actions |

Vehicle Continue submits directly into matching. Do not restore a compulsory review detour. Preserve the distinction between a nearby preview and an accepted driver. Pre-booking identity/locations remain limited to the approved public projection.

## Maps

Retain MapLibre and the existing configured free map source. Do not change provider to imitate foreign map labels. Use blue route strokes, black/white endpoint markers and a small top-down vehicle marker. Attributions stay visible above overlays. Never fabricate traffic, driver motion, nearby vehicles or route progress.

Fit actual endpoints and driver location into the visible map area with panel-aware padding. Recenter is an opaque white circular button near the lower-right map edge. Preserve medium coordinate-anchored markers, real GPS freshness, three-second search settling and 3–5-second drag settling. No automatic first-drag location confirmation.

## Forms, menus and modal surfaces

Use gray/white solid input wells with 12 px corners, small labels and clear focus/error treatment. Menus and dialogs use opaque white with thin gray boundaries; selected options use a subtle neutral fill/check. Preserve option IDs, dependent resets, disabled states, validation and menu search.

Shared legacy dropdown logic may remain, but its rendering within `SolidTheme` must contain no blur or reflective rim. Preserve keyboard bounds and large-text scrolling. Modal layers capture the solid scope. Buttons and validation remain visible when the keyboard opens.

## Loading, failure and accessibility

Skeletons match the new flat destination geometry; neutral placeholders never shimmer over an entire map. No circular page loaders. Reduced motion disables shimmer. Keep verified data visible on recoverable refresh failure and surface a concise retry message.

Back, refresh, call, chat and safety actions have labels/tooltips and at least 44 px targets. Names, plates, prices and addresses may wrap. Do not scale down text to force a reference-size card. Keep active-trip recovery and account/session changes correct. No bottom navigation.

## Business behavior to preserve

Preserve server fare calculation by actual category; quote expiry; immutable/idempotent booking retries; passenger capacity; actual assignment; verified arrival; rider confirmation plus trip code; cancellation/no-show reviews; Cash/Direct UPI and recorded receipt; private assets; session/role ownership; historical receipts and reviews.

A completed trip is not proof of payment. Opening UPI is not proof of receipt. Use View receipt unless a real ride PDF exists. Example passenger names, Toyota car, plate, foreign addresses and trophy labels in the reference are not seed data.

## Implementation and acceptance

Use shared primitives and data-bound compositions in `features/rides/widgets/rider_flow_components.dart` and `rider_live_panel.dart`. Keep transport and booking logic in repositories/controllers. Historical documents with glass instructions are superseded for new design work by this document.

Verify Flutter analysis, relevant ride regressions, small portrait/landscape layouts, large text, sheet dragging, dialogs/menus, and a real-device map/arrival/start/completion journey. Compare actual screenshots with the reference before claiming pixel-level equivalence. Native platform map styling, real vehicle photos and safe-area dimensions vary; match the screen composition and visual system without copying the phone frame.

## Controllers and demo flows

Feature records, server snapshots, query/filter selections, form file collections and fixture data belong in feature controllers under `lib/features/<feature>/controllers`. Keep views reusable for real or dummy sources. Pages own navigation, focus, text-editing/scroll/animation/map handles and native presentation coordination. Do not put sample profiles, quotes or response fixtures into a page.

Home's Demo sheet is backed by DemoRegistryController. RideDemoController supplies an isolated data source to production ride pages. UI adjustments belong in shared production widgets; another demo must not duplicate them. See `context/MOBILE_CONTROLLERS_AND_DEMO_FLOWS_PLAN.md` for the inventory, usage and acceptance checklist.

## Home route panel and place strip — 9 November 2026

Home's compact `PlaceCard(compact: true)` carousel floats above, and outside, the route panel. Keep the map visible between independent cards; do not put the place carousel inside the white route-entry surface. Card height accommodates two scaled caption lines, with a bounded photo/placeholder.

Home's route panel uses `SolidSurface.upperChild` with `RideArrivalStrip`: a solid black rounded header, hourglass, white label and gray value pill, followed by the rounded white body and handle. Before booking, label the value as a trip estimate or prompt to select a route; never claim a driver arrival time without assignment data.

Every rider booking stage uses `RideStagePanel` in `features/rides/widgets/rider_flow_components.dart` as the same parent container: a black `RideArrivalStrip` header joined directly to a rounded white body. Home/location entry, vehicle selection, finding, driver assigned/arrived, in-progress and completion each supply stage-specific title/status text. Do not add a separate floating page title or independently positioned black strip. Keep map controls outside this parent over the map, and keep the shared parent edge-to-edge where the reference shows the sheet.

Ordinary `SolidSurface` instances must pass finite parent constraints to their content. Only the optional-header variant needs a vertical composition, with a flexible body. On the live journey, the black ETA backing extends behind the white sheet's top corners. Keep the status header compact with single-line ellipsis at larger system text scales, and keep panel contents scrollable on short screens.

## Independent endpoint selection and Home swipe — 9 November 2026

Home's Pickup and Drop-off rows open the same location-selection stage for one endpoint only. The stage keeps the shared black-header/white-body parent, shows one gray search field, a saved-Home shortcut and vertically stacked suggestions with a bold primary label, muted address and optional distance. A chosen suggestion centers the map under a persistent 32 logical-pixel screen-center pin; pickup pins are green and drop-off pins are red. Keep the selection pin at half the former 64-pixel size and scale its lift/anchor offset with it. Riders can drag the map to refine the point. Continue confirms only the active endpoint and returns to Home. It never starts the quote or booking automatically. Home exposes its next action only after both endpoints are valid, using a 12-pixel blue-to-blueAccent progress rail and right-facing top-down car thumb, without a surrounding CTA frame. Show a small speech-cloud hint reading “Swipe right” above the car, layered above the thumb and rail, and hide it as soon as dragging begins. Keep the control compact with tight vertical spacing. Use `RideSwipeButton` for this interaction.

Use the shared pin artwork in `assets/images/ride_map_pin.png` for ride endpoints across Home, rider trip maps and driver trip maps. Do not add a second custom marker for the rider's current position; retain the existing MapLibre location puck. Keep actual assigned-driver tracking and its vehicle marker. Remove redundant saved-place pins from Home and candidate-vehicle map markers. The assigned-driver map uses `assets/images/ride_car_marker.png`, a top-down car whose front points up. Keep its rotation zero and viewport aligned so it stays facing upward. These asset changes require a new Shorebird base release because bundled assets cannot be delivered as a Dart patch.

Map-first booking stages use a fixed map viewport at 80% of screen height. The shared bottom sheet starts at 30% of screen height and overlays the lower part of the map; expanding it does not resize the map viewport. Home uses the same 80% map height. Keep the map viewport at or below 80% on shorter, landscape or large-text layouts.

## Driver ride stages — 11 November 2026

Driver request, approach/waiting, progress, payment and completion use the same `RiderFlowScaffold` black status strip and solid white body. Driver progress reuses the rider's distance-driven car slider plus an explicit Complete ride button. Driver completion reuses `RiderCompletionPanel` under this black strip and initially opens below the screen top. Passenger identity replaces driver identity; the assigned vehicle and its brand logo/registration remain unchanged. Never copy a driver's rating onto a passenger.

See `context/DRIVER_RIDE_FLOW_UI_REWORK.md` for phase mapping, server gates and isolated driver demo details.

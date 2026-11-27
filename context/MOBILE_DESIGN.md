# 1More mobile design system

Current authority: 8 November 2026. This specification replaces the previous liquid-glass specification in full.

## App icon and startup

Use the supplied standalone white 1More mark in the shared app logo and Android and iOS launcher icons. Center the mark on solid black and keep the whole mark visible at small sizes.

On cold launch, present the bundled `ONE_Splash_Crisp_Logo_9x16_1080p.mp4` clip once at full screen using cover fit, with audio muted. Show a branded frame from the clip before playback and start playback at that frame to avoid a flash from the dark opening. Initialization and session checks run while the splash is visible. If the video is unavailable, continue with the poster. The iOS launch storyboard displays that same poster. Android uses a black system launch window and suppresses the system splash icon on Android 12 and later, then shows the Flutter poster and video. In-app session routing does not replay the clip.

## Login

The login page uses the supplied full-screen video asset as a muted, looping, cover-fit background with a dark readability overlay. Keep the reference composition: a compact horizontally scrolling feature strip at the top, a centered two-line hero and subtitle, one large Google sign-in button, and a small legal footer. Preserve the existing Google sign-in controller/session handoff. Do not show other provider buttons, the old map illustration, lower feature chips or a sign-in card.

## Reference and scope

Profile/Settings reference (14 November 2026): `image 208.png` supplies content placement. Render its upper banner in black, with the solid white rounded body and neutral ride typography. Use role-specific 2×2 summary cards, compact grouped menu rows and a vehicle-brand avatar badge for driver mode. See `PROFILE_SETTINGS_REWORK.md` for the requested sections and temporary controller-owned sample data.

Content-page frame (17 November 2026): `SolidPage` is the common black-header/rounded-white-body frame. `AppPage` and the legacy `LiquidGlassPage` entry point delegate to it. Keep the centered 16 px w500 title, back control and light status-bar icons consistent. Profile has no trailing menu; destination pages may retain necessary actions. The Navigator is wrapped in `SolidScope` so routes, dialogs and sheets render solid. Track individual screens in `PROFILE_DESTINATION_SHELL_MIGRATION.md`.

The visual authority is `C:/Users/harsh/Downloads/image 163.png`, the supplied assigned-driver screen. Match its solid surfaces, neutral typography, compact scale, white/black palette, blue category badge and blue map route. The screenshot shows a phone frame; the app renders the inner screen only. Do not reproduce the hardware frame, notch, status-bar pixels, sample identity or example map labels.

The user explicitly rejected glassmorphism. New screens and future mobile reworks follow this document. The current implementation scope is the complete rider ride flow, including Home, endpoint entry, vehicle selection, search, assigned/arrived, ongoing ride and completion. Other existing modules retain their implementation until explicitly migrated; they are not design references for new work. Admin continues to use its separate web design.

The seven-stage ride sequence remains unchanged. This update replaces its visual treatment, not server transitions or booking rules.

## Material rules

Ride action slider exception (11 November 2026): rider Home after both endpoints are selected and driver payment receipt use `RideSwipeButton`, following `C:/Users/harsh/Downloads/image 193.png`. Use a 40 px solid blue pill within a 48 px touch area, light blue rounded thumb with four white chevrons, and 12 px white inline text. Rider text is “Slide to continue”; driver text is “Slide to confirm payment”. Do not add the car, floating hint, or exposed track to these actions. The read-only destination progress bar retains its car treatment.

- Use fully opaque white sheets and cards. Black status strips and black circular contact controls are solid black.
- No backdrop blur, frosted inputs, translucent fills, pastel lighting, reflective rims, glossy gradients or oversized soft shadows.
- Cards use a fine neutral border and, only where needed, an almost imperceptible neutral shadow.
- The map remains clear and fills the space above the sheet. Sheets are edge to edge with rounded top corners.
- Reuse `components/ui/solid_ui.dart`: `SolidScope`, `SolidSurface`, `SolidButton`, `SolidIconButton`, `SolidTextFormField`, `SolidDropdownFormField`, `SolidSheet`, `SolidPage` and `RideTokens`.
- Use `components/ui/app_error_snackbar.dart` for transient errors and warnings in both modes. Use `showAppError` for action failures and `AppErrorNotice` for controller-driven errors. The payment-failure design stays attached to the lower edge, above the keyboard when visible. Keep retry actions, field guidance and recorded transaction or review statuses available in the relevant screen.
- Phone entry uses `components/ui/country_picker_widget.dart`, built on `SolidTextFormField`. It provides the complete offline country/calling-code list and flags, while the supplied controller always contains canonical `+`-prefixed international digits (E.164) for API submissions. Dynamic Partner Program fields are treated as phone or email inputs when their key or label identifies those values; client and API validation enforce the corresponding format.
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
| Home | Clear map, small profile/control buttons, current account's saved-place photo strip, shared black-header/white-content panel with pickup/drop-off and Continue |
| Location selection | Map above the same joined black-header/white-content panel; compact gray input wells; readable suggestions; explicit map selection and confirmation |
| Vehicle selection | Route map, shared stage panel, dynamic category tiles, white vehicle/driver previews, passenger control, payment/note and booking action |
| Finding driver | Route map and shared stage panel; bounded blue radar illustration, elapsed/search status, cancellation below |
| Pickup/arrived | Shared black ETA header and white sheet with assigned-driver identity, route and honest waiting/start verification states |
| In progress | Clear route map, same stage panel with remaining-time header, compact driver/vehicle/contact row and restrained blue progress track |
| Completion | Same black-header/white-content stage parent, belongings reminder, real driver/vehicle hero, trip reference/date, inline stars, compact route/fare/payment summary, Home and receipt actions |

Vehicle Continue submits directly into matching. Do not restore a compulsory review detour. Preserve the distinction between a nearby preview and an accepted driver. Pre-booking identity/locations remain limited to the approved public projection.

Trip QR uses the shared black-header, white-body sheet. Driver scanning uses the shared page frame with a bounded camera area and manual trip code available on return. While routes recalculate, show inline progress and keep the last route for the same destination. If loading fails, offer an inline retry. Cancelled ride cards and details omit fare fields while any separate cancellation review remains available.

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

Home's compact `PlaceCard(compact: true)` carousel floats above, and outside, the route panel. It includes only the signed-in account's personal saved places and shared places that account bookmarked; never render the global community feed in Home. Keep the map visible between independent cards; do not put the place carousel inside the white route-entry surface. Show a full-bleed place photo behind a compact tilted white information tile with saved-place name, address, category and an actual rating only when one exists.

The Saved Places page uses a full-screen map with a floating destination search field and filter control, coordinate-anchored place markers, a compact selected-photo card carousel, a map/list toggle and a simple place-count footer. Keep the map as the dominant canvas. The add/edit place flow uses the shared solid name/address fields, place-type selector, and shared image upload widget; show selected photos as compact previews. Keep the form limited to place name, address, type and photos while preserving existing optional metadata during edits.

### Pasted locations

- [x] The shared location search resolves coordinates and Google Maps share links in ride pickup, ride drop-off, and Saved Places search and address editing, using the existing fields. Saved Places destination search opens the existing map picker for an exact pin.
- [x] Keep the original coordinates when reverse geocoding supplies a display address. If the address is unavailable, display the coordinates. Links with only a place name reuse suggestions. Keep the existing confirmation before selecting or saving a location.
- [x] Verify coordinate formats, map pin priority, short-link redirect handling, ride pickup and drop-off confirmation, and the Saved Places map picker with focused Flutter tests.
- [ ] Verify location pasting and patch delivery on a connected Android device.

Place details use the shared solid page header and surfaces. Keep one compact summary, photo gallery, two primary place actions, and a clean review list. Put less frequent contact, sharing, copying and owner actions in one solid options sheet; avoid repeating the same action in multiple sections.

Home's route panel uses `SolidSurface.upperChild` with `RideArrivalStrip`: a solid black rounded header, hourglass, white label and gray value pill, followed by the rounded white body and handle. Before booking, label the value as a trip estimate or prompt to select a route; never claim a driver arrival time without assignment data.

Every rider booking stage uses `RideStagePanel` in `features/rides/widgets/rider_flow_components.dart` as the same parent container: a black `RideArrivalStrip` header joined directly to a rounded white body. Home/location entry, vehicle selection, finding, driver assigned/arrived, in-progress and completion each supply stage-specific title/status text. Do not add a separate floating page title or independently positioned black strip. Keep map controls outside this parent over the map, and keep the shared parent edge-to-edge where the reference shows the sheet.

Ordinary `SolidSurface` instances must pass finite parent constraints to their content. Only the optional-header variant needs a vertical composition, with a flexible body. On the live journey, the black ETA backing extends behind the white sheet's top corners. Keep the status header compact with single-line ellipsis at larger system text scales, and keep panel contents scrollable on short screens.

## Independent endpoint selection and Home swipe — 9 November 2026

Home's Pickup and Drop-off rows open the same location-selection stage for one endpoint only. The stage keeps the shared black-header/white-body parent, shows one gray search field, a saved-Home shortcut and vertically stacked suggestions with a bold primary label, muted address and optional distance. A chosen suggestion centers the map under a persistent 32 logical-pixel screen-center pin; pickup pins are green and drop-off pins are red. Keep the selection pin at half the former 64-pixel size and scale its lift/anchor offset with it. Riders can drag the map to refine the point. Continue confirms only the active endpoint and returns to Home. It never starts the quote or booking automatically. Home exposes its next action only after both endpoints are valid, using a 12-pixel blue-to-blueAccent progress rail and right-facing top-down car thumb, without a surrounding CTA frame. Show a small speech-cloud hint reading “Swipe right” above the car, layered above the thumb and rail, and hide it as soon as dragging begins. Keep the control compact with tight vertical spacing. Use `RideSwipeButton` for this interaction.

Use the shared pin artwork in `assets/images/ride_map_pin.png` for ride endpoints across Home, rider trip maps and driver trip maps. Do not add a second custom marker for the rider's current position; retain the existing MapLibre location puck. Keep actual assigned-driver tracking and its vehicle marker. Remove redundant saved-place pins from Home and candidate-vehicle map markers. The assigned-driver map uses `assets/images/ride_car_marker.png`, a top-down car whose front points up. Keep its rotation zero and viewport aligned so it stays facing upward. These asset changes require a new Shorebird base release because bundled assets cannot be delivered as a Dart patch.

Map-first booking stages use a fixed map viewport at 80% of screen height. Rider and driver sheets open at the height of their current content, including the header and safe area. The sheet can be dragged back up to that height after collapsing it. Content scrolls when it exceeds the space available on screen. The sheet does not resize the map viewport.

Keep the same MapLibre view mounted through rider pickup, drop-off, vehicle selection and live trip stages, and through driver availability, requests and live trips. In-flow navigation changes the sheet and updates the map layers and animated camera in place. The endpoint picker stays on Home and keeps the map visible when the search field opens the keyboard. Apply the same map lifetime to the rider and driver demos.

## Driver ride stages — 11 November 2026

Before every driver request, show a **Go online** phase over the full map. Use the same `RiderFlowScaffold` with its black status strip and solid white draggable body. The body contains a horizontally draggable carousel of the driver's owned vehicle brands, each logo in a circular tile; the centered/selected tile identifies the vehicle to activate. Keep unverified vehicles visible but disable online activation for them. A `RideSwipeButton` labeled **Slide to go online** activates the selected eligible vehicle, starts driver GPS tracking, and only then marks the driver available. Do not accept ride offers before this action succeeds.

Driver request, approach/waiting, progress, payment and completion continue in the same `RiderFlowScaffold` black status strip and solid white body. Driver progress reuses the rider's distance-driven car slider plus an explicit Complete ride button. Driver completion reuses `RiderCompletionPanel` under this black strip and initially opens below the screen top. Passenger identity replaces driver identity; the assigned vehicle and its brand logo/registration remain unchanged. Never copy a driver's rating onto a passenger. The Go online phase is also the first stage in the Home → Demo → Driver ride flow preview.

See `context/DRIVER_RIDE_FLOW_UI_REWORK.md` for phase mapping, server gates and isolated driver demo details.

## My Rides reference and implementation log

Use the supplied three-panel order-history reference for the rider history, summary, and route map. My Rides uses the standard `SolidPage` header shared with Profile, including its height, centered title, and back button. Pull down to refresh. The list loads more rides as the user scrolls and shows no filters, page controls, or loading copy.

| Screen | Layout and behavior |
| --- | --- |
| My Rides | Pale gray list with Active rides and Past rides sections. White cards show pickup and destination at 16 px, a dotted connector, and end-aligned price and distance labels and values. Prices use a ₹ chip, green for confirmed collection and neutral for other known fares. |
| Ride details | Tapping a card opens a modal built from the booking flow's `RideStagePanel` and black `RideArrivalStrip`. The hourglass and title sit on the left, and a short status chip sits on the right. The summary reuses the list's route card. The booking flow's vehicle and driver card appears below, followed by rating, trip facts, and feedback. The primary action is black. Completed rides add a receipt icon beside the map toggle and use the booking completion PDF template. Pending payment shows concise receipt status and eligible payment actions. |
| Route map | The map toggle stays in the sheet. The map has its own rounded card with space around it. MapLibre plots the recorded endpoints and route geometry when available. |
| Active ride | The same sheet opens first. Open live ride continues into the booking flow. |

Rebooking starts a fresh quote. Display rupee amounts with ₹.

## My Wallet

Driver My Rides uses the same `SolidPage`, section order, route cards, spacing, loading/empty/error states, refresh behavior and scroll pagination described above. It reads driver-owned rows from `/driver/rides`; the shared history sheet reads the selected ride from `/driver/rides/:id` and presents the passenger in the profile slot while retaining the vehicle, route, fare, map and receipt layout. Active driver rides can continue into the existing driver ride flow.

My Wallet uses the same header as Profile and extends the black background through the balance, gradient card, and actions. The card uses the existing 1More logo and its own wallet artwork. The action row includes Add money, Payment methods, and Activity.

The larger wallet card shows the preview wallet ID, profile name, and sample expiry in spaced monospace type, with 1More branding and decorative chip and contactless marks. Empty transaction history shows a wallet and receipt illustration.

The rounded history section uses compact rows with a transaction icon, title and local timestamp on the left, and a signed rupee amount plus status or type on the right. Tapping a processing transaction or a completed non-ride transaction opens the payment timeline. Completed ride payments open the shared My Rides detail sheet.

Add money uses a rupee amount panel, wallet destination, quick amounts, Continue, and a numeric keypad. A preview top-up advances from processing to completion and credits the preview balance once. The status page uses a black header area, an illustrated status mark, and a white history panel with the payment timeline. The existing payment methods page remains available from My Wallet. Preview ride payments use an isolated ride fixture, and the wallet flow makes no payment-provider call.

Wallet payment screens use medium weight typography at the ride flow scale. Add money docks Continue and the keypad at the bottom on standard viewports and lets the whole layout scroll in short viewports or at large text sizes. The processing indicator rotates while pending and transitions to a success mark. Reduced motion disables both animations. Transaction cards and the history heading have additional vertical space.

## Complaint chat and support escalation

Report a Complaint opens a full-height chat page titled with the complaint subject once a request exists. User messages use blue bubbles on the right; 1More replies use light-gray bubbles on the left. Keep the composer fixed above the safe area, with a gray input and blue circular send action. Do not render group-chat participants or attachment controls unless the support API supports them. The complaint form opens in the shared ride-detail `RideStagePanel`, with the black `RideArrivalStrip` header and white form body. Size the sheet from its available bottom-sheet constraints so keyboard insets do not get subtracted twice or collapse it. Use the shared solid text and select form fields. Creating the request opens its subject-led support conversation.

The reusable `SupportRequestSheet` is the sole complaint/support request form. Both the chat escalation action and Help Me's top-right New support request action open this exact sheet. It keeps field labels above their boxes so focus never floats a label outside the field. Its text fields share the same neutral fill, 12 px corner radius, 14 px entry text, and 48 px minimum single-line height; multiline details keep the same style and grow vertically. Priority opens the shared solid option sheet. Reserve the panel header, margins, and bottom safe-area inset exactly once when sizing around the keyboard. While submitting, the primary button retains its dimensions and shows a circular progress indicator instead of a shimmer placeholder.

The current first responder is a local, guided FAQ matcher owned by `ComplaintAssistantController`; it is not a live generative AI integration. The API has customer ticket and message routes but no staff inbox/reply endpoint in the admin app. A production AI service and staff reply workflow remain pending provider/API decisions; do not present local replies as answers generated by a hosted AI model.

The Help Me list uses compact chat rows on the solid white page: a 44 px circular support avatar, single-line subject, one-line latest message preview, and a compact timestamp aligned at the right. Separate rows with a light divider; tapping a row opens that ticket's subject-led conversation. Keep the new-request action in the black page header. Place the Direct support channels card after all conversation rows, including when the list is empty.

Emergency Contacts uses the same compact white conversation-row geometry, with a contact initial, name, phone/relationship preview, direct call action and a small edit/remove menu. Keep the list clear of introductory panels and secondary safety copy. Add and edit use the black-header/white-body ride stage sheet with the shared solid fields and fixed-height loading button.

## Partner application and activation

The Partner Program uses the standard solid `AppPage` header without a refresh action. Keep each application step focused on its required fields: one step count/progress rail, one stage heading, only the instruction needed for that stage, and the fields/uploads. Use the shared 48 px `SolidTextFormField` and `SolidDropdownFormField`, external labels, 12 px corners, consistent 14 px input text, and 20 px field spacing. Dropdowns and address choices open the shared opaque solid option sheet. Show field help only while the field is active; do not repeat instructions in both the page and field. Policy and confirmation documents are compact, unboxed text. Their agreement controls are small, unboxed, and use short consent copy. Primary partner actions are 60 px high. Image uploads use a taller neutral preview well and show selected images at a useful height.

Keep the application stages in the existing controller-backed workflow: policy acceptance, contact, dynamic detail/document categories, review/corrections, confirmation/signature, final document and one-time driver activation. Preserve file previews, review states, locked approved values, selfie capture, draft recovery and submission gates. Keep status feedback concise and close to the affected fields. Do not add decorative panels, duplicate policy/status actions, or unnecessary explanatory copy. Loading placeholders match the solid form; buttons use the shared ride-flow height and busy indicator. Activation uses one centered six-digit field and one primary action.

## Driver availability home

The driver home is the Go online ride-flow stage in both availability states. Keep the same map, black status header, fitted white bottom sheet and owned vehicle brand carousel while online. The slider is blue and says **Slide to go online** when offline; it turns red and says **Slide to go offline** when online. The selected active vehicle remains visible while online. Put the profile avatar at the upper left and notifications at the upper right, matching rider Home. Do not reintroduce the legacy driver dashboard, workspace shortcuts or inline offer panel; live actionable offers still open the shared request phase.

Use the shared `LocationAccessSheet` before requesting location permission. Its body contains the location illustration, short rationale and a single clear permission/settings action under the standard black header. Keep the panel fitted to its content with the same vertical rhythm as the driver ride phases.

## Driver vehicles

My Vehicles uses the standard black `SolidPage` header. Immediately below it, show a horizontal row of only the driver's registered brands. Each brand has a circular white logo tile with a fine white/neutral rim and its name underneath; select the first available brand automatically and keep the selected brand explicit. The final row item is a matching circular plus tile labeled Add. Below the row, show the selected brand's vehicles as compact solid vehicle tiles using the shared brand identity, model, registration and review state. A trailing menu opens the shared solid action sheet with Edit vehicle and Delete vehicle. Delete requires confirmation and removes the vehicle from available vehicles while retaining the database record and ride history; the server blocks removal during an active ride and clears active vehicle/availability when applicable.

Add opens the catalog brand selector, then that brand's model selector, then the existing vehicle verification form with the selected catalog values prefilled. Edit opens the same form for the existing vehicle. Keep all verified catalog choices, category fit, six required photo/document uploads, review locks, draft recovery and server validation. Form fields use the same compact 48 px solid profile field geometry and the 60 px save action anchored at the bottom. Brand/model search and pagination remain available so the bounded API catalog can be fully browsed.

## Notifications

Keep the existing black `SolidPage` app bar. Replace the body with a white activity feed matching the supplied reference: compact circular leading identity/type icon, title on the first row, unread blue dot aligned at the far right, date/time and relative age on the next row, then an optional light-gray rounded message block. Separate entries with fine gray dividers and keep the feed vertically scrollable. Remove the intro card, unread filter chips, status pills and refresh action. Preserve mark-as-read and related ride/account/support navigation. The notification API currently supplies title, body, type and read state; show only actions or file previews when corresponding structured payloads and supported actions exist.

## Shared upload presentation

All rider and driver image/file selection uses `SolidFileUpload` from `lib/components/ui/solid_file_upload.dart`. Its empty state follows the supplied dashed drop-zone reference with a centered upload mark, brief accepted-file guidance, and a compact Select files button. Selected images fill the preview well with `BoxFit.cover` and have one remove badge at the upper right; single-file fields do not show a second replace/add action. Multi-file fields may expose Add another file. Keep picker validation, staging, permission handling, submission timing and upload limits in their owning feature controller/repository; the shared widget only presents selection state and actions.

Suggest Brand and Suggest Model use the solid form fields and dropdowns, with the selected brand or logo in a circular tile above the form and a shared full-width logo uploader. An approved or inactive vehicle can be edited: unchanged verification fields retain their existing review state, changed fields return to pending review, and editing the active vehicle clears the active selection and takes the driver offline until reapproval. Editing is blocked during an active ride. Existing documents remain available when changing other fields; replacing a document uses the shared uploader and must be resubmitted for review.

## Page transitions and system bars

Keep Android route transitions on `PredictiveBackPageTransitionsBuilder` and set its non-gesture fallback background to black. Never use the white theme surface or transparency for the transition backdrop, since either can reveal a white system window during page changes. `SolidPage` owns a black status-bar header and sets navigation-bar color/icons from its body color; Home explicitly uses a light navigation area and dark system icons. New app routes should use the shared theme and page shells rather than setting global system UI styles during navigation.

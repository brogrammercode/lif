# Rider ride flow: exact reference replacement plan

Date: 8 November 2026
Status: implemented in source; deployment migration and physical-device acceptance remain outstanding.
Reference: `C:/Users/harsh/Downloads/Screenshot 2026-11-08 160418.png`.

## Current visual decision — supersedes earlier material proposals

The later user reference `C:/Users/harsh/Downloads/image 163.png` replaces the glass proposal completely: solid white/black surfaces, neutral platform typography, compact scale, blue route/category accents. Both mobile design files have been rewritten. The seven-screen behavior remains; section 19 records the visual replacement. Earlier glass-specific wording below is historical and does not authorize new glass UI.

## 1. What this plan means by exact

The supplied board is the authority for the rider booking journey: screen sequence, map-first composition, panel hierarchy, content order and primary interactions. This is a replacement of the current ride flow, not an extra set of cards added to the existing Home or general trip-detail layout.

The board contains seven frames taken from several apps. They have different fonts, colors, vehicle illustrations and surface treatments. We can reproduce the exact composition and transitions across all seven while using one coherent 1More implementation. The proposed default is the existing liquid-glass material and Outfit typography from `apps/user/v1/MOBILE_DESIGN.md` and `context/MOBILE_DESIGN.md`, applied to the exact reference positions. Reference blue/purple buttons are therefore dark glossy 1More actions in this proposal. If literal reference colors and opaque surfaces are intended too, that is a scoped design change to agree before implementation. No unrelated Settings, Partner Program or driver UI is included in this replacement.

The screenshot is a flow board, not a dimensioned design source. Its tiny annotations and a few labels are partly unreadable. Dimensions below are implementation targets inferred from the visible frames, not measured specifications. The plan explicitly calls out inferred behavior rather than claiming the screenshot proves it.

## 2. The seven frames and their meaning

| Frame, left to right | Proposed screen | Main purpose | What advances it |
| --- | --- | --- | --- |
| 1 | Ride Home | Map discovery, places and compact pickup/drop-off entry | Tap pickup/drop-off, or Continue when both endpoints are valid |
| 2 | Choose Locations | Focused address search with map context and selectable results | Confirm valid pickup and destination, then Continue |
| 3 | Choose Vehicle | Route overview, actual configured categories, nearby vehicle/driver previews, passengers, payment and fare | One explicit booking Continue action |
| 4 | Finding Your Driver | Confirmed request searching for acceptance | Server confirms a driver accepted |
| 5 | Driver Assigned / Coming to Pickup | Driver/vehicle identity, live approach, ETA and pickup verification | Server-verified arrival, then combined rider confirmation and trip code |
| 6 | Ride in Progress | Live route/progress and compact driver/contact panel | Server confirms ride completion |
| 7 | Ride Completed | Driver summary, rating, trip/payment summary and receipt action | Back to Home or open/download available receipt |

Frame 5 also needs an Arrived/Ready to Start variant. Completion needs a payment-pending variant because finishing a ride does not prove that the driver received payment. These are states of the reference screens, not additional compulsory pages inserted into the journey.

## 3. Reading the annotations

- The black arrow indicates that touching either route field opens the dedicated location page. A location confirmed there is returned to the previous journey state. Search suggestions and picking directly on the map are both supported.
- The blue arrow indicates that Continue with valid locations advances to vehicle selection.
- The small blue note appears to request real available vehicle/driver previews, including driver profile information, so riders can see genuine availability. Exact wording in the image is partly unreadable; this is the proposed interpretation for review.
- The orange arrow explicitly places driver finding after Continue on the vehicle page.
- The captions under the last three screens distinguish driver finalized, ride started and ride finished.

There is no reference step between vehicle Continue and Finding Your Driver. The current extra booking-review sheet should therefore be folded into vehicle selection, keeping payment, price and final booking consent on that page.

## 4. Screen 1 — Ride Home

### Content placement, top to bottom

1. Full-screen MapLibre map underneath the safe-area controls; no page title bar or bottom navigation.
2. Top-left circular current-user avatar. Tap opens the existing Settings page.
3. The top-right streak pill is visible in the reference. Reserve its compact position in the design, but do not invent a streak counter. Include it only if a real streak feature is approved; otherwise omit the pill and keep the map open.
4. Map shows current-location indicator and coordinate-anchored place pins. Nearby vehicle markers require the real availability feed described below.
5. Lower map area: horizontal place-photo cards with equal widths, side peeks, rounded image, short place name and locality. Use actual shared-place data/photos. Selecting a place can supply the destination or open its preview; proposed booking behavior is destination selection with a visible confirmation.
6. Small centered sheet handle below/adjacent to the place strip.
7. Bottom compact route card: pickup row, connecting route line, destination row; edit controls remain obvious. Pickup defaults to a permitted current/last-known location, accurately labelled. Destination stays empty until selected.
8. Continue belongs below the valid route summary. When there is no destination, tapping that row opens Screen 2. Do not show a vehicle selector here.
9. Floating recenter/map control sits above the route card; map attribution is repositioned above overlays.

### Behavior

- Tapping Pickup opens Screen 2 with pickup active; tapping Drop-off opens it with destination active.
- Location permission denial leaves manual search/map selection usable.
- Returning from Settings preserves the booking draft. Returning from location entry preserves actual coordinates and labels.
- Current active trip is recoverable through a compact Resume action and session restoration. A second booking cannot bypass the server's active-trip restriction.
- Dragging the idle map does not silently replace an already confirmed pickup.

### Widgets

`RiderMapCanvas`, `RiderProfileControl`, `NearbyPlaceStrip`, `CompactRouteEntry`, `MapRecenterControl`, `ActiveRideResumeControl` and `HomeRideSkeleton`.

## 5. Screen 2 — Choose Locations

### Content placement

1. Upper approximately 55–65%: visible map, back/menu control, selected endpoint pin and recenter button near the lower map edge.
2. Lower approximately 35–45%: rounded sheet, handle and a focused search well. With keyboard or long results, the sheet expands and scrolls; map area shrinks to preserve usable inputs.
3. The reference has one dominant search well. Show the active endpoint prominently; provide a compact pickup/drop-off switch/context row so users know what they are editing without turning this into a large form.
4. Below search: suggested/recent/saved places as rows. Each has a leading place icon, readable primary label, secondary address and distance only when known.
5. Visible map-selection option, entering a center-pin mode with a Confirm location action. The result includes the selected coordinate and resolved/editable display label.
6. Bottom full-width Continue after both endpoints are confirmed. For pickup-only editing, confirming the pickup returns to the origin screen or activates destination entry according to the draft's missing endpoint.

### Input and navigation rules

- Preserve the existing minimum three-second search settling requirement and stale-response protection. Wait until typing has settled; keep the interaction usable while the keyboard is open rather than requiring keyboard dismissal to make search possible.
- Unconfirmed typed text invalidates the old coordinate. A suggestion or map confirmation establishes a valid endpoint.
- Map picking follows the existing 3–5 second drag-settling behavior before committing reverse-geocode/route work. The pin follows the gesture immediately; it must not auto-confirm the first drag.
- Back discards unconfirmed search text but keeps previously confirmed endpoints. Existing map-selected edits remain in the draft once explicitly confirmed.
- Editing either endpoint invalidates old route estimates, quote selection and availability results.
- Do not allow Continue while endpoint selection, reverse geocoding or route validation is unresolved.

### Widgets

`LocationSelectionPage`, `ActiveEndpointSearch`, `EndpointContextRow`, `PlaceSuggestionRow`, `RecentLocationList`, `MapLocationPicker`, `SelectedLocationPreview`, `LocationSelectionSkeleton`.

## 6. Screen 3 — Choose Vehicle

This is the last screen before an actual request. It must match frame 3: route map above, compact selection sheet below, sticky Continue at the bottom.

### Content placement

1. Top map shows confirmed pickup and destination, fitted route and real nearby vehicle pins. Back returns to location editing. A compact endpoint/locality pill stays at the top.
2. Add stop appears in the reference. Proposed launch treatment: omit until stop pricing, matching and trip progression are supported. Do not ship a cosmetic Add stop control. Multi-stop is a separate decision, not implied permission to change the current single-destination contract.
3. Bottom draggable sheet starts around the middle of the viewport and can expand. Handle first.
4. Horizontal category selector: square rounded icon/image tiles and short labels. These are actual admin-configured category/subcategory IDs, not fixed Car/Bike/Auto enums. Selecting a tile updates its quote and nearby-preview list.
5. Below categories: one visible nearby vehicle/driver preview at a time, horizontally pageable where several exist. The reference order is registration and make/model/color, vehicle image, then driver avatar/name/rating. Keep that exact hierarchy.
6. Preview includes category badge, real arrival estimate or unavailable state, and a small availability label. Ratings without a rating history read Unrated. Do not fabricate a Top Rated badge or trophy.
7. The route distance/duration and quoted fare remain visible close to the booking action; distinguish trip duration from time to pickup.
8. Compact passenger control above Continue, as the reference shows. Capacity comes from eligible vehicles/category. Existing booking input has no passenger-count field, so this requires server validation/storage/matching before it becomes interactive.
9. Full-width Continue to book {category} · ₹{quote}. Disabled during expiry/requote/submission, with stable size and visible recovery feedback.
10. Payment row under the button: Cash or Direct UPI, change affordance and concise direct-payment context. Payment selection can open a small glass sheet; it must not add another compulsory booking-review screen.

### The preview versus assignment distinction

The reference shows a driver before the separate driver-finding page. Proposed interpretation: display an anonymized/public-safe nearby candidate preview, then let the existing matching engine request eligible drivers. The candidate is not reserved, and another eligible driver may accept. Label this clearly as Nearby, not Assigned.

If the intention is to book the exact previewed driver, this is a different matching feature: explicit selection, targeted offer, availability race, decline/timeout and fallback consent must be specified. The existing category quote/create contracts do not support targeted driver booking.

Pre-booking previews must not reveal exact driver GPS, phone numbers, full identity documents or private vehicle photos. Use a coarse map position and an explicit public profile/photo policy. Whether full plate/name are visible before acceptance is a product decision. After assignment, the actual trip identity replaces all previews.

### Booking correctness

- Fold the current review-sheet summary, quote-expiry check, payment selection and optional rider note into this screen.
- Continue triggers one idempotent booking submission. One tap creates at most one ride, even on retry or lost response.
- Show the searching screen only after the request is confirmed or reconciliation verifies it exists. During uncertain submission, show a stable submitting/reconciling state with route and selections retained.
- Zero nearby previews does not automatically mean an expanding search can never succeed. Explain that preview availability is a snapshot; allow booking only under the agreed server booking rules.

### Widgets

`VehicleSelectionPage`, `RouteOverviewHeader`, `CategoryTileStrip`, `AvailableVehiclePreviewCard`, `DriverPreviewIdentity`, `PassengerCountControl`, `QuoteSummary`, `BookingPaymentRow`, `BookRideAction`, `VehicleSelectionSkeleton`.

## 7. Screen 4 — Finding Your Driver

### Exact composition

- Upper map retains the pickup/drop-off route from Screen 3.
- Lower large rounded sheet keeps the same horizontal position and top handle as the vehicle sheet.
- Center of the sheet: bounded radar/search illustration, then Finding your driver, then compact animated dots/status text.
- Secondary content below the main status: selected category, route summary and cancellation action. Keep this visually subordinate to the reference's large central searching treatment.
- An optional collapsed detail row can explain elapsed search and current search area; do not fill the reference's breathing space with a long trip-detail form.

### Behavior

- Actual search starts after Screen 3 Continue, never while browsing categories.
- Expand matching radius under existing admin policy; search animation is presentation, not proof a driver was contacted.
- Driver accepted transitions directly to Screen 5; no extra confirmation page.
- Cancellation has the existing rules and honest fee explanation. A failed cancellation leaves the ride recoverable.
- No driver found / expired retains route/category and offers fresh quote or edit route. It is never shown as a completed ride.
- If status retrieval fails, show reconnecting with the last verified state; never submit another booking automatically.
- Back can return to Home with a visible active search/resume state. It cannot silently cancel or start a duplicate ride.

### Widgets

`DriverSearchPanel`, `DriverSearchRadar`, `SearchElapsedStatus`, `SearchFailurePanel`, `CancelSearchAction` and `ReconnectNotice`.

## 8. Screen 5 — Driver Assigned / Pickup

### Content placement

1. Map remains full width behind the sheet; fit actual driver-to-pickup route, driver marker and pickup pin above the sheet.
2. Top floating banner: Get ready, your driver is on the way. Change to Your driver has arrived only on a verified server arrival.
3. Immediately above/at the sheet edge: dark ETA strip, left status icon/label and right ETA pill. Hide stale numerical estimates and show Last updated when needed.
4. Sheet handle.
5. Vehicle row first: registration large on left; make/model/color below; actual public vehicle image and category badge on right.
6. Driver row next: avatar, name, rating/history context, call and chat circular actions on right.
7. Route timeline below: pickup/current pickup location then destination with connecting dots/line.
8. Start verification module appears in the Arrived variant: trip OTP/code, refresh where allowed, rider Confirm start action and explanatory state. Both rider confirmation and driver-entered trip code must succeed before In Progress.
9. Secondary expandable actions: safety, share trip, cancellation and support. Keep them below the reference's primary identity/route section.

### State variants

| Server state | Banner/panel treatment | Allowed primary behavior |
| --- | --- | --- |
| DRIVER_ASSIGNED | Driver accepted; actual identity visible | Track approach, contact, eligible cancellation |
| DRIVER_ARRIVING | Arrival ETA and route | Same, with fresh progress |
| DRIVER_WAITING | Driver arrived; waiting timer | Show trip code and rider confirmation |
| Interrupted network | Last verified status plus reconnecting | Retry reads; server validates every action |

No-show timer begins only at GPS-verified arrival. Preserve the existing radius/freshness rules, free waiting, call-attempt requirements and separately reviewed fees. Activation codes never appear here.

### Widgets

`PickupApproachPanel`, `RideStatusBanner`, `ArrivalEtaStrip`, `AssignedVehicleIdentity`, `AssignedDriverRow`, `RideEndpointTimeline`, `TripStartVerification`, `TripContactActions`, `TripSecondaryActions`.

## 9. Screen 6 — Ride in Progress

### Content placement

1. Map shows actual ongoing route to destination, vehicle position and destination pin. Pickup approach route is cleared as soon as the trip starts.
2. Top banner changes to On your way. The reference reuses pickup wording in this frame; that wording is inappropriate once moving and is treated as sample content.
3. Lower floating compact panel: driver/avatar/name, vehicle/plate context, then remaining time and route progress strip.
4. Large contact-driver action anchors the bottom of the panel; chat sits beside it as a smaller consistent action.
5. Expand panel for destination, fare/payment preference, safety/share/support. Collapsed panel retains the reference's compact shape and map visibility.

Use the reference's shape/order for the progress strip, but bind progress only to recorded GPS and routed distance. Do not animate a fake vehicle along a line or count down a stale ETA. Rerouting preserves the verified trip and rejects late pickup-route responses.

Calls use current configured ordinary calling; chat uses existing trip chat. Masked calling stays provider-dependent. Cash/UPI information does not imply funds were collected. Riders cannot mark the driver's ride complete from this screen.

### Widgets

`RideInProgressPanel`, `CompactDriverVehicleHeader`, `RemainingTripSummary`, `RouteProgressStrip`, `ContactDriverButton` and existing safety/chat surfaces.

## 10. Screen 7 — Ride Completed

### Content placement

1. Safe-area header: back, You've arrived, share/action control.
2. Compact belongings reminder banner with dismissal.
3. Centered driver/vehicle composition: actual vehicle photo, overlapping driver avatar, driver name, make/model/plate beneath.
4. Two compact metadata rows: trip reference and actual completion date/time.
5. Rating prompt and five tappable stars; optional comment expands only when needed. Show the saved rating state after success.
6. Compact Trip details panel: pickup, destination, actual recorded distance/duration and final server fare.
7. Payment method and receipt status beneath: Cash/Direct UPI; Paid only after recorded driver confirmation. Pending/unpaid stays explicit and offers the supported help/report path.
8. Bottom pair of actions matching reference placement: Back to Home (secondary) and Receipt/Download bill (primary only when a real downloadable artifact exists).

The screenshot's coins/reward number is not an existing approved reward feature. Do not copy it. Existing receipt handling is a verified trip/payment view; inspect/add a genuine authenticated PDF receipt endpoint before labelling the action Download Bill. Otherwise this control reads View receipt. A partner-confirmation PDF is unrelated and cannot be reused as a ride invoice.

Completed and cancelled/no-driver-found journeys remain separate. Returning home does not lose the receipt/rating, which remain accessible in My Rides. Rating failure keeps the selected stars/comment and offers retry without falsely reporting success.

### Widgets

`RideCompletedPage`, `BelongingsReminder`, `CompletedDriverVehicleHero`, `TripReferenceRows`, `InlineRideRating`, `CompletedTripDetails`, `CollectionStatusRow`, `CompletionActions`.

## 11. Navigation and shared draft design

```text
Ride Home -> Choose Locations -> Choose Vehicle -> Finding Driver
    ^             ^                  |                  |
    |             +-- edit route ----+                  | accepted
    |                                                    v
    |                              Driver Assigned -> Arrived / Verify Start
    |                                                        |
    |                                                        | both proofs
    |                                                        v
    +------ Ride Completed <------------------------- Ride in Progress
```

Use one feature-scoped ride coordinator and one typed draft. The draft carries endpoint coordinates/labels, selected category ID, quote/draft ID and expiry, route geometry, payment preference, optional note and passenger count if approved. Driver preview selection is separate from the assigned driver ID.

Recommended routing: a `RiderRideFlowPage` shell with one MapLibre controller and stage-specific overlays for Home, Vehicle, Search, Pickup and In Progress. Location selection is a dedicated pushed page, as the reference requires. Completion is a distinct page. This preserves map continuity without building a fresh native map for every status transition. Logical screens remain independently testable.

The active trip ID and verified server status determine recovery after restart. Persist confirmed draft data in an account-scoped store only if needed. Back, swipe-back, logout/account change, background/resume and notification deep links all route through the coordinator. The backend remains authoritative; a local stage flag cannot advance a trip.

## 12. Current code findings and replacement map

Inspected routes, Home booking methods, rider trip rendering, ride repository/controller/schema and driver-operations matching/trip support. These findings describe existing code, not a claim that the complete device flow was exercised.

| Existing code | Current responsibility | Planned treatment |
| --- | --- | --- |
| `features/home/pages/home_page.dart` | Location, map, inline search, route, category quotes, booking handoff | Split view/state responsibilities into reference stages; reuse location/map fixes |
| `features/rides/widgets/booking_review_sheet.dart` | Explicit booking confirmation, quote expiry and lost-response reconciliation | Move behavior into vehicle Continue; remove compulsory review detour |
| `features/rides/pages/ride_detail_page.dart` | General rider details across searching/active/completed states | Extract live flow presentation; retain historical details and existing history/deep-link behavior |
| `features/rides/widgets/rider_trip_map.dart` | Rider route/location map | Reuse map semantics in shared live canvas |
| `features/rides/widgets/trip_*` and `ride_glass.dart` | Receipt, safety, cancellation, identity/details | Reuse business actions; compact/recompose visuals for the reference |
| `features/user_app/user_app.repo.dart` | Quotes, create, ride details, start confirmation, receipt/review | Keep centralized transport; add typed flow adapters and approved new contracts |
| `features/driver_operations` client | Live trip state, route/contact/chat/payment/start | Preserve authority/recovery behavior; avoid a second poller |
| `api/v2/features/ride` | Category quote/create/detail/review | Extend only for approved missing data; preserve envelope/routes/idempotency |
| `api/v2/features/driver_operations` | Matching, arrival, start proofs, progress and direct receipt | Reuse eligibility and lifecycle; factor shared eligible-candidate query if preview is added |

The current quote input is pickup/drop-off/note. Create accepts draft ID, quote ID and payment preference, without passenger count or a requested driver. Public trip identity already includes driver names/avatar/rating and vehicle make/model/plate/color/capacity/photo. Pre-booking public availability is a new contract; do not expose the internal matching candidate query directly.

## 13. API/data work required

| Contract | Existing foundation | Required work |
| --- | --- | --- |
| Endpoint search and route | Existing place search and driving route | Reuse delays/cancellation and coordinate validation |
| Category quote | Existing category-based quote | Preserve per-category policy, expiry, snapshots and server fare |
| Nearby preview | Matching has internal eligible candidates | Add authenticated bounded public preview if approved, coarse GPS and safe identity fields, freshness and server-derived eligible counts |
| Booking | Existing idempotent create/reconcile | Keep same semantics; add validated passenger count only if approved |
| Live state/progress | Existing trip detail/operations route | Consolidate one owner for polling/resume and reject outdated responses |
| Start | Existing rider confirmation plus trip code | Preserve both proofs and server arrival gate |
| Rating | Existing review operation | Inline presentation, same ownership/score validation |
| Receipt | Existing receipt read | Verify actual artifact support; implement private ride PDF only if approved |

Availability must use the same category, active vehicle, verified documents, activation, suspension/exit, GPS freshness and online checks as matching. Busy drivers remain ineligible for immediate assignment under existing no-queue rules. Keep availability queries bounded and refresh conservatively; no per-card polling or full driver list downloads.

## 14. Layout, loading and accessibility acceptance

- Map stays visible and unblurred; clipped glass is limited to the reference controls/panels.
- Match map/panel proportions and ordering at a standard phone size; use a draggable/scrollable sheet for small screens and large text.
- Use the existing standardized medium pins. Center selection pin belongs only to map-picking mode; confirmed pins remain coordinate anchored.
- Fit routes with safe-area and current sheet-height padding. The sheet never hides both endpoints or attribution.
- Each screen has its own matching skeleton: place strip/route entry, location suggestions, category/driver preview, assigned identity, progress panel and completion summary.
- Search radar respects reduced motion and stops when hidden. No fake vehicle motion or fabricated ETA.
- Keyboard leaves search/results and Continue reachable. Text scaling does not hide plate, price or safety actions.
- Shared components provide labels, focus, touch targets, semantic statuses and stable busy controls.
- Timestamp/fare/distance display uses actual INR/km data and existing local time formatting.

## 15. Build phases and checklist

The user authorized implementation on 8 November 2026. The defaults in section 17 apply: liquid glass, category matching with public-safe previews, validated passengers, no decorative stops/rewards, and verified View receipt.

### A — Reference agreement and baseline

- [x] Analyze all seven reference frames and arrows.
- [x] Identify current flow differences and missing contracts.
- [x] Specify page content, ordering, widgets and transitions.
- [x] Resolve section 17 choices and update this plan.
- [x] Establish automated test baseline and 320 px / landscape acceptance sizes.
- [ ] Capture native phone screenshots for reference comparison.

### B — Shared ride coordinator and visual primitives

- [x] Shared booking/draft state and server-status mapping, using the existing repository contracts.
- [x] Shared map shell, route fitting, pins and overlay geometry.
- [x] Shared driver/vehicle identity, ETA strip, route timeline and sticky action components.
- [x] State recovery, back-navigation and notification routing tests.

### C — Home and location entry

- [x] Reference Home and place-photo strip.
- [x] Dedicated location-selection page and map-pick variant.
- [x] Preserve search debounce, drag settling, confirmation and draft edits.
- [x] Keyboard, permission denial, stale-result and route-invalidation regressions.

### D — Category, availability and booking

- [x] Dynamic category tiles and server quote presentation.
- [x] Approved real nearby-preview API and vehicle/driver cards.
- [x] Passenger input/contract if approved.
- [x] Payment selection and optional note integrated in the selection sheet.
- [x] Move review/reconciliation behavior into the final Continue action.
- [x] Test quote expiry, category deletion/change, double-tap and lost booking response.

### E — Search, pickup and ongoing ride

- [x] Reference Finding Driver sheet and real matching feedback.
- [x] Assigned/arriving/arrived variants with actual identity and route.
- [x] Combined trip code and rider-start confirmation.
- [x] Compact ongoing-trip panel and real route progress.
- [x] Contact/chat/safety/cancellation integrated as secondary surfaces.
- [x] Test assignment races, reconnect/resume, stale GPS, route changes and no-show rules.

### F — Completion and receipt

- [x] Reference completion layout, inline rating and belongings reminder.
- [x] Verified final fare/collection summary.
- [x] Correct View receipt or approved real PDF download.
- [x] Home/history return and duplicate rating protection.

### G — Replacement and verification

- [x] Wire all entry points and active-trip recovery to the new flow.
- [x] Remove replaced live UI after behavior parity; preserve history pages.
- [x] Flutter analyze and focused/full shared-flow tests as warranted.
- [x] API compile/unit/format checks for changed backend contracts; no database-changing build shortcut.
- [ ] Compare actual native screenshots at each stage side by side against the seven-frame reference.
- [ ] Physical device: maps, sheet gestures, keyboard, GPS, phone/chat, background/resume and completed-trip recovery.
- [x] Update mobile design/screen catalog and completed implementation tracker.

## 16. What is deliberately preserved

One role-based binary; MapLibre and attribution; actual configured category fare policies; cash/direct UPI paid to the driver; zero commission; no rider-side payment success inferred from opening UPI; combined trip-start proofs; account ownership and session recovery; no active-trip queuing; reviewable cancellation/no-show rules; private asset protections; existing Settings/Partner/driver glass design.

## 17. Adjustment points before building

1. **Visual exactness:** proposed exact reference geometry/order with existing liquid glass and Outfit. Confirm whether blue/purple colors and opaque reference surfaces should also replace our material within this journey.
2. **Driver preview:** proposed real nearby candidate cards; assignment happens after acceptance. Confirm whether riders instead choose a specific driver, which needs targeted matching.
3. **Pre-booking identity:** decide whether candidate cards expose full name/plate or limited public identity until acceptance.
4. **Passenger selector:** the reference includes it; proposed implement validated capacity and persistence, not a decorative counter.
5. **Add stop:** visible in the reference; proposed defer until multi-stop business rules exist.
6. **Streak and rewards:** visible in reference; proposed omit unless real programs are defined.
7. **Bill:** proposed View receipt using current verified data, or approve a genuine downloadable ride PDF implementation.
8. **Place-strip selection:** proposed selecting a card fills destination and opens route confirmation; confirm if it should first open full place details.

These are the specific choices that make the mixed-app reference implementable without silently introducing a new booking or payment model. All other placement and flow details in this document are ready for review.

## 18. Implementation execution record — 8 November 2026

### Delivered source and responsibility

| Piece | Reusable implementation | Integration |
| --- | --- | --- |
| Map/panel layout | `RiderFlowScaffold` | Selection and live ride; draggable sheet, safe header, recenter and refresh |
| Headers and destination loading | `RiderFlowHeading`, `RideFlowSkeleton` | Location entry and vehicle/availability loading |
| Vehicle/driver identities | `RideVehicleDriverCard`, `RideFlowImage` | Public nearby preview, accepted driver, compact ongoing ride and completion assets |
| Search and progress | `DriverSearchRadar`, `RideRouteProgress` | Real search state and approximate progress derived from fresh route data |
| Booking correctness | `RiderBookingController` | Frozen request, one idempotency key, quote expiry, unknown-response recovery and guarded back/fresh-quote behavior |
| Vehicle screen | `VehicleSelectionPage` | Dynamic category strip, candidate carousel, passenger count, payment, note and persistent booking action |
| Search/pickup/ongoing | `RiderLivePanel` | Reuses the existing verified trip controller and contact/start/payment actions |
| Completion | `RiderCompletionPanel` | Belongings reminder, actual driver/vehicle, inline rating, recorded trip/fare and receipt |
| Endpoint editing | `HomePage(locationSelection: true)` | Dedicated pushed map/search page sharing the existing map/permission/debounce/drag-settling implementation |
| Nearby availability | `GET /api/v2/rides/availability` | Owner-scoped unexpired draft/quote, bounded candidates, matching eligibility, UPI filtering and public-only projection |
| Passenger count | Additive Ride field and migration | Validation against quoted/current category capacity, stored on booking, rechecked during dispatch, acceptance and start |

### Implemented journey

- [x] Home: MapLibre, profile/settings entry, actual shared-place photo strip, compact pickup/drop-off and Continue.
- [x] Dedicated location entry: editable endpoints, saved suggestions, three-second search settling, map picking and retained draft on back.
- [x] Location confirmation advances to vehicle selection; backing out of selection retains the Home route.
- [x] Dynamic category tiles, bounded nearby previews and coarse nearby map markers.
- [x] Passenger count, permitted Cash/UPI preferences and optional note feed final booking.
- [x] Continue books directly and opens Finding Driver without a compulsory review sheet.
- [x] Search, assigned, arriving, waiting/start verification and in-progress layouts use server states.
- [x] Ongoing ride uses compact identity, fresh route estimate, approximate route progress and existing contact/chat/safety.
- [x] Completion after a live trip displays the reference's summary/rating/action hierarchy.
- [x] History and receipt links retain verified historical trip details; active history links open the new live layout.
- [x] Existing session recovery, dual start proofs, reviewed cancellation/no-show and direct-payment semantics retained.
- [x] Production Home no longer invokes the old booking-review sheet. Its compatibility component remains for existing tests/callers.

### Explicit implementation boundaries

- Candidate previews show first name/avatar/rating and vehicle make/model/color. Full plate, private documents, phone and internal driver IDs are not exposed before assignment. Map positions are rounded to three decimal places and labelled Nearby.
- Candidate vehicle illustration uses the approved public category image. Accepted trips continue to use their actual public vehicle photo.
- Availability is a bounded snapshot refreshed on relevant selection changes and resume, rather than a separate high-frequency background poller.
- Add stop, streak, coins/rewards and targeted-driver booking remain excluded under the proposed defaults; there are no inactive placeholder controls.
- The completed action reads View receipt. No nonexistent PDF bill or fabricated payment receipt is advertised.
- Separate pushed map pages release covered Home map resources through its existing route observer. Live stages reuse their map element and current trip controller.

### Verification and rollout

- [x] Add focused controller regressions for expiry, immutable retries, committed-response recovery and unknown-state blocking.
- [x] Add vehicle-screen tests for direct category/passenger booking and 320 px / landscape large-text layouts.
- [x] Add backend validation/privacy tests and update route coverage manifest.
- [x] Flutter analyzer: no issues; full suite: 168 tests passed. Focused ride suite: 42 tests passed.
- [x] API compile, unit (230 passed), format and Prisma validation.
- [x] Final diff/whitespace inspection; local verification logs are ignored.
- [x] Applied `20261108120000_ride_passenger_count` to the configured API V2 `lif_test` database on 8 November 2026 after the missing-column report. Other deployment databases must also run migration deployment before the updated client/API serves them.
- [ ] Compare actual phone screenshots with the reference at all seven stages; native MapLibre/GPS and a real rider-driver lifecycle require device acceptance.

The migration was applied as the repair for the reported live quote failure, after confirming it was the only pending migration. The new field defaults existing rides to one passenger and does not delete their history.

## 19. Solid reference replacement — 8 November 2026

- [x] Rewrite `context/MOBILE_DESIGN.md` and `apps/user/v1/MOBILE_DESIGN.md` as the new solid reference specification.
- [x] Add reusable `SolidScope`, `SolidTheme`, `SolidSurface`, `SolidSheet`, `SolidPage`, `SolidButton` and `SolidIconButton` with neutral platform typography.
- [x] Convert Home, location entry, vehicle selection and live/completion compositions to the solid system.
- [x] Place the white top message, black external ETA strip, edge-to-edge white sheet and small handle at the reference proportions.
- [x] Recompose vehicle card with plate/make/model/color on left, contained image and blue category badge on right.
- [x] Place driver avatar/rating and real name beside black circular call/chat controls; reuse existing contact authorization and call-attempt recording.
- [x] Add the compact black/gray pickup-destination timeline and keep optional trip actions collapsed; required arrival/start proofs remain explicit.
- [x] Change rider route to blue and add a code-rendered coordinate-anchored top-down vehicle symbol and actual driver label.
- [x] Make legacy shared trip cards/buttons/menus render opaque under the captured solid scope, preserving their non-ride callers.
- [x] Flutter analyzer: no issues. Full Flutter suite: 170 passed. Added assigned-screen tests verify no backdrop blur, reference ETA/contact placement and normal/large-text layouts.
- [ ] Physical-device comparison with reference, real MapLibre styling and real vehicle/driver photos.

No backend state/payment/assignment rules changed in this visual replacement. Other existing account/partner/driver pages are not silently migrated by this task; the new document governs their future reworks. The reference's example car, sample identity and Top Rated trophy are never fabricated when actual data is missing.

## 9 November 2026 — Home place-strip and joined-header repair

- [x] Preserve the in-progress `SolidSurface.upperChild` / `blackHeight` API and edge-to-edge Home panel.
- [x] Fix shared surfaces losing finite child constraints through an unconditional Column.
- [x] Move Home place cards outside the white route panel; use a compact photo/title variant with scaled height.
- [x] Keep the black header and rounded white body joined, with an hourglass and gray estimate pill.
- [x] Use honest pre-booking trip estimates; retain driver ETA wording for assigned trips.
- [x] Extend live black-strip backing under rounded white corners; adapt ETA layout for large text.
- [x] Bound the Home overlay, preserve safe-area/keyboard access and make short-screen contents scrollable.
- [x] Bound missing-photo placeholders and retain accessible fallback labels.
- [x] Final analyzer: no issues. Full suite: 183 tests passed, including bounded 140 × 160 cards, optional headers, portrait/landscape and 2× text.
- [ ] Physical-device MapLibre/keyboard and visual comparison.

The reported 157 px RenderFlex error points to the shared surface/card constraint path. A second narrow-placeholder overflow was reproduced in a focused test and repaired. The preceding Android platform-view context diagnostic is separate; this repair does not modify MapLibre, native files or the SDK cache, and does not claim that native diagnostic is resolved.

## 9 November 2026 — Shared parent panel across every ride stage

### Plan and implementation checklist

- [x] Use one reusable parent surface for every booking stage: a solid black title/status strip directly attached to the rounded white main-content sheet.
- [x] Keep Home and location selection in the same `RideStagePanel`; give location entry its own title and active endpoint label.
- [x] Put category selection and booking in `RideStagePanel` inside the map/draggable-sheet scaffold.
- [x] Put searching, assigned, waiting/verification and in-progress states in that same parent; each stage supplies its actual title and current timing/status value.
- [x] Put completion and receipt/rating content inside the same parent and preserve refresh/back actions.
- [x] Remove duplicate floating/map and centered-search titles so the shared black header is the single stage title.
- [x] Keep map, back/recenter controls and map attribution outside the sheet parent; preserve controller-owned state, polling, booking and server transitions.
- [x] Regression test the shared stage container and Home layout at portrait, landscape and large text.
- [ ] Compare all ride stages on physical devices against the supplied reference and verify live MapLibre/device safe-area behavior.

Implementation: `RideStagePanel` is the shared black-header/white-content parent in `rider_flow_components.dart`. `RiderFlowScaffold` now makes the black header part of the draggable sheet instead of positioning it as a separate sibling. Home and location selection use the same panel; completion keeps refresh and back controls inside the white content area.

## 9 November 2026 — Independent pickup/drop-off selection and swipe-to-continue

### Plan and completion checklist

- [x] Open a dedicated picker from each Home endpoint row, with only that pickup or drop-off editable.
- [x] Present one search field, a saved-Home shortcut and stacked place suggestions with primary/secondary labels and optional distance.
- [x] Center the map on a selected result, retain a fixed center pin, support map dragging to refine, and reverse-geocode the settled center.
- [x] Confirm only the active endpoint and return to Home phase 1; do not request quotes or continue automatically.
- [x] Keep Home's continue action hidden until both endpoints are selected; require a swipe with a blue progress trail and right-facing car icon.
- [x] Replace the assigned-driver vehicle marker with the supplied top-down car PNG and hold its front upright on screen.
- [x] Add shared-flow regression coverage for the swipe threshold and preserve the existing Home layout coverage.
- [x] Flutter analyzer and full Flutter test suite pass after the implementation.
- [ ] Check the real MapLibre map, search suggestions, center-pin drag and final swipe on a physical device.

Implementation lives in `home_page.dart`, `home_controller.dart`, `rider_flow_components.dart` and `rider_trip_map.dart`. The added PNG is a bundled asset; a future Shorebird delivery requires a new base release rather than a Dart-only patch.

## 9 November 2026 — Shared ride endpoint pin artwork

- [x] Use the supplied pin PNG for the map-center selector and confirmed ride endpoints.
- [x] Render pickup green and drop-off red in the picker, rider trip map and driver trip map.
- [x] Remove Home's separate auto-current-location and saved-place pins; the MapLibre location puck remains the only standalone current-location marker.
- [x] Remove nearby candidate vehicle dots from the ride-selection map; keep actual assigned-driver vehicle tracking.
- [x] Replace the old circle endpoint markers in rider and driver trip maps.
- [x] Verify the source asset and generated green variant retain dimensions and endpoint colors.
- [ ] Verify map symbol sizing and pin anchoring on a physical device.

The shared rendering helper is `ride_map_pin_assets.dart`. The selected endpoint uses the single fixed center pin while the map is being adjusted, avoiding a duplicate coordinate-anchored pin in the same picker screen.

## 9–10 November 2026 — Consistent 80% ride-map viewport

- [x] Set Home's map viewport to 80% of screen height.
- [x] Set every `RiderFlowScaffold` ride map to the same fixed 80% viewport.
- [x] Keep the shared draggable bottom sheet starting at 30%; it overlays the map instead of resizing it.
- [x] Add layout assertions for Home and shared ride stages.
- [x] Verify focused ride layout tests and Flutter analyzer after the 80% adjustment.
- [ ] Compare map framing and sheet expansion on physical devices, including landscape and large text.

The original 70% viewport was increased to 80% on 10 November 2026 at the user's request. The sheet remains at its existing 30% initial extent and overlays the lower map area.

## 10 November 2026 — Home Continue slider style and hint

- [x] Keep pickup/drop-off rows and the shared Home panel intact; use the slider only in the Continue action slot.
- [x] Remove the surrounding frame and reduce the slider height to 64 px; tighten the Home gap before the control.
- [x] Make the car rail 12 px high with a blue-to-blueAccent progress gradient.
- [x] Render the “Swipe right” hint as a cloud above the car and rail; hide it as soon as dragging begins.
- [x] Remove runtime car tinting and use the bundled car artwork directly.
- [x] Verify slider geometry, hint layering, Home layout and Flutter analysis.



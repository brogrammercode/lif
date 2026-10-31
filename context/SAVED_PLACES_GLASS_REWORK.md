# Saved places: map, carousel and detail

31 October 2026. Preserve the mobile liquid-glass system and use the supplied two screenshots only for content hierarchy.

## Tasks

- [x] Replace flat white My Rides tabs/filter chips with reusable glass controls, preserving selection, counts, clearing and accessibility.
- [x] Build the saved-place map with coordinate-anchored check markers and synchronized, equal-size bottom cards with side peeks; no carousel zoom or scaling.
- [x] Add glass search/type filters, loading/error/empty/retry states and retained refresh data.
- [x] Build place detail in order: map, name/address/type, photos, actual visit context, map/visit actions, secondary actions and reviews.
- [x] Persist supported place content and actions with server validation, ownership and bounded responses; do not fabricate photos, visitors, reviews or business contact information.
- [x] Preserve add/edit/remove, address coordinates, account isolation, map attribution and rider/driver routing.
- [x] Verify glass controls, carousel/map synchronization, mutations, detail mapping and responsive layouts; update design guides and behavior records.

## Data/privacy decision

The user confirmed shared places and community content, plus a separate map-based Add Place page. New places/photos/visits/reviews are shared with signed-in members. Each account owns its bookmark, self-reported visit and review. Place contributors own their place edits, and photo authors own their photo removal. Public identities contain names/avatars rather than account phone/email or documents. Place phone/website information is explicitly contributed as public information.

Previous personal Home/Work/Other records remain available under Previous saves, with removal and explicit sharing through the new picker. The additive migration does not silently publish or delete existing addresses. Newly shared bookmarks use a nullable link on the existing saved-place table, preserving Home's saved-place markers and old client contracts. Unsave removes only the current member's bookmark; shared photos, visits, reviews and other accounts' saves remain.

Reference restaurant images, visitor totals, price/cuisine tags and ratings are examples, not seed data. Actual photography comes from contributions; the existing geocoder provides addresses, not place photographs.

## Implementation

- `LiquidGlassChip` supplies scoped glass tabs/filter actions/removable selections in My Rides and place controls. It retains semantic selection, focus and reduced-motion/high-contrast behavior without native Chip backgrounds.
- `SavedPlacesPage` uses a full MapLibre canvas, glass header/search/account/type filters and a `PageController` carousel with `.87` viewport fraction and equal-size cards. No card transform or carousel camera zoom is applied. The map pins match the currently paginated set, with a visible range/total. Selection pans the pin into the exposed map above the cards. Short screens and large text use a scrollable map-and-card layout.
- `PlacePickerPage` supports map dragging/tapping, settled reverse lookup, three-second address search, stale-result invalidation, a selected-point/photo preview and the glass form. Coordinates come from the selected point, not address text or a presumed device position. Back retains edits. Local photos wait until Save; uploads are sequential and retries reuse keys. A partially saved submission can finish without remaining failed photos rather than duplicating the place on reopening.
- `PlaceDetailPage` follows map → heading/info → gallery → visitors → primary actions → secondary actions → reviews. Save/visit/review operations refresh verified data while retaining the loaded place on read failures. A late refresh cannot replace newer mutation results. Only actual contributed contact links appear. Members can manage their own photos and review.
- `PlaceDirectionsPage` uses existing device-location permission handling and the existing routing API to show an in-app MapLibre driving-route preview, estimated distance/duration and both endpoints. It preserves the current role, active-trip routing and driver availability; it does not create a booking.
- `PlaceMap` reuses the configured OpenFreeMap style, bounded code-rendered markers, attribution, serialized source updates, camera framing and an independent map-load timeout/retry surface. Native projection/framing remains a device check.

## API and data

API V2's `places` Nest module separates controllers, service and repository. Authenticated list/detail/review routes and create/edit/bookmark/visit/review/photo actions are registered in the route manifest, with readable audit titles. Lists are bounded to 50 places and 20 reviews per page. Summaries use database rating/count aggregation with bounded photo/visitor projections. Search deliberately matches names/addresses case-insensitively; IDs remain opaque strings.

Shared place identity deduplicates normalized name and coordinates rounded to five decimal places; the first contribution retains its display spelling. Bookmark/visit upserts and one review per member/place prevent duplicate submissions. Account lifecycle checks, per-place locks, contributor/revision checks and atomic user audit protect writes. Photo request keys are scoped to the uploader and checked against place/content hash; a changed payload fails with a conflict. A global per-account request-key lock also protects concurrent uploads across places. Proven duplicate/rejected uploads are cleaned up; ambiguous persistence errors retain the object rather than deleting an image that may have committed.

Public photos use the centralized WebP converter, a 3 MB input limit and a ten-photo cap per place. A photo is removed from Cloudinary only after its author-owned database deletion commits. Place details, visitors and reviews do not expose users' phone/email or private onboarding documents.

## Verification and rollout

- Flutter analyzer: **no issues**. Full Flutter suite: **151 passed**.
- API V2: **228 unit tests passed**; `build:compile` and `format:check` passed. Prisma schema validation and client generation passed.
- New checks cover synchronized cards/map selection, query isolation, actual visitor/review rendering, selected coordinates, final-submit-only saving, retained form edits, stable photo retry keys without duplicate creation, review validation and short/landscape layouts at 200% text. API fixtures cover input safety, deduplication, bookmark/visit/review isolation, creator/version checks, lifecycle denial, photo replay/ownership and bounded public summaries. Existing ride/session/onboarding/vehicle/payment regressions pass.
- Phone-size Outfit/icon previews were inspected under ignored `apps/user/v1/build/ui-review`. Their map surfaces are labeled test substitutes, not proof of native MapLibre rendering. No real photos, notifications or test accounts were uploaded/created in shared services.
- Migration `202610310001_shared_places` was generated from the previous/current schemas, reviewed for additive-only operations and wrapped in a transaction. It adds four tables, indexes/checks and a nullable link on saved places. **It has not been applied to a shared database.** Deploy it with API V2 (`npx prisma migrate deploy`) before distributing this client. No destructive schema push/reset was used.
- Updated both mobile design guides, the screen catalog and app README. Git whitespace checks pass. Native toolchain, dependency versions, signing and release metadata are unchanged.

## Device acceptance

- [ ] Inspect native MapLibre markers, taps, camera framing, attribution and scrolling on a phone.
- [ ] Verify photo picking, external directions/contact/share intents and return navigation on a phone.

No native/toolchain/dependency changes, release, version bump or push are requested.

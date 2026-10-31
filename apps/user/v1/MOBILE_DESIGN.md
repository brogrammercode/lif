# 1More mobile UI

The canonical mobile design specification is [context/MOBILE_DESIGN.md](../../../context/MOBILE_DESIGN.md). Read it before new screens and UI reworks. Keep one shared specification rather than maintaining separate rider/driver styles.

Use Outfit, pastel lighting, real bounded liquid-glass blur, reflective rims, readable slate text, dark glossy primary actions and semantic green. Reuse `lib/components/ui/liquid_glass.dart`, the theme and existing shared components. No bottom navigation.

## Dropdowns

Use `LiquidGlassDropdownFormField<T>` from `lib/components/ui/glass_dropdown.dart` for every form dropdown. It owns the glass field, chevron, anchored glass menu, selected-row check, long-list search, loading skeleton, safe bounds and focus/validation states. Supply the original option values and readable labels using `DropdownMenuItem<T>`. Supply `searchLabel` when an option has rich/custom widget content instead of a plain `Text` label.

Use `LiquidGlassSelectField` for a trigger that opens a dedicated catalog/search route. Keep its existing catalog suggestions, approval locks and validation. Do not wrap either component in another glass surface or replace it with a plain native dropdown.

Retain opaque IDs, false/empty-string selections, dependent address resets, disabled/busy states and original validators. Keep 16–20 px between controls, with 20 px between Partner Program fields. Native date picking stays separate from option menus.

## Application uploads

List image/document selectors vertically at full width, with 20 px spacing and a matching skeleton. Keep image previews bounded, names/limits readable and review/rejection feedback next to the field. Do not place application upload cards in a row/grid. File selection remains local until final Submit; retain camera-only selfie capture and the existing sequential upload/draft recovery behavior.

Application field descriptions and supporting guidance appear only while that editable field has focus. Reuse `FocusFieldHint`; keep labels, answers, required markers, validation errors and approval/rejection feedback visible. Upload format/size guidance is contextual while editing and remains available in the file-review sheet. Do not hide postal/map attribution or actionable errors with optional helper copy.

## My Rides

History and trip details share Settings' backdrop, glass surfaces, icon wells, calm typography and skeletons. History keeps All/Active/Past plus Completed/Cancelled/Unfulfilled, bounded pagination and same-query refresh retention. Search pickup/destination/trip reference, and use the shared glass category/month filter sheet. Counts and filters come from the rider-scoped API across the matching history, rather than only the loaded page. Month boundaries use IST. New filters/pages clear old rows, and outdated responses cannot replace the current query.

Trip details place the stored route/date first, then pickup/drop-off, driver/vehicle, recorded-or-quoted metrics and rating, followed by server fare/collection details. Retain active-trip navigation and actions. A historical map previews stored coordinates/booking geometry; it must not show fabricated traffic or live driver positions. Use INR/km and real timestamps rather than the mockup's example taxes, discounts or units.

Use outcome-specific content: show driver/plate as unassigned when no match occurred, and only show actual trip events and search duration when recorded. Separate quoted fare, final fare, recorded collection/refund and reviewed cancellation/no-show fees. A quote alone is never proof of money collected or refunded. Retry/Book again requests a fresh quote; receipt opens a newly verified completed trip. Safety/help uses the actual trip/account, configured contacts and existing static manual sharing/reporting actions. Do not invent service-level promises, payment holds, invoice PDFs or live/encrypted sharing.

Use `LiquidGlassChip` for the status tabs, Date/category action and removable applied filters. It owns their glass surface and selection/check/remove states, avoiding Material Chip's opaque default fill.

## Saved places

Use the full MapLibre map with coordinate-anchored place/check markers, floating glass search/filters and a fixed-size card carousel with side peeks. Card selection and pin taps stay synchronized without card scaling or camera zoom changes. Keep attribution visible above the floating cards and show pagination for the loaded map set.

Add Place opens a map picker with a selected-location/image card, followed by the shared glass details form. Photos are previewed locally and uploaded only at final Save, sequentially with stable retry keys and centralized WebP conversion. Back navigation retains edited values. Detail order is map, place heading/info, photo carousel, real visitors, map/visit actions, secondary actions and review cards. Directions use an in-app route preview; show phone/website only when actually contributed.

New place content is shared; bookmarks, visits and review editing remain account-scoped. Previous personal saves are preserved and can be explicitly shared through the picker. Empty images, visits and reviews have honest empty states. Short screens and large text use a scrollable layout with reachable map/cards/controls. See [implementation and deployment checks](../../../context/SAVED_PLACES_GLASS_REWORK.md).

See [the My Rides rework](../../../context/MY_RIDES_GLASS_REWORK.md) for verification and device acceptance.

## Settings secondary pages

Notifications, emergency contacts, support requests/conversations and payment methods use the shared Settings intro, section, status, empty and list-skeleton components. Keep real records visible while refreshing. Use validated glass dialogs and sheets for create/edit/destructive actions; do not return to flat white dialogs, circular page loaders or raw icon-only entity actions.

Notifications expose real unread/all counts and existing targets. Emergency contacts use E.164 phone input and clear call/edit/remove actions without implying automatic dispatch. Support keeps configured phone/email/manual WhatsApp channels separate from persistent requests and visually distinguishes the account from 1More Support in the conversation. Payments explain direct Cash/driver UPI and zero commission without pretending provider card/wallet collection exists. See [the implementation tracker](../../../context/SETTINGS_SECONDARY_PAGES_GLASS_REWORK.md).

See [the dropdown rework](../../../context/MOBILE_DROPDOWN_REWORK.md) and [category-step form](../../../context/PARTNER_APPLICATION_CATEGORY_STEPS.md) for implementation and verification records.

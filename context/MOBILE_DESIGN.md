# 1More mobile design system

**Current mobile design authority — 30 October 2026.** Use this liquid-glass style for all new mobile UI and future mobile UI reworks unless a later user request explicitly changes it. Settings and the Partner Program journey establish the implementation. The admin workspace continues to follow `WEB_DESIGN.md`.

## Reference and direction

Reviewed references in `C:/Users/harsh/Downloads/settin`:

- `ChatGPT Image Oct 29, 2026, 05_52_44 PM-3 1.png`: profile, icon wells, upload previews and document cards.
- `Dreamy Driver Details UI Mockup 1.png`: calm form spacing, frosted inputs, dark rounded Continue action.
- `Pastel Driver Details App Mockup 1.png`: contact fields and document/photo capture surfaces.

Use their pastel blue/lavender atmosphere, translucent layers, rounded glass rims and restrained typography. Render the material in Flutter code. Reference artwork, illustrative phone frames, example names, document totals and dummy vehicles are design examples and do not become app content.

**Do not add bottom navigation.** Settings has no bottom bar. Retain clear back navigation and the existing authenticated route/active-trip recovery behavior.

## Material construction

The glass effect combines actual background blur, translucent layered color, bright directional rim reflections, a finer inner edge and a soft ambient shadow. Let the backdrop remain visible through the surfaces. Settings tiles, form sections, input wells, upload cards, chips, circular icon controls, dialogs, sheets and primary actions use the same material family.

Use `lib/components/ui/liquid_glass.dart` as the reusable implementation:

| Component | Use |
| --- | --- |
| `LiquidGlassScope` | Scoped form/control theme, retaining the app's existing font. |
| `LiquidGlassBackdrop` | Static code-drawn pastel lighting and grouped backdrop source. |
| `LiquidGlassSurface` | Clipped blur, tint, highlights, inner rim, corners and shadow. |
| `LiquidGlassPage` / `AppPage(glass: true)` | Shared header/back action, safe areas and page canvas. |
| `LiquidGlassIconButton` | Circular glass back, refresh, gear and similar controls. |
| `LiquidGlassButton` / `AppButton` in the scope | Dark glossy primary action with a stable busy state. |
| `LiquidGlassDialog` | Bounded, scrollable glass confirmation/preview dialog. |
| `LiquidGlassSheet` | Glass action sheet with a handle and scrolling content. |
| `LiquidGlassFormSkeleton` | Matching form/document loading surfaces. |

`AppCard` becomes a glass surface inside the scope, keeping existing feature code reusable. Other existing screens adopt this style when they are reworked; do not silently change unrelated operational UI in a focused task.

### Palette

| Role | Value / treatment |
| --- | --- |
| Canvas | `#E5ECFB`, with diffuse blue, lavender, peach and pink lighting. |
| Primary text | `#182133`. |
| Secondary text | `#586780`; keep helpers legible over translucent surfaces. |
| Control accent | `#354E79`. |
| Glass fill | Directional white at approximately 16–48% opacity with a subtle cool tint. |
| Rim | Bright white at the upper light edge, fading into blue/lavender and lower white reflections. |
| Primary action | Dark translucent slate/navy, light upper reflection and white label/icon. |
| Semantic colors | Existing green for approved/success, red for rejection/error and amber for review/warning. Always include text/icon meaning. |

Keep brand green in meaningful brand/semantic roles. Reworked glass flows use the reference's dark primary action rather than introducing unrelated button colors per screen.

### Shape, depth and spacing

- Standard panels: 24 logical-pixel radius; input wells: 20; dialogs/sheets: 24–30; primary actions: 28; circular controls: fully round.
- Main surface blur starts at sigma 18. Clip every filter to its actual surface bounds.
- Bright outer rim about 1.35 px and a finer inset rim about 0.65 px. Reflections belong to the reusable painter, rather than individually drawn borders on every page.
- Shadows are soft and cool, with roughly 22 px blur and an 8 px downward offset. Keep nested controls lighter than their containing panel.
- Page insets: 20 px; panel insets: 18–24; gaps between related cards: 10–14; gaps between sections: 20–24.
- Primary buttons and tappable icon controls have minimum heights of 56 and 48 respectively. Controls grow for text scaling; do not crop large labels to keep a fixed mockup height.
- Profile tiles retain a 76 px minimum height, leading circular icon, title/helper and trailing chevron. Text wraps naturally on narrow devices.

### Typography

Retain Outfit through the existing mobile theme. Use medium/semibold weights and calm line spacing: page headings around 22–24, profile name 22, field/tile labels 14–15, supporting copy 12–14. Preserve authored document headings, lists, images and tables. Avoid applying very heavy headings, tiny helpers or all-capital section labels throughout the forms.

## Forms, uploads and documents

- Use the scope's rounded input theme and shared glass wells. Filled-field floating labels stay inside the clipped well; focus/error underlines remain visible alongside its reflective rim. Preserve read-only/disabled states, keyboard types, canonical dropdowns, validation, DOB limits and automatic IFSC formatting.
- Dynamic field labels and categories come from the API. Keep the server's approval/rejection status and reason adjacent to each answer. Approval must not be represented by color alone.
- File and camera capture share the same glass upload surfaces. Retain bounded previews, real filenames, open/remove controls and explicit replace/retake actions. Never substitute private documents for public avatars or catalog logos.
- Preserve existing file limits and JPEG/PNG/WebP/PDF acceptance rules. A design reference mentioning 10 MB or DOCX does not change the backend's supported file limits or formats.
- Keep local preview separate from submission/cloud upload. Preserve sequential uploads, account-scoped draft recovery, retry reuse, protected-route recovery and camera-only live selfie provenance.
- Policies and confirmations remain rich document surfaces. Retain accepted revisions, field validation and explicit policy/confirmation consent. Keep PDF download and final activation actions clearly visible.
- Date/option pickers retain their supported native/Flutter behavior and receive the scoped palette. Do not replace working input semantics merely to imitate a mockup.

## Loading, failure and feedback

- Loading uses the same background, avatar, glass panels and field geometry as the destination. Use document blocks for document loading and field wells for form loading.
- `AppSkeleton` shares one animation controller, painting shimmer only into its placeholder shapes. This keeps real backdrop filters outside a whole-layout shader mask/save layer.
- Respect reduced motion, accessibility navigation settings and hidden routes. Glass lighting itself is static and needs no continuously running animation.
- High-contrast mode uses readable solid surfaces and disables backdrop blur. Preserve clear text and focus/validation feedback.
- Keep loaded data during a recoverable refresh failure. Show clear retry/error states, preserve drafts and make busy actions non-interactive without shifting their layout.

## Performance and rendering

Group **non-overlapping sibling** backdrop filters with `BackdropGroup`. Nested glass wells inherit the containing surface's blur while retaining their own tint/rim; do not stack repeated blur operations on the same content. Overlapping modal layers have their own backdrop group.

Keep filters bounded to visible controls. Large live MapLibre views require a clear map with bounded glass controls; avoid a blur operation across the entire moving map. Keep image decoding constrained and document scroll areas bounded. Use static custom-painted ambient lighting instead of adding large decorative bitmap assets or a new glass package.

The implementation follows Flutter's [BackdropFilter guidance](https://api.flutter.dev/flutter/widgets/BackdropFilter-class.html) and [BackdropGroup API](https://api.flutter.dev/flutter/widgets/BackdropGroup-class.html) for clipping and grouping filters. Profile raster/render performance on real devices before claiming frame-rate guarantees.

## Interaction and scope

Settings keeps its five primary cards, profile photo controls and gear/action sheet. Partner Program, mode switching, relevant history/account links, saved places, notifications, emergency contacts, support and confirmed sign-out remain accessible. Back navigation retains existing session/active-trip gates; no bottom navigation is introduced.

Apply the same material across policy, application details, documents/live selfie, submitted/rejected review, confirmation, final PDF, activation, exit/dues, and the linked vehicle-registration/catalog-suggestion/document forms. Maintain every existing business transition, ownership check and approval gate.

For future work: read this document first, reuse/extend these components, add matched skeletons, and verify phone/landscape/tablet layouts, text scaling, keyboard use, modal scrolling and focus. Run Flutter analysis and relevant regressions. No routine APK build is required for these Dart UI changes.

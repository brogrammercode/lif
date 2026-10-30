# Shared liquid-glass dropdowns

30 October 2026. Flutter user/driver app. Preserve the preceding category-step form work.

## Checklist

- [x] Replace every native dropdown field with the shared glass selector and open menu.
- [x] Match catalog selection triggers without changing their search/suggestion routes.
- [x] Preserve original values, IDs, booleans, validators, dependent address resets and locked/busy states.
- [x] Provide bounded glass menus, visible selected options, long-list search, keyboard access and dismiss behavior.
- [x] Stack application image/document selectors vertically and increase field spacing; match their skeleton.
- [x] Update the canonical and app-local mobile design references.
- [x] Verify menu selection/dismissal, validation, dependencies, keyboard, narrow/large-text/keyboard-inset layouts and existing app regressions.

The material remains `MOBILE_DESIGN.md`: translucent pastel wells, clipped blur, reflective rims, Outfit and readable slate text. This task does not redesign operational map pages or change domain/API contracts.

## Implementation

`lib/components/ui/glass_dropdown.dart` supplies a form field and matching selection trigger. Open menus have their own clipped backdrop group, selected-row check, bounded scrolling, label-based search for eight or more choices, and keyboard/outside/close dismissal. Loading options use an in-field skeleton. An option removed or disabled while a menu is open cannot be applied after the menu returns.

Migrated Partner Program gender/ownership/boolean and postal directory fields; vehicle category, vehicle/fuel type and brand/model triggers; saved-place type; rider booking/review payment choices; driver collection method; and cancellation reasons. Original API values remain unchanged; enum-like display labels are human-readable.

Brand/model choices still open the existing searchable catalog route, including Requested suggestions. Partner Program uploads now occupy a full-width vertical column with 20 px field spacing. Their loading skeleton uses the same arrangement. The canonical guide and `apps/user/v1/MOBILE_DESIGN.md` record these rules.

## Verification

- Flutter analysis reports no issues.
- The final full Flutter suite passes **126 tests**. Git whitespace and Dart formatting checks pass.
- Eight new shared-component widget regressions pass: opaque IDs and form save/reset; false/empty-string values; stale/dependent choices; loading/locked/disabled controls; case-insensitive search and keyboard selection; narrow large-text/high-contrast layouts; and landscape with keyboard insets.
- Partner Program regressions verify vertical alignment, full-width matching upload cards and at least 20 px between selectors, as well as existing sequential uploads/drafts/review locks.
- Rendered normal/large-text/high-contrast dropdown and application previews were inspected in the ignored `build/ui-review` directory.
- Vehicle tests wait for the scrolled button's final layout before tapping, retaining their original submission/cleanup/conflict assertions after the new field heights.

## Device acceptance

- [ ] Check menu positioning over native MapLibre views, system keyboard transitions and accessibility services on target phones.
- [ ] Check the vertical application form with the real configured fields and native camera/file pickers.

Automated tests use isolated fixtures. No production records, notifications, native toolchain configuration or dependency versions are changed.

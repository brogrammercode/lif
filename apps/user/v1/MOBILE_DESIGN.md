# 1More mobile UI

The canonical mobile design specification is [context/MOBILE_DESIGN.md](../../../context/MOBILE_DESIGN.md). Read it before new screens and UI reworks. Keep one shared specification rather than maintaining separate rider/driver styles.

Use Outfit, pastel lighting, real bounded liquid-glass blur, reflective rims, readable slate text, dark glossy primary actions and semantic green. Reuse `lib/components/ui/liquid_glass.dart`, the theme and existing shared components. No bottom navigation.

## Dropdowns

Use `LiquidGlassDropdownFormField<T>` from `lib/components/ui/glass_dropdown.dart` for every form dropdown. It owns the glass field, chevron, anchored glass menu, selected-row check, long-list search, loading skeleton, safe bounds and focus/validation states. Supply the original option values and readable labels using `DropdownMenuItem<T>`. Supply `searchLabel` when an option has rich/custom widget content instead of a plain `Text` label.

Use `LiquidGlassSelectField` for a trigger that opens a dedicated catalog/search route. Keep its existing catalog suggestions, approval locks and validation. Do not wrap either component in another glass surface or replace it with a plain native dropdown.

Retain opaque IDs, false/empty-string selections, dependent address resets, disabled/busy states and original validators. Keep 16–20 px between controls, with 20 px between Partner Program fields. Native date picking stays separate from option menus.

## Application uploads

List image/document selectors vertically at full width, with 20 px spacing and a matching skeleton. Keep image previews bounded, names/limits readable and review/rejection feedback next to the field. Do not place application upload cards in a row/grid. File selection remains local until final Submit; retain camera-only selfie capture and the existing sequential upload/draft recovery behavior.

See [the dropdown rework](../../../context/MOBILE_DROPDOWN_REWORK.md) and [category-step form](../../../context/PARTNER_APPLICATION_CATEGORY_STEPS.md) for implementation and verification records.

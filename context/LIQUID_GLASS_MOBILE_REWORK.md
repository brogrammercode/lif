# Liquid glass mobile UI rework

Reference authority: the three images supplied in `C:/Users/harsh/Downloads/settin`, reviewed 30 October 2026. Implement their pastel, translucent, softly rounded style in Flutter; the surrounding illustration/phone frame and mock data are not app content.

## Work checklist

- [x] Inspect all references, existing Settings actions and Partner Program states.
- [x] Create shared glass backdrop, surface, theme, controls, modal and skeleton primitives with real bounded backdrop blur and reflective edges.
- [x] Remove Settings bottom navigation completely; keep account actions and back/session recovery.
- [x] Apply the shared glass material to Settings cards, avatar controls, sheets and dialogs.
- [x] Apply it to policy, dynamic application/contact fields, documents/selfie, review and rejection feedback, confirmation and final PDF screens.
- [x] Apply it to activation, exit/dues and linked profile/vehicle-onboarding/document forms.
- [x] Preserve all permissions, drafts, uploads, validation, approval states and navigation gates.
- [x] Match loading skeletons to glass page layouts and maintain high-contrast/reduced-motion behavior.
- [x] Document the reusable specification in `context/MOBILE_DESIGN.md` and reference it from the root instructions for future mobile reworks.
- [x] Run Flutter analysis and appropriate widget/regression tests; inspect actual rendered previews.

No new package, Android configuration, version/build bump, backend change, release build or push is needed for this design work. Earlier uncommitted avatar/API and documentation work is preserved.

## Verification and rendering notes

- Flutter analysis: no issues. Full Flutter suite: 111 tests passed, including existing sequential-upload, draft-recovery and protected-session submission regressions.
- New coverage checks removal of bottom navigation, real backdrop filters, high-contrast fallback, nested blur reuse, policy/application/correction/confirmation/final-PDF states, confirmation consent/revisions, activation input and settled exit documents.
- The form tests wait for the layout after `ensureVisible` before tapping a resized upload control. Their submission/draft/security assertions remain intact.
- Rendered review images live in ignored `apps/user/v1/build/ui-review/`: Settings/profile/skeleton plus policy, application, corrections, confirmation, final PDF and activation, using synthetic account data.
- Visual review caught clipped floating labels in outlined inputs; the glass wells now use filled-field geometry with internal floating labels and visible focus/error underlines.
- Camera/avatar layers that overlap have separate backdrop groups. Nested controls reuse their panel's blur, and shimmer is painted only into placeholder shapes.
- Camera/gallery permissions, native-map composition and raster frame timing still require real-device acceptance. No APK was assembled for these checks.

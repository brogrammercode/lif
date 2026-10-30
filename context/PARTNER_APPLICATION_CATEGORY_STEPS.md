# Partner application category steps

30 October 2026. Flutter application presentation only; retain the API V2 workflow, review and submission contracts.

## Scope and checklist

- [x] Replace the long editable form with contact details followed by one step per configured requirement category.
- [x] Preserve server category order, opaque category identities, field values and review feedback when moving between steps.
- [x] Show progress, Previous/Continue controls and final-only submission, with validation before advancing.
- [x] Use compact responsive glass upload cards, camera-only live selfie capture and bounded local previews.
- [x] Keep uploads deferred until final Submit, sequential transfers, retry reuse, account-scoped draft recovery and approved-field locks.
- [x] Restore the saved step; route validation failures to the relevant step rather than leaving an invisible error.
- [x] Verify navigation, required fields, rejected/approved answers, uploads, draft reopening, narrow layouts and text scaling.
- [x] Run Flutter analysis and regression tests; inspect rendered previews. Device camera/picker acceptance remains separate.

## Design

The supplied Driver Details reference supplies the interaction concept: a clear category heading, compact input wells, upload tiles and a dark Continue action. The later spacing decision places uploads in a single full-width vertical column. `MOBILE_DESIGN.md` remains the material authority: Outfit, pastel lighting, real clipped blur, reflective rims and shared liquid-glass controls. No bottom navigation or new package is introduced.

The contact/delivery step retains the email and country-coded WhatsApp number needed for the final document. Requirements are grouped by category identity, including documents and the existing live selfie requirement. Categories without IDs in older snapshots use their exact name; distinct category IDs with matching names stay separate. Missing categories use Requirements. Submitted review and later confirmation/final-PDF/activation routes retain their existing behavior.

Changing steps never submits an application or uploads files. Only the last step exposes Submit. File limits, camera provenance, protected asset reads, policy/version checks and review locks remain unchanged.

Details use compact input wells without an extra card around every field. Upload fields within each category appear in one full-width vertical column, with 20 px between fields at all screen widths. Their skeleton follows the same layout. The shared upload component retains its original expanded presentation for other screens. Selected files expose a scrollable glass review sheet with bounded previews, real names and existing open/remove actions. Tile guidance respects configured extensions and file-size limits. See [the shared dropdown and spacing follow-up](MOBILE_DROPDOWN_REWORK.md).

Corrections initially open the first category with a rejected answer when there is no saved draft step. Approved answers remain locked. Missing or obsolete saved step keys fall back to contact/delivery. Back navigates to the previous category; leaving the first step retains the existing discard confirmation. Final validation includes all categories, and errors are visible at the top of the relevant category.

## Verification

- `flutter analyze`: no issues.
- Full Flutter suite: **118 tests passed**, including seven new category/interaction/layout checks and the existing upload/session/retry regressions.
- New checks cover distinct opaque category IDs with matching names, interleaved/uncategorized requirements, per-step validation, system back navigation, local file review/removal, saved-step restoration, missing offscreen answers, approved/rejected correction behavior and camera-only submission.
- Form, upload sheet and skeleton layout checks cover a 320 x 640 logical-pixel screen and 200% text size. Rendered previews with Outfit and real icon fonts were inspected under the ignored `apps/user/v1/build/ui-review` directory.
- Git whitespace checks passed. No dependencies, native configuration, server schema or API V1 source changed. No APK build was needed for this UI change.

## Device acceptance still required

- [ ] Exercise native file selection and live selfie capture on the affected physical phone, including background/camera return.
- [ ] Check scrolling and glass rendering with the actual configured categories and real document combinations.
- [ ] Submit/retry against API V2 and reopen the account-scoped draft on that device. Automated tests use isolated mocked uploads, not real customer documents.

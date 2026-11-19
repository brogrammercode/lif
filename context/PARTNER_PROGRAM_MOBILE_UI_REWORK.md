# Partner Program Mobile UI Rework

Status: visual implementation and focused static analysis complete. Device/provider-dependent review remains open.

Scope: the rider app's partner application from policy acceptance through driver activation. Keep the existing workflow, API contracts, draft storage, review gates and file handling intact. Visual rules follow `MOBILE_DESIGN.md` and `solid_ui.dart`.

## Screen and stage checklist

- [x] Policy acceptance: standard solid page header, policy document surface, one agreement control and one continue action.
- [x] Application contact and dynamic field steps: one progress rail, one stage title, concise guidance, shared labeled fields and consistent spacing.
- [x] Dropdown/address selection: shared opaque option sheet, with dependent selection and validation behavior preserved.
- [x] Document/selfie uploads: solid surfaces, existing local preview/capture and submission behavior preserved.
- [x] Review and correction states: concise status feedback, locked approved answers and rejected-field reasons retained.
- [x] Confirmation and signature: shared text field, acceptance control and one submit action.
- [x] Approved/completed state: final document and next required account action retained without duplicate refresh actions.
- [x] One-time driver activation: shared field/button scale, six-digit input, concise error feedback.
- [x] Loading state: solid skeleton matching form or policy content; no glass treatment.
- [ ] Device review: verify keyboard, large text, picker/camera handoff, scrolling and all dynamic category shapes on Android and iOS.

## Shared UI changes

- `SolidTextFormField` provides consistent external labels, input formatting, read-only/date-picker handling and optional prefix/suffix presentation.
- `SolidDropdownFormField` opens a constrained searchable solid option sheet and retains `FormField` validation.
- Partner field help remains contextual instead of repeating descriptions throughout the form.
- The form skeleton uses the same solid surfaces and avoids duplicate page padding.
- Primary partner actions are 60 px high; field groups have consistent 20 px vertical spacing, with no app-bar refresh action.
- Upload wells are taller, use a light neutral surface, and show selected images at 184 px in form rows and 236 px in the file review sheet.

## Verification

- [x] Run focused `flutter analyze` on changed shared UI and partner-program files (no issues found).
- [x] Run `git diff --check` (passed; Git emitted only its normal line-ending notices).
- [ ] Device/provider-dependent upload, capture and dynamic server field review remains outstanding until exercised on device.

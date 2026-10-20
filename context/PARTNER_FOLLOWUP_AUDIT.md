# Partner workflow follow-up audit

October 20, 2026. Reviewed the pending Partner Program, vehicle CSV importer and related Flutter/API V2 changes. API V1 was not edited.

## Fixed

1. **Empty exit response blocked new requests.** Flutter's response unwrapping returned the entire envelope when `data` was explicitly null. It now preserves null, so a driver without a request gets the creation form.
2. **Valid live selfies were rejected.** The system selfie used undotted extensions while submission validation expected dotted extensions. The system definition is now consistent, and validation normalizes both formats for existing snapshots.
3. **An unsubmitted selfie could be approved.** Per-field approval now validates the saved value and bound private assets. Final approval rejects missing required values and revalidates the selfie. Admin buttons also reflect missing required data.
4. **Location writes could outlive driver exit.** Location updates now use the same driver lock and participation check as other driver writes, with an explicit transaction timeout.
5. **Stale exit review could repeatedly submit the old revision.** Version conflicts now block further writes until an explicit reload. Reload remains available after conflict or fetch failure, including inside the completion dialog. Existing review controls are disabled during refresh.
6. **CSV source lines were misleading.** Preview/result row numbers now track original physical lines, including blank lines and quoted multiline fields. The API accepts the corresponding bounded line numbers and rejects duplicate row numbers within a batch.
7. **CSV API validation differed from preview.** The API rejects unknown columns, non-decimal seat/year strings and reversed year ranges before writing. CSV exports protect whitespace-prefixed formula cells; an invalid newly selected CSV no longer retains the previous filename.
8. **Camera recovery and feedback gaps.** Lost-camera recovery waits for a successful workflow fetch and blocks concurrent capture. Cancelling the camera restores the prior dirty state. File validation and camera permission errors now have useful user-facing messages.
9. **Exit request async races.** Flutter blocks duplicate confirmation dialogs, preserves the confirmed reason/version and ignores stale reads across submission. Background exit reads no longer overlap indefinitely.
10. **Draft feedback leaked into notifications.** Saving a review no longer sends a typed rejection reason unless the request was actually rejected.
11. **Existing exits were presented as new requests.** Application review now links directly to an existing exit request instead of reopening the creation dialog. Direct request IDs are encoded in API paths.

## Checks

- API V2: production compilation, Prisma schema validation and Prettier checks.
- Admin: TypeScript/Vite production build and Prettier checks.
- Flutter: `flutter analyze`, with all reported warnings fixed; no APK build.
- Git whitespace check.
- The open `C:/Users/harsh/Downloads/bhagalpur_marriage_halls.json` parses as JSON and contains 46 records with the expected field structure. It was not modified.

Automated suites were not run. Native camera permissions, SMTP delivery and device sharing still require a device/provider exercise. No accounts, application records, emails or WhatsApp messages were created by this audit, and local environment secrets remain excluded from Git.

## Second review pass

- Exit creation now takes a synchronous request lock before starting the API call, preventing repeated submit events before React updates the disabled button.
- PDF sharing holds each review screen's existing mutation lock throughout the native share dialog. Exit sharing records its audit after successful sharing, releases its lock on cancellation, and distinguishes a successful share from a failed audit write.
- CSV results are checked before changing progress: every submitted row must appear exactly once with a valid status and text fields. Invalid/incomplete responses stop the import and allow a safe retry.
- Flutter document picking is treated as a busy operation. Submission, overlapping pickers, refresh and navigation are blocked until selection/read completes. Cancellation restores the prior dirty state and preserves existing files.
- The additional open `bhagalpur_tent_houses.json` file also parses correctly: 34 records with the expected structure. Both downloaded JSON files remain unchanged.

# Partner application submission recovery

25 October 2026. Flutter user app only; API V2's existing contracts are preserved.

## Evidence

The form retained every selected document as a byte buffer, then allocated base64/JSON copies during submission while other buffers and decoded previews remained in memory. The 3 MB per-file cap did not bound combined memory usage. The connected Android phone has a historical low-memory exit for this application, but no matching fatal trace for this specific submission was available. This supports investigating memory pressure; it does not prove the exact reported crash's cause. No customer application was submitted during this work.

## Changes

- Stream selected documents into private application storage, enforcing file-size limits while reading. Page state holds paths and upload IDs rather than every file's bytes.
- Stage the camera selfie in the same way. Save draft state before opening native pickers/camera and retain Android lost-camera-result recovery.
- Encrypt draft metadata with secure storage, scoped to the signed-in account. Keep document bytes in that account's private application directory; reject foreign paths during restoration/removal.
- Restore matching-version editable drafts, including contacts, text, values, consent, selected files and completed upload IDs. Preserve approved server fields. Do not resurrect obsolete drafts after policy/version changes or committed submissions.
- Upload sequentially. A worker isolate reads and encodes one file into ready-to-send HTTP JSON, preserving camera provenance and existing upload endpoints. No file content is uploaded before Submit.
- Bound previews to 320 by 320 pixels. Hide previews during picker/submission work, wait for detachment before allocating payloads, and evict owned previews before camera/uploads and on memory pressure.
- Show progress and display failures beside Submit and in a snackbar. Keep selections and reuse completed uploads on retry.
- Handle local cleanup errors without turning a committed submission into an apparent server failure. Reopening after a lost response shows authoritative server status. Explicit discard and successful submission clear owned draft files.

The existing image/file picker packages remain: replacing a picker would not remove the accumulated buffers in the form. No new dependency, native permission, APK, Shorebird release, backend schema or API V1 change was introduced.

## Verification

- Flutter analyzer: no issues.
- Full Flutter suite: 81/81 tests passed for the submission rework; the authentication follow-up adds a ninth partner regression (see below).
- Eight new regressions cover twenty 3 MB staged files (60 MB on disk), bounded metadata, oversize/empty stream cleanup, foreign-path protection, actual worker-generated HTTP JSON/camera provenance, size rejection before HTTP, sixteen documents plus a camera selfie, sequential submission, partial retries/reopening, lost final responses and post-commit cleanup failure.
- Fixtures use isolated files and mocked HTTP/workflow responses. No customer documents were uploaded. Formatting and Git whitespace checks passed.

## Device acceptance

Fully stop and restart the updated app before retesting; hot reload cannot recreate old in-memory form state. Verify the original document/selfie combination on the affected phone, camera/background return, interrupted upload and saved-draft reopening. A matching runtime trace is still needed if the installed build continues to fail. These automated checks do not certify an unobserved native crash as resolved. No deployment or push was performed.

## Follow-up: tester mentioned a protected route

The phrase alone does not establish the failure's cause. Read-only checks against the configured public API confirmed `/api/v2/health` responds with JSON/200 and `/api/v2/partner-program/me` without credentials responds with the application's JSON/401 `UNAUTHORIZED` (`Authentication is required`), rather than a Vercel deployment-protection page.

The Partner Program controller uses authentication, without an admin-only or driver-only guard on application uploads/submission. Added HTTP regressions verify that valid rider and staff personal sessions reach both controller actions; their domain checks remain in the service. A Flutter repository regression sends a file upload, receives 401, refreshes once, replays the identical JSON with the new bearer token, and submits the application with that new token. No access guard was removed or relaxed, and these checks did not reproduce an authentication defect. An exact status/error code/request ID from the failing request is still needed to identify the tester's failure.

API V2's complete unit/HTTP suite passes 159 tests with this regression. Flutter's complete suite passes 82 tests, including all nine partner regressions; the analyzer reports no issues. Results are in the local `.partner-protected-*` logs.

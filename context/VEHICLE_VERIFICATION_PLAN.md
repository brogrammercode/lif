# Driver vehicle verification

## Intended flow

Activated drivers enter vehicle registration before driver home. They can submit multiple vehicles, use verified catalog entries or their own requested entries, and see each field's review status and correction reason. A vehicle becomes usable only after every field and its catalog entries are approved. Rejected submissions can be corrected and submitted again.

Required information: brand, model, selectable vehicle category, registration number, color, vehicle front/back photos, RC front/back images, insurance image, and pollution/PUC image. Model capacity and vehicle type come from the catalog and must match the category.

Catalog requests use the existing brand/model fields and remain REQUESTED. They do not silently become verified when a vehicle is submitted.

## Phase 1 — Existing flow and plan

- [x] Inspect activation, driver profiles, catalog requests, uploads, review components, and user navigation.
- [x] Define registration gate, multiple vehicles, private documents, per-field review, and correction behavior.
- [x] Record phases and completion checklist in this file.

## Phase 2 — API V2 and persistence

- [x] Add catalog references, field review persistence, version checks, and private vehicle attachments.
- [x] Add driver catalog choices, upload, list, submit, and correction endpoints.
- [x] Add admin list, private preview, and field review endpoints with audit records.
- [x] Preserve approved fields, prevent stale reviews, enforce ownership, and block unverified vehicles from rides.
- [x] Add driver/user filtering and driver classification to the user directory.

## Phase 3 — Admin

- [x] Add Vehicle Verification tab for each user and a list of their vehicles.
- [x] Reuse compact application form sections, attachment preview, field decisions, and correction dialogs.
- [x] Add Driver/User badges and a consistent directory filter.

## Phase 4 — Flutter

- [x] Gate activated drivers through registration before driver home.
- [x] Replace typed make/model with catalog selection and complete brand/model request forms.
- [x] Add matching image upload/capture tiles, local previews, bounded image processing, and upload progress.
- [x] Show multiple vehicles, review statuses, correction reasons, and correction submission.
- [x] Preserve active vehicle selection and existing category compatibility.

## Phase 5 — Completion

- [x] Run Prisma validation/generation, TypeScript checks, admin compile, Flutter analysis, and diff checks.
- [x] Review authorization, pending catalog handling, stale updates, upload lifecycle, and navigation.
- [x] Document deployment requirements and remaining limitations.

## Deployment

Backend changes are limited to `apps/api/v2`; the matching screens are in `apps/admin/v1` and `apps/user/v1`. Deploy the additive Prisma schema before using the new screens; the existing Vercel build runs Prisma generate and db push. Private vehicle images stay behind authenticated API endpoints and are converted to WebP centrally. No live users or test fixtures are created as part of implementation.

### Database completion

- Added and applied `0009_vehicle_verification` to the configured database.
- Final migration status confirmed all nine migrations applied and the database schema up to date.
- Schema comparison showed that `0008_partner_exits` was already present in the database but missing from migration history. Marked that migration applied before deploying the new migration.
- No existing users, vehicles, rides, or uploaded documents were removed.

## How to use

1. Activate a driver account and open driver home. With no approved registered vehicle, the app shows vehicle registration and review status first.
2. Choose a configured brand and model. Search and pagination are available. Missing entries can be suggested with the existing catalog fields, including an optional logo; their status remains REQUESTED. Only the requester's own pending entries appear in their choices.
3. Choose one compatible category or subcategory. Vehicle type and passenger seats come from the model. Enter the registration number and color.
4. Capture or choose vehicle front, vehicle back, RC front, RC back, insurance, and pollution/PUC images. JPEG, PNG, and WebP are supported, up to 3 MB each. Previews stay local until submission; uploads run individually, with progress and retry support.
5. In admin, open **Users**, optionally filter **Drivers**, select the account, and open **Vehicle Verification**. Select one of their vehicles and preview private images inline.
6. If needed, first verify its requested brand and model under **App > User > Vehicle Models**. Approve or request corrections for each vehicle field. All 11 fields must be approved before the vehicle becomes ACTIVE; an approved vehicle replaces an empty or unusable active selection when the driver is not on a ride.
7. Rejected fields show their reasons in the driver app. Changing a rejected or pending value resets that field to PENDING; approved fields stay locked and retain approval. For linked brand/model/category changes, the reviewer must request corrections on the affected dependent fields as well.
8. Pull to refresh review status, or return to the app to refresh the vehicle list automatically. Choose **Use this vehicle** after approval. Further vehicles can be registered through **Driver home > My vehicles**.
9. To update an approved vehicle's documents, request corrections on the affected fields in admin. This reopens verification, clears that vehicle's active selection, and puts its driver offline when necessary. An active ride must finish before this action is allowed.

## Implementation safeguards

- Private image access checks ownership or active administrator access. One vehicle cannot reuse images bound to a different vehicle.
- Approval and correction writes check the version and serialize against driver lifecycle changes. Stale screens must reload.
- Approval rechecks catalog verification, model ownership, type, seats, and category compatibility. Vehicle/category edits cannot bypass the new field review.
- Registration numbers are normalized and compared against older formatted values, avoiding duplicates caused by case, spaces, or hyphens.
- Capture uses bounded image sizes and previews. Encrypted drafts are scoped to the account and vehicle, with Android lost-capture recovery. Successful submissions clear their draft.
- Unsubmitted image uploads expire after 24 hours and are cleaned on the next upload; historical submitted images remain private and retained. Unused uploads are limited to 24 per account.
- Older vehicles without verification fields can complete the new form. This cannot interrupt an active ride; their old active selection is cleared when submitted for review.
- Matching and the Flutter gate share server eligibility for vehicles in the new flow. Revoked catalog entries and incomplete field approvals cannot make a newly verified vehicle available for rides. Existing legacy matching behavior is retained until those vehicles enter verification.
- Pending uploads are reused on identical upload retries. Replacing or removing an unused uploaded photo queues cleanup for the next submission, before any new uploads; capture and local previews continue to work offline. Submitted attachments remain retained for audit history.

## Checks and scope

- Prisma schema validation and client generation passed.
- API TypeScript checks, including existing test source compilation, and Nest compilation passed.
- Admin production build and changed-file formatting checks passed.
- Flutter analysis passed with **no issues**; no APK was built.
- Diff whitespace checks passed.
- Automated API, browser, and Flutter regression checks were added during the follow-up audit. No real database fixtures, mail, or messages are used by those checks.
- Real-device camera flows remain unverified. Document-expiry scheduling is outside this flow.

## Follow-up audit

- [x] Prevent removed draft images from reappearing, recover expired upload IDs, and safely discard corrupt drafts.
- [x] Refresh current vehicle decisions and catalog details when opening a correction form; preserve server-approved values.
- [x] Stop asynchronous load/capture work after the form is disposed and provide a reload action for stale versions.
- [x] Require retry payloads to match the committed submission; accept identical correction retries without resetting approval.
- [x] Deduplicate pending image uploads, enforce the 3 MB source limit, and release replaced unused uploads.
- [x] Recheck current catalog eligibility before matching vehicles and select an approved replacement when the previous selection is unusable.
- [x] Allow admins to reopen approved fields with a reason, preserving active rides and recording the previous review state.
- [x] Complete final builds, analysis, regression suites, formatting, and diff checks.

### Follow-up audit results

- **92 API unit/HTTP tests passed**, including retry conflicts, catalog ownership, stale reviews, private image ownership, upload cleanup, re-verification, and active-ride safeguards. The route manifest now contains 141 routes, including unused-image cleanup.
- **27 admin browser tests passed**, covering the existing workspace, partner reviews, directory filters, vehicle review, corrections, private previews, and conflict recovery.
- **18 Flutter tests passed**, including network-session regressions, draft restoration, corrupt/expired drafts, disposal during loading, stale-form reload, and deferred cleanup.
- API and admin production compilation passed; Prisma schema validation passed.
- Flutter analysis reports **no issues**. Changed-file formatting and diff checks passed. No APK was built.

## Second audit

- [x] Recheck driver-home eligibility after app resume and after returning from another route. Hide the previous home while checking, and return to verification when eligibility is revoked.
- [x] Keep registration and camera routes intact during lifecycle changes; do not refresh the vehicle list while another route covers it.
- [x] Fix Future-returning `setState` callbacks in vehicle-list refresh, gate retry, and driver-home profile refresh.
- [x] Enforce the 24-hour expiry of unsubmitted attachments during submission, while retaining previously submitted documents for corrections and audit history.
- [x] Detect JPEG, PNG, and WebP from their bytes before local preview/upload, including picker files with incorrect extensions; reject unsupported formats locally.
- [x] Return the same computed eligibility flag from field reviews and vehicle lists so the admin view keeps its availability information after a decision.

### Second audit results

- **93 API unit/HTTP tests passed**, including expired pending attachments versus retained submitted documents and eligibility returned after field decisions.
- **27 admin browser tests passed**; the admin production build passed.
- **25 Flutter tests passed**, including background/route-return eligibility checks, preserving registration during capture navigation, review-list refresh, image-signature detection, and unsupported-image rejection.
- API compilation and Prisma schema validation passed. Flutter analysis reports **no issues**.
- No APK was built. Real-device camera behavior remains a manual verification step.

## Shorebird publication — 2026-10-23

- [x] Confirm existing Android release `0.1.1+1` and authenticated Shorebird account.
- [x] Increment repository version/build to `0.1.2+2` for the next base release; explicitly build this OTA patch as `0.1.1+1`.
- [x] Reuse existing bundled car/image icons after the initial patch attempt detected two new Material Icons glyphs. The rebuilt font matches the base release byte for byte.
- [x] Pass Shorebird's native-code and asset checks without compatibility override flags.
- [x] Publish patch **1** (ID `743868`) for Android arm32, arm64, and x86_64 to staging, then promote to **stable**.
- [x] Push API/admin feature changes and confirm the production driver/admin verification routes return authentication errors rather than missing-route errors before promoting the patch.
- [x] Record the patch commands, version distinction, and publication in the user-app README.

The OTA patch updates existing Shorebird installations of `0.1.1+1`. No new `0.1.2+2` base APK was published. Shorebird compiled the Android app bundle as part of producing and validating the patch; this was a publication build.

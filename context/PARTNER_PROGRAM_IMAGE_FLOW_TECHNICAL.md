# Partner Program image and document flow

**Current implementation audit — 2 November 2026**

This document describes the code that currently runs when an applicant selects an image/document or captures the required live selfie, how the selection is retained, and what happens later during final submission. It is an implementation trace, not a claim that the reported device crash has already been reproduced or fixed.

## Executive summary

There are two native selection paths:

| Application field | Flutter package | Native action | Immediate network upload |
| --- | --- | --- | --- |
| Ordinary IMAGE, PDF or FILE requirement | `file_picker` 13.1.0 | Android system document picker/provider | No |
| `__live_selfie__` camera-only requirement | `image_picker` 1.2.4 | Front-camera capture activity | No |

After either path returns, the app **streams** the selected file into account-scoped private application storage. Flutter state and encrypted draft metadata retain only the private path, original filename and, after a successful upload, the API asset ID. A bounded 320 × 320 preview is decoded from that private copy.

Only final **Submit** starts uploads. Files are uploaded one at a time. A worker isolate reads one file, validates the 3 MB limit, base64-encodes it into JSON and sends it to API V2. The API validates the authenticated owner and requirement, validates the real file signature, converts images to WebP with Sharp, and stores the private bytes in PostgreSQL. The final application request contains asset IDs, not image bytes.

```text
Tap upload card
    |
    +-- ordinary image/document --> system file picker
    |
    +-- live selfie -------------> front camera
                                      |
                         native result returns to Flutter
                                      |
                         stream to private .pending file
                                      |
                     encrypted draft saves path + metadata
                                      |
                         bounded local preview is rendered
                                      |
                          user continues editing the form
                                      |
                              final Submit is pressed
                                      |
                      files upload sequentially to API V2
                                      |
                  images validate + convert to WebP on API
                                      |
                       private bytes persist in PostgreSQL
                                      |
                   application submits using only asset IDs
```

## Main implementation files

| Responsibility | Current file |
| --- | --- |
| Page state, picker calls, validation and submission orchestration | `apps/user/v1/lib/features/partner_program/pages/partner_program_page.dart` |
| Account-scoped staging files and encrypted draft metadata | `apps/user/v1/lib/features/partner_program/partner_draft_store.dart` |
| Upload JSON creation, HTTP calls and response validation | `apps/user/v1/lib/features/partner_program/partner_program.repo.dart` |
| Local image preview and upload/review UI | `apps/user/v1/lib/features/partner_program/widgets/partner_upload_tile.dart` |
| API routes and authentication boundary | `apps/api/v2/src/features/partner_program/partner_program.controller.ts` |
| API file validation, WebP conversion, persistence and application commit | `apps/api/v2/src/features/partner_program/partner_program.service.ts` |
| Upload request validation | `apps/api/v2/src/features/partner_program/partner_program.type.ts` |
| Image signature/size validation | `apps/api/v2/src/infra/media/image_upload.ts` |
| Sharp WebP conversion | `apps/api/v2/src/infra/media/image_transform.ts` |
| Private asset and application tables | `apps/api/v2/prisma/schema.prisma` |

## Page initialization before a file is selected

1. `PartnerProgramPage.initState()` starts `_load()` and a 20-second status poll.
2. `GET /api/v2/partner-program/me` returns the published/snapshotted policy, dynamic requirement definitions, existing application, answer statuses and already uploaded asset metadata.
3. The authenticated user ID creates a `PartnerDraftStore` rooted under the platform application-support directory:

   ```text
   <application-support>/partner_drafts/<base64url-user-id>/
   ```

4. Non-file draft metadata is read from `FlutterSecureStorage` using the account-specific key:

   ```text
   partner_application_draft:<user-id>
   ```

5. A draft is restored only when its application version and policy version still match the server workflow. Approved answers are never overwritten by a local draft.
6. Draft file paths are accepted only when they belong directly to the current account's private draft directory and still exist. A foreign path is not restored or deleted.
7. On Android, the page checks once for both camera and ordinary document-picker results lost when Android destroyed the Flutter activity/process. Camera recovery uses `ImagePicker.retrieveLostData()`; file recovery uses `FilePickerAndroid.retrieveLostData()` and the persisted in-flight field descriptor.

## Ordinary image/document selection flow

This path runs for dynamic `IMAGE`, `PDF` and `FILE` fields whose `capture_mode` is not `CAMERA`.

### 1. User interaction and re-entry guard

The glass upload card calls `_pick(definition)`. The method exits immediately when a save, another file selection or selfie capture is already running. The shared busy state disables all upload controls during this work.

### 2. Preserve the form before leaving Flutter

Before opening a native picker, the app:

1. remembers whether the form was already dirty;
2. marks the form dirty;
3. sets `_pickingFiles = true`;
4. persists the field ID, picker kind, last stage and start time with the complete draft;
5. replaces the complete glass form/previews with a lightweight non-animated handoff screen;
6. waits for two rendered frames, evicts partner previews and clears cached/live Flutter image entries;
7. derives allowed extensions from the admin requirement and opens the native provider.

The default image list is JPEG/JPG, PNG and WebP. A requirement's configured extension list and configured maximum size can narrow the selection. The absolute application cap remains 3,000,000 bytes per file.

Opening the system picker can move the Flutter activity through inactive/background lifecycle states. The lifecycle observer saves a dirty draft again when leaving the foreground. Because the form remains dirty, the resume handler does not perform a background workflow reload that could replace the in-progress selection.

### 3. Native picker

The code invokes:

```dart
FilePicker.pickFiles(...)
```

for a multiple-file requirement, or:

```dart
FilePicker.pickFile(...)
```

for a single-file requirement. The package opens the platform picker/provider and returns `PlatformFile` handles. The application does not request all-media storage access or enumerate the user's gallery itself.

Canceling the native picker returns no file. The page clears the in-flight descriptor, restores its earlier dirty state, clears the picker busy state and does not modify the selected-file list. After a normal native return, the plugin's temporary cache is cleared.

### 4. Size checks and private staging

For every returned file, sequentially:

1. the provider-reported length is read;
2. the configured limit and absolute 3 MB limit are checked;
3. `PlatformFile.readAsByteStream()` opens a stream from the provider result;
4. `PartnerDraftStore.stage()` creates a random 32-hex-character filename ending in `.pending` inside the account directory;
5. chunks are written directly to disk;
6. the running byte count is checked again while streaming;
7. `flush()` applies disk backpressure after each chunk;
8. empty or oversized input deletes the partial `.pending` file.

The original filename is retained as metadata, but the private staged filename is random. The page does not retain the complete selected bytes in widget state.

Multiple-file fields retain existing staged selections and append new ones. Single-file fields replace the selection. One field is limited to ten files.

### 5. State, draft and preview

After staging succeeds:

1. `_files[requirementId]` is updated with `PartnerLocalFile(name, path)` entries;
2. `_dirty` remains true;
3. encrypted draft metadata saves each original name, private path and optional uploaded asset ID;
4. `_pickingFiles` becomes false;
5. the upload tile rebuilds.

For `IMAGE` fields, the encoded header is inspected before the selection is committed. Invalid dimensions and images above 40 megapixels are rejected without decoding a full-size preview. Selection, encrypted metadata and owned staged bytes are treated transactionally: a draft-save failure restores the prior selection and removes the newly staged file.

For an image field, `PartnerUploadTile` uses `FileImage` wrapped in `ResizeImage(width: 320, height: 320)`. The visible compact card is at most 72 logical pixels tall; the review sheet uses a 160-pixel-high bounded preview. A decoding failure uses the widget's error fallback rather than intentionally throwing from the preview.

No API call, base64 conversion, WebP conversion, Cloudinary upload or database write occurs during this selection phase.

## Live-selfie capture flow

The synthetic requirement ID is `__live_selfie__`. It is always camera-only and cannot be satisfied with a gallery selection.

### 1. Pre-camera preparation

`_captureSelfie()` uses the same persisted in-flight descriptor and two-frame lightweight handoff as ordinary files. The full glass form is removed from the render tree and cached/live images are released before the external camera activity is opened.

### 2. Camera request

The app invokes `ImagePicker.pickImage()` with:

| Setting | Current value |
| --- | --- |
| Source | Camera |
| Preferred lens | Front |
| Maximum dimensions | 1024 × 1024 |
| JPEG quality request | 80 |
| Full metadata | Disabled |

The image-picker plugin delegates to the platform camera flow. If Android kills the activity while that flow is open, the next page load attempts `retrieveLostData()` once and routes the recovered `XFile` through the same validation/staging path.

### 3. Selfie validation and staging

`_useSelfie()` verifies that:

- the selfie requirement exists in the workflow;
- the application state still permits editing/requested selfie correction;
- the field is not already approved;
- the camera result is no larger than 3 MB;
- the account draft store exists.

The camera stream is staged as `live_selfie.jpg` metadata in a random private `.pending` file. Its encoded dimensions are validated, the previous selfie preview is evicted, and the encrypted draft is saved. The old selfie bytes are removed only after that save succeeds; failure restores the prior selfie and removes the new staging file.

The later upload includes `capture_source: CAMERA`. API V2 rejects a live-selfie upload without that value. This preserves camera provenance at the application boundary; it is not biometric liveness analysis.

## Final submission and upload flow

Selection and submission are intentionally separate.

### 1. Complete-form validation

When Submit is pressed, `_submit()`:

1. refuses to start while picker/camera/save work is active;
2. removes keyboard focus;
3. validates every category step, including steps that are not mounted;
4. navigates to the first invalid step;
5. checks every required upload has a staged file or reusable asset ID.

### 2. Prepare for bounded upload memory

`_run()` saves the draft as required, waits for previews to detach, and evicts all partner preview images. Status polling is invalidated so an older workflow response cannot overwrite the saving form.

### 3. Sequential per-file upload

The app iterates requirements and their files sequentially. It never intentionally encodes every selected file at once.

For each file without an `assetId`:

1. the UI announces `Uploading <field>: n of total`;
2. `uploadFile()` calls Flutter `compute()`;
3. the worker isolate verifies the private file length;
4. it reads that one file into memory;
5. it verifies the absolute 3 MB limit again;
6. it chooses a MIME value from the original extension;
7. it base64-encodes the bytes;
8. it creates one JSON request body containing `field_id`, `file_name`, `data_url`, and camera provenance for the selfie;
9. Dio sends `POST /api/v2/partner-program/assets` with 90-second send and receive timeouts.

The app's main isolate does not do file reading/base64 work, but the worker and HTTP layers still temporarily hold one source-byte/base64/JSON payload at a time.

After the API returns a nonempty asset ID, it is attached to the local file metadata and the draft is saved immediately. If a later upload fails, retry reuses the completed asset IDs rather than uploading those files again.

### 4. API request parsing and authorization

The asset endpoint has an 8 MB JSON-body limit; ordinary API routes retain a 1 MB limit. `AuthGuard` requires the signed-in user session. Zod limits the data URL to 4,200,000 characters and validates the filename, field ID and optional camera source.

`PartnerProgramService.store_asset()` then:

1. requires a requirement ID for applicant uploads;
2. requires `capture_source: CAMERA` for `__live_selfie__`;
3. rejects an application state that is no longer editable;
4. rejects an already approved field;
5. loads the snapshotted or active requirement definition;
6. parses and strictly round-trips the base64;
7. rejects empty/source files above 3,000,000 bytes;
8. checks the configured per-field size and extension;
9. checks the actual file signature/type.

### 5. Central image conversion

For JPEG, PNG or WebP input:

1. extension and declared MIME must agree;
2. magic bytes are validated by `image_upload_schema`;
3. Sharp auto-orients the image;
4. input is limited to 40 megapixels;
5. the operation has a 10-second transform timeout;
6. output is WebP at quality 85 and alpha quality 100;
7. the stored name changes to `.webp`;
8. the converted result must still fit the applicable 3 MB partner-field limit.

This conversion occurs in API V2, not on the phone.

### 6. Private persistence

Inside the database transaction, API V2:

1. verifies the active account;
2. takes the per-user partner lock;
3. rechecks application/field editability;
4. computes SHA-256 of the final stored bytes;
5. reuses an identical prior asset for the same owner, purpose, field and filename;
6. enforces the 100 MB / 2,000-asset account quota;
7. inserts a `partner_assets` record containing owner, purpose, field, filename, MIME, size, hash and private bytes;
8. records the upload audit action;
9. returns asset metadata to Flutter.

Partner application files are stored as private PostgreSQL bytes. This path does **not** upload them to Cloudinary. Cloudinary is used by other public-image flows and partner rich-document images, not these private application attachments.

### 7. Commit the application

After every required file has an asset ID, Flutter sends `POST /api/v2/partner-program/applications`. Its answers contain asset ID arrays for upload fields.

The API transaction:

- checks the account and application version;
- verifies the accepted policy snapshot;
- verifies every asset belongs to this user, requirement and purpose;
- verifies type, count, configured limits and required answers;
- preserves approved fields and rejects unchanged rejected answers;
- creates or updates the application and its field records;
- records audit/notification work;
- increments and returns the application version.

Flutter accepts success only when the response contains a newer positive version, application ID and `SUBMITTED` status. If a response is lost, it reads the authoritative workflow and accepts success only when the saved fields exactly match this attempted submission.

On confirmed success, local editable widgets detach, the encrypted draft and owned `.pending` files are cleared, and the workflow reloads. Cleanup failure does not convert an already committed server submission into an apparent submission failure.

## Data lifetime and location

| Stage | Data location | Contents | Removed when |
| --- | --- | --- | --- |
| Native picker/camera | OS/provider temporary area | Native selection/capture result | Controlled by OS/plugin |
| Staged draft | App-private support directory | Random `.pending` file bytes | Explicit discard or confirmed submission cleanup |
| Draft metadata | Platform secure storage | Values, private paths, names, asset IDs, versions and current step | Discard or confirmed submission cleanup |
| Upload payload | Worker isolate + Dio request | One file as base64 JSON | Request/worker completes and becomes collectible |
| Server asset | PostgreSQL `partner_assets` | Private validated/converted bytes and metadata | Application/account lifecycle rules; not automatically public |
| Application field | PostgreSQL `partner_application_fields` | Asset IDs in the field JSON value | Application lifecycle/deletion rules |

## Error handling versus a real process crash

The Dart methods catch ordinary picker `PlatformException`s, file I/O errors, size failures and API errors and put a readable message in page state. Preview decode errors have a UI fallback. Those failures should leave the Flutter process open.

The following events cannot be reliably caught by the surrounding Dart `try/catch` because the process or native runtime can terminate first:

- Android kills the app/activity while the external picker or camera owns the screen;
- a native plugin/provider throws a fatal Android exception;
- the process is killed for native/Dart memory pressure;
- the device/ROM file provider crashes;
- the Flutter engine or graphics decoder terminates at native level.

The point at which the app disappears materially changes the investigation:

| Last visible point | Most relevant code boundary |
| --- | --- |
| Before the native chooser appears | Flutter-to-`file_picker` platform call or activity launch |
| While chooser/gallery is open | Android picker/provider, activity/process lifecycle |
| Immediately after selecting and returning | provider stream, staging write, state rebuild or first preview decode |
| While camera is open | camera activity, Android process reclaim or image-picker native path |
| Immediately after selfie returns | `XFile.length`, staging stream or preview decode |
| Only after final Submit | worker encoding, HTTP upload, API conversion/persistence or final application commit—not selection itself |

Both native paths now have page-level lost-result recovery. The pending descriptor identifies the exact field and picker kind; a recovered result goes through the same size, staging, image-dimension and encrypted-draft path and is cleared only after persistence succeeds.

## Current safeguards

- saves the draft before opening picker/camera;
- removes the full glass form from the render tree for two frames before native launch;
- disposes the covered Home MapLibre widget and restores its last camera when Home returns;
- clears cached/live images before native launch;
- blocks concurrent picker, camera and submission work;
- stages by stream instead of retaining all documents in page memory;
- checks file size both before and during staging;
- deletes partial staging files after an error;
- scopes files/draft metadata to the authenticated account;
- limits a field to ten files;
- bounds decoded preview dimensions;
- evicts previews on memory pressure, before camera and before upload;
- camera request limits dimensions and quality;
- retrieves lost Android camera and ordinary document-picker data;
- validates encoded image dimensions before preview;
- rolls selection state, metadata and staged bytes back together on persistence failure;
- immediately deletes owned replaced/removed staged files;
- clears the file-picker temporary cache after native return;
- uploads one file at a time;
- moves file read/base64 work to a worker isolate;
- saves each returned asset ID for retry reuse;
- validates ownership, state, extension, signature and size again on API V2;
- serializes application writes with version checks and a per-user lock.

## What is not happening during selection

- The selected file is not immediately sent to API V2.
- No Cloudinary call occurs.
- No WebP conversion occurs on the phone.
- The application is not created/updated merely by selecting a file.
- An administrator cannot see a local selection that has not been uploaded on Submit.
- Camera provenance is not facial recognition or active liveness verification.

## Evidence needed to identify the current crash

The current code trace narrows the candidates but does not prove which boundary is failing on the tester's phone. A useful reproduction should record:

1. whether it is an ordinary IMAGE field or the live selfie;
2. whether the source is gallery, Files/Documents, Google Photos or camera;
3. the field label, extension and approximate file size;
4. whether the native picker appeared;
5. whether the image preview appeared before termination;
6. device model, Android version and installed app version/build;
7. `adb logcat` from just before tapping through the termination, including AndroidRuntime, ActivityManager, low-memory and Flutter lines;
8. Flutter terminal output if running a debug build;
9. API request ID only if an HTTP upload had already begun.

The expected diagnostic distinction is:

- a Dart/Flutter exception should normally remain visible and be catchable/loggable;
- an Android `FATAL EXCEPTION`, process death or low-memory kill must be diagnosed from Logcat;
- an API rejection can happen only during Submit and should have an HTTP status/error code/request ID;
- a session redirect is neither a picker crash nor an image-decoder crash.

## Notable cleanup behavior found in this trace

Removing an item from the upload UI or successfully replacing a single-file selection now commits the updated encrypted metadata and immediately evicts/deletes the old owned `.pending` file. If metadata persistence fails, the prior selection is restored and its bytes are retained.

Likewise, an asset successfully uploaded before a later upload/application failure remains private on the server and its asset ID is saved locally for retry. If the user ultimately abandons the draft without submitting, the already uploaded server asset is not removed by local draft cleanup. These retention details are relevant to storage hygiene, but they do not by themselves prove the reported selection-time process crash.

## Existing regression coverage

The partner submission tests exercise private staging, empty/oversized cleanup, foreign-path protection, bounded draft metadata, sequential uploads, a camera-provenance payload, multiple documents plus selfie, partial upload retry, draft reopening, lost final responses, activity-recreated file recovery, descriptor cleanup and immediate staged-file removal. These are controlled Flutter/unit conditions. They do not execute the affected phone's OEM picker/provider, camera application, Android process reclaim behavior or real native image decoder, so the signed real-device/provider matrix remains necessary acceptance evidence.


# Partner Program picker/camera crash: memory investigation and repair plan

**Investigation date:** 2 November 2026  
**Scope:** `apps/user/v1`, Android partner application image/document picker and live-selfie capture  
**Status:** Repository repairs implemented and under automated verification. Signed-release, real-device repetition remains an acceptance check because the tester's exact native termination was not captured.

## Repair tracker

### Completed in code

- [x] Dispose the hidden Home MapLibre widget whenever another route covers Home; retain the last camera position and rebuild the map when Home becomes visible.
- [x] Save an account-scoped in-flight picker descriptor before opening either the document provider or camera.
- [x] Replace the complete glass form and all previews with a lightweight, non-animated handoff screen for two rendered frames before native launch.
- [x] Evict partner preview images and clear live/cached Flutter image entries before native launch.
- [x] Recover Android document-picker results after activity/process recreation through `android_file_picker`'s public lost-result API.
- [x] Preserve the existing camera lost-result recovery and route recovered selfies through the same staging and validation path.
- [x] Stream provider data into private application storage with the existing 3 MB bound; no selection is retained as a base64 payload.
- [x] Reject invalid or extreme image dimensions before adding a preview.
- [x] Delete owned staged files after replacement/removal and clear the picker plugin's temporary cache after a returned native file-picker operation.
- [x] Add privacy-safe stage and RSS breadcrumbs without paths, filenames, image content or personal data.
- [x] Add regression coverage for activity-recreated file recovery, pending-descriptor cleanup and staged-file deletion.

### Verification

- [x] `flutter analyze` passes after the final repair set (2 November 2026).
- [x] Focused partner submission and recovery tests pass: 18 tests (2 November 2026).
- [x] Full Flutter test suite passes: 160 tests (2 November 2026).
- [x] `git diff --check` passes and the final diff contains no secret/generated artifact (2 November 2026).

### Device/provider acceptance still required

- [ ] Repeat gallery selection, replacement, cancellation and selfie capture on the tester's signed release build.
- [ ] Exercise Files and Google Photos (plus any vendor provider used by the tester).
- [ ] Exercise Android **Don't keep activities** and confirm each recovered result attaches once.
- [ ] Record Logcat/ApplicationExitInfo if the OS still terminates the process; that evidence is required before claiming a remaining package- or device-specific native cause.

These device items cannot honestly be marked complete by static analysis or widget tests. They are acceptance checks, not omitted repository repairs.

## Conclusion

The strongest current explanation is **Android process termination during a high-memory native activity handoff**, not an API failure and not one obviously broken picker package.

Ordinary application images use `file_picker`; the selfie uses `image_picker`. Both fail only when 1More temporarily leaves Flutter to open another Android activity. Their common conditions are:

1. the installed debug 1More process already occupies several hundred megabytes before a picker opens;
2. Flutter's Impeller/Vulkan surface owns multiple full-resolution graphics buffers;
3. the home MapLibre route remains mounted below Settings and Partner Program because Navigator routes retain their state;
4. the native gallery/document provider or camera then needs its own process, surfaces and image buffers;
5. Android can kill/recreate the 1More activity/process at that boundary;
6. camera lost-result recovery exists, but ordinary file-picker lost-result recovery is not connected to the app, so a recreation can look like a crash and lose the selection.

The selected file is not being uploaded, base64-encoded or converted to WebP at the moment of selection. Those operations run only after final Submit. The existing staging copy uses streaming and an 8 KB native plugin buffer, so it is not the main evidence for a selection-time RAM spike.

The proper fix is to reduce retained Flutter/native graphics before opening any picker, dispose the hidden home map while its route is covered, wait until the lighter Flutter frame is actually rendered, recover both camera and document-picker results after process recreation, and verify the signed release build with memory checkpoints.

## What was inspected

- Partner picker, camera, draft, preview and submission code.
- Home/Settings/Partner Navigator route structure.
- MapLibre widget/controller lifecycle.
- Liquid-glass backdrop/filter implementation.
- Locked versions and Android implementations of:
  - `file_picker` 13.1.0;
  - `android_file_picker` 2.1.1;
  - `image_picker` 1.2.4;
  - `image_picker_android` 0.8.13+25;
  - `maplibre_gl` 0.27.1.
- Merged installed Android package information.
- Android process exit history, 24-hour process statistics, live `dumpsys meminfo`, graphics buffers, Logcat and rendering backend on the connected I2221 device.
- Existing partner submission/memory regression tests and prior investigation documents.

No customer application was submitted and no user document was opened or copied during this investigation. The app process was cleanly force-stopped and relaunched once while it was on the login page to establish a cold-process memory baseline; no account data was cleared.

## Device evidence

The connected device is an I2221 running Android 16 with approximately 7.47 GB physical RAM. The installed 1More build is `0.1.7+7`, debuggable, using Flutter Impeller with Vulkan.

### Android historical evidence

`dumpsys activity exit-info com.brogrammer.onemore` showed the previous process (PID 25798, the same PID visible in the supplied Flutter log) at approximately **497 MB RSS** when it was force-stopped. This record is a user-requested stop, not an OOM verdict, so it proves the memory level but not why the tester's earlier process disappeared.

The 24-hour process statistics reported an observed 1More RSS range of approximately **74 MB to 523 MB**, with about **337 MB average RSS** over the samples.

### Live foreground evidence

Before the clean restart, bringing the existing process to the foreground on the login screen produced approximately:

| Metric     | Observed value |
| ---------- | -------------: |
| Total RSS  |         385 MB |
| Total PSS  |         394 MB |
| Graphics   |         131 MB |
| EGL mtrack |         126 MB |

After a clean process start, still on the login screen with no MapLibre map visible:

| Metric        | Observed value |
| ------------- | -------------: |
| Total RSS     |         526 MB |
| Total PSS     |         429 MB |
| Graphics      |        89.6 MB |
| Private other |         217 MB |

The graphics allocator listed six full-screen buffers of approximately **14 MB each** at the device's 1260 × 2800 resolution. When the display/surface later became inactive, Graphics dropped near 0.6 MB and RSS dropped to roughly 435 MB. This demonstrates that the handoff timing can temporarily overlap expensive surface memory with the picker/camera's allocations.

The login background bitmap decodes to only about 6.3 MB RGBA, so it does not explain the several-hundred-megabyte process by itself.

### What the evidence does not prove

- Retained Logcat did not contain a matching `AndroidRuntime FATAL EXCEPTION` for 1More.
- Application exit history currently contains the diagnostic force stops, not a recorded low-memory kill from the tester's exact reproduction.
- The measurements are from a debug build. Debug/JIT/runtime mappings are substantially heavier than a signed release and cannot be used as release-memory certification.
- A native crash, OEM provider defect or image decoder failure remains possible until the exact reproduction is captured.

Therefore the correct wording is: **there is direct evidence of a dangerously large process and a high-confidence memory/lifecycle risk, but no captured termination record yet proves OOM as the sole cause.**

## Code findings

## 1. The home MapLibre route stays alive below Partner Program

The route stack is currently:

```text
Home (MapLibre)
  -> Settings
       -> Partner Program
            -> Android picker/camera activity
```

`HomePage` mixes in `RouteAware`, but implements only `didPopNext()`. It does not implement `didPushNext()` to release or remove the map when Settings covers Home.

Flutter `MaterialPageRoute` maintains its state by default. An opaque route stops painting the old route, but does not dispose its widget state. `MapLibreMap` releases its platform view and controller in the map widget's `dispose()`. Because the home map widget remains mounted, that disposal is not guaranteed merely because Settings/Partner Program is visible.

This is a high-priority retained native/GL resource risk. It is not the whole baseline problem—the login screen also measured high—but it can add MapLibre memory to an already large process immediately before opening a camera or document provider.

## 2. Both failing actions share a native activity handoff

The ordinary image flow uses Android's document/content picker through `file_picker`. The selfie flow uses a camera activity through `image_picker`. Because two separate packages fail at the same transition, replacing only one package is unlikely to be a complete fix.

The shared sequence is:

```text
large Flutter/Impeller process
  -> save draft
  -> launch another Android activity
  -> 1More becomes background/non-resumed
  -> camera/provider allocates its own UI and image resources
  -> return/recreate 1More
```

This is exactly the point where Android is allowed to reclaim a background activity or process.

## 3. The ordinary picker opens before its lightweight frame is guaranteed

When an ordinary file is selected, `_pick()` sets `_pickingFiles = true`, which causes upload previews to build as icons instead of images. However, it immediately invokes the native picker after saving the draft. It does **not** wait for `endOfFrame` and does not evict previews first.

Consequently, the native picker can open before Flutter has rasterized the lighter busy-state frame and released previous preview resources.

The selfie path is better: it waits for one frame and evicts partner preview providers before opening the camera. It still retains the rest of the liquid-glass page, the Navigator stack and potentially the hidden home map.

## 4. Picker/camera busy state does not remove the expensive page

The busy flags disable controls and replace upload preview widgets, but the complete Partner page remains mounted, including its backdrop, glass surfaces, form widgets and route stack. The app does not enter a dedicated low-memory native-handoff mode.

Backdrop filters are bounded and grouped correctly for ordinary rendering, but they still require render layers. During a camera/picker handoff, visual fidelity is irrelevant because another activity covers the app. Keeping the full glass page alive offers no user benefit at that moment.

## 5. File-picker process recreation recovery is available but unused

The installed `android_file_picker` 2.1.1 implementation persists a pending picker request and exposes `FilePickerAndroid.retrieveLostData()`. Its native code explicitly handles an activity destroyed while the picker is open and caches the eventual result.

The Partner page currently calls only `ImagePicker.retrieveLostData()` for a lost camera result. It never asks the file-picker implementation for a lost ordinary image/document result, and it does not persist which requirement ID owns an in-flight ordinary picker.

If Android kills/recreates 1More while Documents/Photos is open, the plugin can preserve the result but the application does not consume and attach it. To a tester this can appear as: choose an image, app restarts/returns, selection disappears—reported simply as “the app crashed.”

## 6. The plugins already avoid the obvious whole-file RAM copy during ordinary selection

The Android file-picker implementation copies provider content into its cache on an IO coroutine using an 8 KB byte buffer. The Partner draft then streams that cached result into its own private `.pending` file with backpressure. Page state stores paths, not all selected bytes.

This results in two temporary disk copies, but not two complete in-memory byte arrays. It is a storage/cleanup issue, not the leading selection-time RAM explanation.

## 7. Selfie resize is bounded but still performs native bitmap work

The app asks `image_picker` for a maximum 1024 × 1024 image at quality 80. The Android implementation reads dimensions, chooses a power-of-two `inSampleSize`, decodes a sampled bitmap, scales it and writes a compressed copy. This is substantially safer than decoding the complete camera image without sampling.

It still creates temporary native bitmap/output buffers after the camera returns. If the Flutter process is already near 400–500 MB, even a normally bounded resize can coincide with enough other memory to trigger pressure.

## 8. Preview decoding is bounded

Partner previews use `ResizeImage` with a 320 × 320 cache target. This is a valid safeguard. An ordinary compressed image may have very large source dimensions, so a decoder/OEM-specific failure is still possible, but the code does not intentionally retain a full-resolution preview.

The preview has an `errorBuilder`, which handles ordinary Flutter decode errors. It cannot catch a native decoder abort or process kill.

## 9. Polling and submission encoding are not active at selection time

- The Partner 20-second status poll does not run while the form is dirty/picking.
- Base64 encoding runs only on final Submit.
- API WebP conversion runs only after each final-submit upload reaches API V2.
- No Cloudinary action occurs for private partner application images.

These are not plausible causes of a crash that occurs before or immediately after choosing/capturing an image.

## Recommended repair

The work should be implemented in this order. A package replacement should not be the first step.

## Phase 1 — release native resources below the flow

### 1. Dispose MapLibre whenever Home is covered

Add `HomePage.didPushNext()` and a route-visibility flag. When another route covers Home:

1. set the route-visible flag false;
2. remove `MapLibreMap` from the widget tree;
3. clear the page's controller/readiness references so no task calls a disposed controller;
4. retain only plain Dart camera/location/route state needed to reconstruct the map.

Removing the widget lets `maplibre_gl` dispose its controller and platform view. In `didPopNext()`, rebuild the map and restore the current camera/markers/route from retained state.

This must be tested for rider Home, returning from Settings, active trips, selected pickup/drop-off and location permission return. Do not manually call the controller's `dispose()` while leaving the widget mounted; let the map widget own its normal teardown.

### 2. Introduce a low-memory native-handoff state

Before any file picker or camera call:

1. save the complete draft and an in-flight picker marker;
2. switch Partner Program to a minimal solid placeholder such as “Opening camera…” or “Opening files…”;
3. remove the form, glass surfaces, rich policy/document content and all previews from the active subtree;
4. wait for **two completed frames**, not merely `setState()`;
5. evict every owned preview image;
6. clear Flutter image-cache entries after the image widgets are detached (`clear()` and, for this explicit handoff, `clearLiveImages()` if measured necessary);
7. only then invoke the native plugin.

On normal return, restore the form from its already-saved state and stage the result. On cancellation/error, restore the prior dirty state. The placeholder must remain safe if Android takes a screenshot of the background task; it must not display private documents.

Targeted eviction should be retained. Global image-cache clearing is appropriate only after the application has deliberately detached its image widgets and should be validated for avatars/logos on return.

### 3. Pause all nonessential work during handoff

Use one coordinator flag for picker/camera handoff. While active or while the app is non-resumed:

- do not poll Partner status;
- do not refresh account/workflow data;
- do not geocode or fetch optional data;
- do not animate skeletons or transitions;
- do not allow a second picker;
- retain draft writes through the existing serialized queue.

The current code already blocks most of this, but the invariant should be centralized and regression-tested.

## Phase 2 — recover from Android activity/process recreation

### 4. Persist an in-flight selection descriptor

Before opening a picker, save metadata such as:

```text
field_id
field_type
allow_multiple
allowed_extensions
configured_max_bytes
capture_mode
started_at
```

Do not store a public file URI, document content or provider token in ordinary logs. The descriptor must be scoped to the authenticated user and policy/application version.

### 5. Consume lost ordinary file-picker results

On Android page restoration:

1. read the in-flight descriptor;
2. call `FilePickerAndroid.retrieveLostData()`;
3. reject a recovered result if account, policy, application version or requirement no longer matches;
4. pass valid recovered files through the same size check/private staging path;
5. clear the descriptor exactly once;
6. show a clear recovery message.

The direct Android implementation package would need to be declared intentionally if its Android-specific API is imported. Do not call a private method channel string from application code.

The existing `ImagePicker.retrieveLostData()` behavior should use the same descriptor and exactly-once recovery semantics for the selfie.

### 6. Restore to the same category/field

The saved application step already exists in the draft. A recovered selection must restore the relevant category and scroll/focus near the owning upload card. It must never attach a recovered file to whichever field happens to be currently visible.

## Phase 3 — eliminate avoidable disk/cache growth

These changes are not expected to solve peak RAM alone, but remove cumulative pressure and make repeated testing deterministic.

### 7. Delete replaced and removed staged files immediately

Currently, removing a selection from the form or replacing a single-file selection removes metadata but leaves the old private `.pending` file until the entire draft is discarded or submitted.

Route removal through an async helper that:

1. detaches and evicts its preview;
2. removes it from page state;
3. saves the new draft metadata;
4. calls `PartnerDraftStore.remove()` for the owned path.

Never delete paths that fail the existing ownership check.

### 8. Clear the file-picker cache after private staging

The Android picker first caches provider content under the app cache, then Partner draft staging makes a durable private copy. After every returned picker file has been successfully staged, call the public `FilePicker.clearTemporaryFiles()` API. Do not clear it before staging or while lost-result recovery is unfinished.

### 9. Clean abandoned server assets separately

A file successfully uploaded during Submit remains a private server asset if a later upload/application commit fails. The local asset ID correctly enables retry. A separate bounded server cleanup policy can later remove old unreferenced partner assets after a safe retention window. It must not delete assets referenced by applications, current drafts being retried or final documents.

This server cleanup is unrelated to the selection-time native crash and should not block the mobile repair.

## Phase 4 — harden image preview input

### 10. Avoid immediately decoding untrusted full-dimension gallery images

For ordinary IMAGE fields:

- validate extension and byte size before rendering;
- create/store a small thumbnail through a bounded decoder path;
- render only the thumbnail in the form;
- keep the original staged file for API validation/conversion;
- for unsupported/corrupt/extreme-dimension images, show a file card with “Preview unavailable” instead of repeatedly decoding.

Do not use a Dart image library that decodes a 40–100 megapixel source fully in the main isolate. Any thumbnail path must have a pixel limit and run outside the UI isolate or use a platform decoder with explicit sampling.

The existing 320 × 320 `ResizeImage` remains a useful final cache bound; this phase adds deterministic validation and a durable thumbnail rather than relying on every OEM decoder.

## Phase 5 — measure before changing packages/renderers

### 11. Test a signed release build

The measured installed build is debuggable and includes a Dart VM service/JIT/runtime overhead. Reproduce on the same phone with the actual signed Shorebird/base release build before setting a production memory target. Do not conclude from a debug-only total that the release has the identical footprint.

### 12. Do not replace both picker packages without a native trace

`file_picker` and `image_picker` are separate implementations; both already contain streaming/sampling and activity-loss facilities. The app is not using all the recovery facilities and is retaining heavy resources around both calls.

Replace or upgrade a package only when a captured stack identifies its native code, or a minimal isolated reproduction fails without MapLibre/Partner UI. A package swap performed first can preserve the shared memory/lifecycle defect and make diagnosis harder.

### 13. Impeller/OpenGL must be an A/B diagnostic, not an unproven production toggle

The device uses Impeller/Vulkan and full-resolution surface buffers are a material part of the transient footprint. After Phases 1–4, compare release/profile runs with the supported renderer configurations if the crash remains. Disable or change the renderer only with measured improvement and visual/map regression coverage. Do not edit Flutter SDK or global caches.

## Required observability

The current logs cannot identify the last completed stage. Add privacy-safe breadcrumbs:

```text
PICK_PREPARE
PICK_LIGHTWEIGHT_FRAME_READY
PICK_NATIVE_OPEN
APP_INACTIVE / APP_PAUSED
PICK_NATIVE_RETURN
APP_RESUMED
PICK_STAGE_START
PICK_STAGE_COMPLETE
PICK_PREVIEW_READY
PICK_CANCEL / PICK_ERROR
PICK_LOST_RESULT_RECOVERED
```

Each event may include requirement ID/type, picker kind, selected count, byte size, elapsed time and `ProcessInfo.currentRss`. It must not include paths, filenames, document contents, contact details or image bytes.

Persist only the last stage/account-safe correlation token so a restarted app can report where the previous attempt stopped. Flutter error hooks can capture Dart errors; Android process death/OOM still requires Logcat/ApplicationExitInfo or a configured native crash service.

## Acceptance test matrix

Run these on the I2221 and at least one lower-memory Android device:

1. Signed release build, then debug build separately.
2. Open Home → Settings → Partner Program and verify MapLibre is disposed while covered and recreated correctly on return.
3. Cancel the image picker ten times.
4. Select/replace an image ten times and verify stable private/cache disk use.
5. Take/retake the selfie ten times.
6. Test JPEG, PNG and WebP near 3 MB, including a highly compressed large-dimension image and a corrupt image.
7. Test Files, Google Photos and another installed document provider.
8. Enable Android “Don't keep activities” and verify both ordinary-file and selfie lost-result recovery.
9. Background the app while the picker is open, return after several minutes and verify the correct field/category.
10. Submit many staged documents sequentially and verify completed asset IDs are reused after a forced network failure.
11. Verify back navigation, active-trip recovery, map markers/camera and location behavior after map recreation.
12. Verify no private preview remains in the Android recent-task snapshot during native handoff.

Capture `dumpsys meminfo com.brogrammer.onemore` at:

```text
cold login
home map ready
settings open / home map disposed
partner form ready
immediately before native handoff
picker/camera foreground
immediately after return
preview ready
after ten repeated cycles
```

Pass conditions should be behavioral and comparative rather than one universal RSS number:

- no process termination or lost selection;
- home MapLibre native/GL resources are absent while covered;
- pre-handoff memory drops after the lightweight frame;
- memory returns near its prior stable band after every cycle;
- ten cycles do not show monotonic growth;
- both lost-result paths recover exactly once;
- release behavior is measured independently from debug.

## Recommended implementation order

1. Add breadcrumbs and memory checkpoints.
2. Remove/dispose Home's MapLibre widget on `didPushNext()` and restore it on `didPopNext()`.
3. Add the lightweight native-handoff frame, two-frame wait and image-cache eviction for **both** picker and camera.
4. Add the in-flight descriptor and ordinary `FilePickerAndroid.retrieveLostData()` recovery.
5. Make remove/replace delete owned staged files and clear file-picker cache after successful staging.
6. Add bounded thumbnail validation for arbitrary gallery images.
7. Run focused Flutter regressions and route/map tests.
8. Perform the real-device signed-release matrix while recording Logcat and ApplicationExitInfo.
9. Only if the failure remains, use the captured native stack/memory delta to decide on plugin or renderer changes.

## Final diagnosis statement

The repository already fixed the earlier “all documents retained as byte arrays” submission problem. The current selection-time failure is a different boundary. The connected-device measurements show that 1More can already occupy roughly 400–525 MB around a foreground Flutter surface, and the code retains avoidable native/rendering work while launching picker/camera activities. That makes memory/lifecycle hardening the correct first repair.

An exact low-memory/native crash reason must still be captured during the tester's reproduction before claiming a single proven root cause. The proposed changes are justified independently: they remove retained MapLibre resources, release preview/render memory before handoff, use the picker's existing process-recovery API and prevent cumulative cache growth without weakening validation, privacy or draft recovery.

# Settings / profile redesign

Reference: the profile screen supplied on 30 October 2026. The implementation reproduces the screen inside the app, excluding the reference's decorative phone frame, sample identity and sample record counts.

## Completed work

- [x] Centered circular account photo, camera control, actual name and email, soft cool background, rounded menu surfaces and restrained icon treatment.
- [x] Five primary cards: Personal Information, Documents, Saved Vehicles, Payment Methods and Settings.
- [x] Bottom navigation was removed after the user's follow-up direction. Back navigation and the gear/action sheet preserve account access and session/trip recovery. Do not reintroduce a bottom bar.
- [x] Preserve Partner Program, rider/driver history, driver account and earnings, saved places, notifications, emergency contacts, support and confirmed logout in the Settings sheet, also reachable from the top gear.
- [x] Resolve the account-scoped travel mode before enabling mode-dependent shortcuts. Riders reach Partner Program instead of driver-only vehicle endpoints. Exited partners retain account/document reads rather than entering vehicle operations.
- [x] Render a matching profile/avatar/five-row skeleton while account data loads. Use the same header/menu geometry, one animation for the placeholder layout, accessibility labels and reduced-motion/hidden-route handling. No new loading dependency.
- [x] Show retry on initial profile failure; preserve loaded data after a failed refresh. Reload after returning from account subpages. Preserve the auth repository's logout, tracking cleanup and session gates.
- [x] Camera/gallery selection with bounded native image resizing, local preview, cancel, explicit Save and duplicate-save protection. No cloud upload before Save. Photo request encoding runs in a worker isolate and does not retain multiple large image copies in widget state.
- [x] Extend the existing authenticated `POST /api/v2/me/avatar` endpoint with a validated `image_upload`, preserving legacy `avatar_url` callers. Reuse centralized WebP conversion and upload/persistence cleanup. No route, database schema or migration change.
- [x] Add navigation, loading geometry, error/retry, refresh failure, pre-activation/exited routing, photo preview/cancellation/save, confirmed logout, and narrow/landscape/tablet/large-text widget regressions.
- [x] Add API regressions for avatar source validation, conversion before upload, owner-scoped persistence and cleanup after a failed save.

## Design and data boundaries

The profile uses the signed-in user's actual image and identity; absent/broken images use a neutral person fallback. Row subtitles describe the available flow instead of displaying invented uploaded-document/vehicle/card totals. Private documents remain behind their existing workflows and authorization checks. The follow-up [mobile design system](MOBILE_DESIGN.md) now defines real liquid-glass surfaces for this page and Partner Program; see the [glass rework tracker](LIQUID_GLASS_MOBILE_REWORK.md).

The screenshot's Settings subtitle mentions privacy. A new privacy-management feature is not implemented here; the row describes the real notification, safety and support actions. Mobile retains its existing Outfit font and green primary-action theme, with the supplied reference's cool profile surfaces.

## Verification

- Settings-specific widget suite: 13 passing tests, including layout checks at 320 × 568, 568 × 320 and 768 × 1024 with 1.8× text scaling.
- Full Flutter suite: 103 passing tests. Flutter analysis reports no issues.
- API unit/HTTP suite: 219 passing tests; external photo uploads are mocked, and no real mail or cloud upload is sent by these tests.
- Code-only API build passed. This check does not run deployment migrations/schema push.
- API formatting check passed.
- Local rendered review images are generated under ignored `apps/user/v1/build/ui-review/` using synthetic account details.

Camera/gallery permission behavior and cloud upload with the deployed environment still need real-device acceptance; widget tests do not establish those platform behaviors.

## Rollout

Deploy API V2's avatar input/service update before distributing the mobile photo-saving flow. Keep the existing SMTP/Cloudinary environment configuration; no new environment variable is required. No Android files, SDK/plugin/package versions, app version/build, signing setup or Shorebird identity are changed. No APK, Shorebird publication or Git push is part of this task.

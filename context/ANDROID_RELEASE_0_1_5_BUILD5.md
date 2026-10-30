# Android release 0.1.5+5

Published to Shorebird on **30 October 2026**. This is a new Android base release with an APK artifact, not a patch to an older installed base.

## Release identity

| Item | Verified value |
| --- | --- |
| App | 1More User |
| Package | `com.brogrammer.onemore` |
| Version / Android build | `0.1.5` / `5` |
| Previous source version / build | `0.1.4` / `4` |
| Source commit | `f6f41a1b6a126112989454b9bf207990e0b69f12` |
| Shorebird app | `47a2ff06-8ca3-41a1-b62a-6ab5ebcb52a7` |
| Shorebird release | `939190` |
| Server platform status | Android `active` |
| Flutter | `3.47.7` |
| Shorebird Flutter revision | `01aea2ee0626578b6b30ebbb2605f195833464fa` |
| APK size | 104,009,789 bytes (approximately 99.2 MiB) |
| APK SHA-256 | `5b6b567c32b87f2cdc2d76199584a7dcd69e6eaac85d0fa2237a2f3c30663d9e` |

## Artifacts

Paths are relative to `apps/user/v1` and remain ignored by Git:

- Distribution copy: `build/releases/0.1.5+5/onemore-user-0.1.5+5.apk`.
- Build output: `build/app/outputs/flutter-apk/app-release.apk`.
- Companion bundle: `build/app/outputs/bundle/release/app-release.aab`.
- Local verification metadata: `build/releases/0.1.5+5/verification.json`.
- Local CLI log: `.shorebird-release-0.1.5+5.log`.

The versioned copy avoids relying on the generic output path that a later build overwrites. APKs and the signing keystore are not committed.

## Completed checks

- [x] Incremented version and build once, committed all intended source/docs and pushed `main` before building.
- [x] Flutter analysis passed; 111 Flutter tests passed in the preceding implementation checks.
- [x] API V2 compilation, formatting and 219 unit/HTTP tests passed in the preceding implementation checks.
- [x] `:app:validateSigningRelease` passed with the existing release keystore.
- [x] Shorebird completed both Android bundle and APK builds, uploaded artifacts and exited with code zero.
- [x] Queried Shorebird after publication: release `939190`, Android `active`, version `0.1.5+5` and Flutter revision as recorded above.
- [x] Inspected APK metadata: package, version name and version code match this release.
- [x] APK signature validation passed; the certificate matches the existing configured `onemore.jks` identity.
- [x] Inspected the bundled public configuration: production API `https://apionemore.vercel.app/api/v2` and the registered Shorebird app identity.
- [x] Confirmed `armeabi-v7a`, `arm64-v8a` and `x86_64` application binaries in the APK.
- [x] Streamed the APK SHA-256 and created the versioned distribution copy.
- [x] Production API health returned HTTP 200 with database connected. This does not verify every newly deployed route.

The release uses JDK 21. Gradle 8.14, AGP 8.11.1, Kotlin 2.2.20 and dependency versions were retained. On this 8 GB Windows machine the build used process-only settings for a 2 GB Gradle heap, two workers and Kotlin compilation in process. No tracked Android configuration or machine-wide Java environment was changed for the release.

## Distribution and device acceptance

Shorebird publication registers the new base; it does not install the APK on users' phones or publish it to Google Play. Distribute the APK separately. Existing installations require this APK update to receive the new bundled icons/assets and this base's future patches.

- [ ] Install/update the APK on target devices and verify production Google sign-in with the registered release certificate.
- [ ] Exercise Settings and the complete Partner Program upload/selfie/submission flow on a physical device.
- [ ] Check liquid-glass rendering, scrolling, skeletons, keyboard, accessibility and reduced-motion behavior on target devices.
- [ ] Verify rider/driver switching, vehicle gates, active-trip recovery, location tracking and payment/calling intents.
- [ ] Confirm the matching API V2 avatar contract and other affected routes are deployed before distribution.

The build and automated checks do not establish these device-dependent results. No device installation or Play Store publication was performed in this task.

See [the app README](../apps/user/v1/README.md) for release and patch commands. Retain this release's exact environment, lockfile, Flutter revision and build metadata when preparing compatible patches.

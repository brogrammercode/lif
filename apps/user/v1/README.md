# 1more User App

UI guidance: [mobile design entry point](MOBILE_DESIGN.md), linking to the canonical liquid-glass design specification. Dropdowns use the shared glass selector/menu; application uploads are full-width vertical cards.

The Flutter rider app signs in with Google and consumes API V2 at `/api/v2`. The API V2 server also supports its `/api/v1` compatibility prefix.

Home avatar opens Settings, including profile and Partner Program. The program includes published rich policy/confirmation documents, dynamic applications and field feedback, private final PDF download, first-login one-time activation and the driver-home placeholder. See [the phased plan](../../../context/PARTNER_ONBOARDING_PLAN.md) and [implementation/operator guide](../../../context/PARTNER_ONBOARDING_IMPLEMENTATION.md). Use the API V2 server for these features.

## Local setup

1. From `apps/api/v2`, apply migrations, regenerate Prisma, run `npm run dev`, and keep the API running while using the app. The default port is `4001`.
2. Copy `.env.example` to `.env` if `.env` is missing.
3. Set `GOOGLE_CLIENT_ID` in `apps/api/v2/.env` to the Google web OAuth client ID.
4. Set `GOOGLE_SERVER_CLIENT_ID` in this app's `.env` to that same client ID.
5. Set `API_BASE_URL` in this app's `.env` to the machine running the API.
6. Run `flutter pub get` and `flutter run` from `apps/user/v1`.

### Android Java setup

Use **JDK 21** for Android builds. MapLibre `0.27.1` compiles its Java and Kotlin sources for Java 21; JDK 17 cannot compile them (`invalid source release: 21`). The app itself can continue targeting Java/Kotlin 17 bytecode. Compiler selection and bytecode targets are different settings; lowering MapLibre's target is not a fix.

Select an installed JDK 21 explicitly, then verify the Java binary in `flutter doctor -v`:

```powershell
$jdkPath = 'C:\path\to\jdk-21' # Directory containing bin\java.exe and bin\javac.exe.
flutter config --jdk-dir="$jdkPath"
# Direct gradlew commands use JAVA_HOME rather than Flutter's jdk-dir setting.
$env:JAVA_HOME = $jdkPath
flutter doctor -v
```

`flutter config --jdk-dir` persists for this user's Flutter tooling and takes priority over automatic Android Studio discovery and `JAVA_HOME`. Restart an existing Flutter debug session or IDE after changing it. The PowerShell `JAVA_HOME` assignment above applies to the current shell only. Keep local JDK paths out of tracked Gradle files.

Keep the project's existing **Gradle 8.14, Android Gradle Plugin 8.11.1 and Kotlin Gradle Plugin 2.2.20** versions. This Java-selection fix does not change Android files, app versions or package versions. Flutter's messages that these toolchain versions will lose support in a future release are warnings, separate from the Java 21 compilation failure. Do not upgrade the Android toolchain or add validation-skip flags just to address this environment mismatch. Any future toolchain migration should be a separate task, coordinated with the team's Flutter setup.

To check the failing native compilation without assembling an APK, from `apps/user/v1/android`, with the same JDK selected:

```powershell
.\gradlew.bat :maplibre_gl:compileDebugJavaWithJavac :maplibre_gl:compileDebugKotlin :app:checkDebugAarMetadata --console=plain --max-workers=2 "-Dorg.gradle.jvmargs=-Xmx2g -XX:MaxMetaspaceSize=1g" "-Pkotlin.compiler.execution.strategy=in-process"
```

Use `flutter analyze` for routine Dart checks. If `flutter doctor` reports unaccepted Android licenses, review them using `flutter doctor --android-licenses`.

The Java-only repair was verified on 30 October 2026 with JDK 21: both MapLibre compilation tasks and the Android dependency metadata check above passed using the unchanged Android versions. No APK was assembled for verification.

The `html` dependency is pinned to `0.15.6`: `flutter_html 3.0.0` uses a selector function removed in `html 0.15.7`. Keep this compatibility pin when updating dependencies until the renderer supports the newer API. After pulling dependency changes, run `flutter pub get` before starting the app.

The `Got dependencies!` / newer-packages message is informational, not a build failure. Use `flutter pub outdated` to review upgrades separately; preserve intentional pins and assess native/Flutter compatibility before updating a package. The Java 21 failure does not require replacing MapLibre or upgrading every dependency.

The default API URL, `http://10.0.2.2:4001/api/v2`, works from the Android emulator. Use `http://localhost:4001/api/v2` for an iOS simulator, or the computer's LAN address for a physical device. Use HTTPS for deployed builds.

For a physical phone, open `http://<computer-LAN-IP>:4001/api/v2/health` on the phone before signing in. It should report `database: connected`. A request timeout usually means the API is stopped or the phone cannot reach the computer.

Firebase initializes from `lib/firebase_options.dart` on Android and iOS. The checked-in Android `google-services.json` has OAuth entries for the app and the local debug signing SHA-1 is registered in Firebase. Add the SHA-1 for any other signing key and download an updated `google-services.json` before signing in with that build.

For iOS Google sign-in, create an iOS OAuth client for `com.brogrammer.onemore` in the same Google Cloud project, then download a `GoogleService-Info.plist` containing `CLIENT_ID` and `REVERSED_CLIENT_ID`. Add that file to the Runner target, put its `CLIENT_ID` in `GIDClientID` and its `REVERSED_CLIENT_ID` under `CFBundleURLTypes` in `ios/Runner/Info.plist`. The current Firebase iOS config has neither OAuth value, so iOS Google sign-in needs this step before it can work. The iOS deployment target is 15.0, as required by the current Firebase SDK.

## Connected rider flows

My Rides and Trip details use Settings' liquid-glass design, matching loading skeletons, route/date and pickup/drop-off summaries, real trip metrics/rating and server fare/collection details. Existing All/Active/Past pagination, active-trip actions and recovery remain available. Partner Program field descriptions now appear only during editing focus; errors and review feedback remain visible. See [the UI tracker and checks](../../../context/MY_RIDES_GLASS_REWORK.md).

My Rides also supports destination/pickup/reference search, category/month filters (IST), database-backed outcome counts, contextual retry/rebooking/receipt/help, real driver/vehicle context and recorded activity. Quotes, collections/refunds and cancellation/no-show reviews are displayed separately. Deploy the accompanying API V2 history enhancements before distributing this mobile change; no schema migration is needed. Existing All/Active/Past clients remain compatible.

Saved places now has a map and floating carousel, a map-based Add Place flow, and shared photos, visits and reviews. My Rides tabs/filters use the shared liquid-glass chip. Place details include actual visitor context, account-scoped save/visit/review actions, optional contributed contacts and an in-app driving-route preview. Previous personal addresses remain available under Previous saves. See [the saved-place implementation](../../../context/SAVED_PLACES_GLASS_REWORK.md).

Deploy the API V2 migration `202610310001_shared_places` with `npx prisma migrate deploy` from `apps/api/v2` before using the new shared-place screens. It adds four tables and a nullable link on existing saves; it does not publish, modify or delete existing personal addresses. Existing Cloudinary configuration handles contributed images; the geocoder supplies addresses rather than place photography. Device map, picker and contact/share checks remain necessary before release.

- Google sign-in, secure token storage, session restoration, logout, and access-token refresh.
- Location search, reverse geocoding, and road routing through the API.
- On home entry, current location is read with `geolocator`; the latest coordinates are cached locally and synced to the user's API record. A cached coordinate is used as the initial map center while fresh permission/location is resolved.
- Home and ride detail maps use MapLibre with OpenFreeMap's Liberty vector style, a tilted camera, 3D building extrusions where map data is available, and visible map attribution. The public style endpoint needs no API key; it is a third-party service provided as-is.
- Server fare quotes and ride requests from the map booking screen.
- Ride history, ride details, cancellation, start confirmation, review, payment checkout, and receipt.
- Profile editing, saved places, notifications, payment methods, emergency contacts, and support conversations.

Cash/direct-to-driver UPI is recorded as pending until the assigned driver confirms full receipt, with zero commission. Riders can select cash or open a UPI payment intent after completion; opening a payment app never proves collection. The driver UPI destination must come from an approved application field. Online collection through a payment provider remains a future feature.

## Phase A: rider and driver foundation

Settings includes a rider/driver switch for activated drivers and exited partners. The preference is stored per account, does not change the server role, and cannot switch away from active work. Entering rider mode takes an eligible driver offline. Startup asks API V2 for travel-context and restores active driver/rider trips before opening the selected home.

Driver mode still requires an eligible verified vehicle. Required vehicle registration includes Settings for returning to rider mode, Help and sign-out. Driver trips/history are owner-scoped. Phase B extends the recovery page into the map-first operational trip below. Support combines configured contact actions with existing tickets. Home's bell opens Notifications, its no-GPS/no-cache fallback is Bhagalpur, and scheduling is represented as Now until the next release.

Fresh fare quotes use each vehicle category's independent distance-band fare rather than category base/time rates. Configure actual rates for each selectable category or subcategory in **App > User > Fare Policy** or **Vehicle Categories** before requesting quotes. Unconfigured categories are excluded from new quotes; parent and physical-family prices are never inherited. **Support > Configure > Contact** supplies public help channels.

Deploy the matching API V2 routes and configuration migrations before distributing this mobile change. The Android base release `0.1.5+5` includes these flows; see [its release record](../../../context/ANDROID_RELEASE_0_1_5_BUILD5.md) and [Phase A implementation, accepted rules and rollout](../../../context/PHASE_A_IMPLEMENTATION.md).

## Phase B: operational driver trip

- Map-first driver home shows readiness, an active vehicle, online/offline status and expiring nearby offers. Online requires precise GPS. Settings, vehicles, trip history, Help and exit/dues retain their existing gates.
- Accepting an offer/restoring an active trip opens the map and a draggable trip card. Navigation follows pickup, then destination after verified start, with maneuver text, distance to the next turn, route progress, browse/follow controls and rerouting after deviation. A routing failure leaves trip controls accessible with a retry.
- Arrival uses the configured radius (initially 150 m) and GPS age (initially 60 s). The waiting screen shows the free waiting clock. Rider confirmation plus the trip code must both succeed. The trip code is separate from partner activation and is only shown to the rider.
- Calls and text chat are scoped to the trip. There is no masked calling provider. Active-trip offers are view-only, without queuing or accepting another ride.
- Completion shows the server fare and collection controls. Only the assigned driver confirms cash/UPI receipt, or reports unpaid fare with a reason. Cancellation, no-show and disputes retain evidence for admin review. Approved cancellation/no-show charges have a separate direct-UPI link when the original driver's approved UPI is available; Support records verified settlement. They never carry into another driver's fare.
- Startup restores active trips; final rider/driver pages provide a return-home action. Driver tracking stops on going offline, switching to rider mode or signing out. Stale GPS pauses offer eligibility and is shown to participants.

**A new base APK is required.** Android adds a foreground location service/notification and wake lock; iOS adds location background mode and its permission description. This change must not be shipped as a Dart-only patch to the old base. Android base `0.1.5+5` is published to Shorebird; distribute its APK separately. Device testing must cover foreground/background tracking, process restart, revoked permissions, native MapLibre rendering and UPI/calling intents on both platforms. Notifications/chat/matching use foreground polling and persisted inbox entries; background push delivery and voice guidance are separate work.

See the [Phase B tracker](../../../context/PHASE_B_IMPLEMENTATION.md) and [screen catalog](../../../context/USER_DRIVER_SCREEN_CATALOG.md).

The driver trip screen uses the updated API V2 context response for both its public trip summary and action state. Deploy that matching API before distributing this app version. Opening a historical trip preserves GPS reporting for another active assignment. Navigation and view-only offers refresh independently of trip actions, and a slow optional request does not block start/completion controls. The [follow-up audit](../../../context/PHASE_AB_AUDIT.md) lists the additional corrections and passing checks.

## Shorebird setup

Run the following commands from `apps/user/v1`.

```powershell
shorebird account whoami
# Only if this machine is not authenticated:
shorebird login
shorebird doctor
```

The app is registered as **1More User** (`47a2ff06-8ca3-41a1-b62a-6ab5ebcb52a7`). Its identity is in `shorebird.yaml`, which is included in the Flutter asset bundle and should be committed. After cloning, use the existing file; do not run `shorebird init --force` and create another app identity. Login credentials remain in Shorebird's local configuration, outside this repository. See [Shorebird initialization](https://docs.shorebird.dev/code-push/initialize/).

Shorebird's default updater checks for patches in the background on launch and uses a downloaded patch on the next full app launch. No startup dialog or Dart updater package is needed for this behavior. Normal `flutter run --debug` remains available for development; installed users need a **Shorebird release build** to receive patches. See [update strategies](https://docs.shorebird.dev/code-push/update-strategies/).

### Create the release APK

1. Run `flutter pub get` and `flutter analyze`.
2. Set the local `.env` to the intended environment. For production, use `API_BASE_URL=https://apionemore.vercel.app/api/v2` and the matching public Google web client ID. This file is bundled into the app; it must contain only public client configuration.
3. Check the version in `pubspec.yaml` (`0.1.5+5` currently). Each new base release needs a new version/build number; this release increments `0.1.4+4` once to `0.1.5+5`.
4. Build and publish the Shorebird base release:

```powershell
shorebird release android --artifact apk --flutter-version 3.47.7
```

The APK is normally written to `build/app/outputs/flutter-apk/app-release.apk`; use the artifact path printed by the CLI. Keep the exact commit, lockfile, environment and version used for this release. This command uploads release artifacts to Shorebird; distribute the APK to users separately. See [release commands](https://docs.shorebird.dev/code-push/release/).

Android releases use the private keystore configured in `android/key.properties`. Place `onemore.jks` in `android/` and configure:

```properties
storeFile=onemore.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=upload
keyPassword=YOUR_KEY_PASSWORD
```

Relative keystore paths resolve from `android/`; absolute paths are also accepted. Matching surrounding quotes are accepted, so `storeFile="./onemore.jks"` also works. All four properties are required for release signing. The properties file and keystore are ignored by Git. Google sign-in requires the signing certificate's SHA-1 to be registered in Firebase/Google OAuth (and the Play app-signing certificate when applicable). Keep the same signing identity for updates to existing installations.

Validate signing without compiling an APK, from `apps/user/v1/android`:

```powershell
.\gradlew.bat :app:validateSigningRelease --console=plain
```

Install the generated APK on a connected device:

```powershell
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

### Publish a Dart fix to an existing release

Use the target release's original environment/build settings. To patch the latest published Android base `0.1.5+5`, explicitly set both build values:

```powershell
shorebird patch android --release-version 0.1.5+5 --build-name 0.1.5 --build-number 5 --track stable
```

This publishes to installed users of that release. Use the actual released version in all three version arguments. A Dart-only patch keeps the installed base version unchanged and receives its own Shorebird patch number; bumping `pubspec.yaml` does not upgrade installed APK metadata. Changes to native plugins, Gradle, permissions, assets (including `.env`), or Flutter itself need a new base release and APK. Follow [Shorebird patch guidance](https://docs.shorebird.dev/code-push/patch/).

The project version is now `0.1.5+5`, incrementing the version and build once from `0.1.4+4` for the new base APK release. Devices still running `0.1.3+3` must install the new APK to receive this new base and its assets; a patch cannot change an installed APK's Android version name/code.

When a patch depends on new API endpoints, publish it to `--track staging` first, deploy the matching API V2 changes, and verify those routes before promoting the patch with `shorebird patches set-track --release-version 0.1.5+5 --patch-number <number> --track stable`.

### Published updates

**Latest Android base: `0.1.5+5`, published on 30 October 2026.** Shorebird release `939190` is active for Android, built from source commit `f6f41a1` with Flutter `3.47.7` (revision `01aea2ee0626578b6b30ebbb2605f195833464fa`). It includes the liquid-glass mobile rework and updated assets. The APK's version, existing signing identity, production API configuration and three Android architectures were verified.

- Versioned APK: `build/releases/0.1.5+5/onemore-user-0.1.5+5.apk` (104,009,789 bytes, approximately 99.2 MiB).
- APK SHA-256: `5b6b567c32b87f2cdc2d76199584a7dcd69e6eaac85d0fa2237a2f3c30663d9e`.
- Full verification and distribution notes: [Android release record](../../../context/ANDROID_RELEASE_0_1_5_BUILD5.md).

The following entries describe earlier patches and their original base releases:

| Date | Platform | Installed base release | Patch | Track | Changes |
| --- | --- | --- | --- | --- | --- |
| 2026-10-23 | Android | `0.1.1+1` | `1` | stable | Driver vehicle registration, review feedback, draft recovery, and eligibility gate. |
| 2026-10-25 | Android | `0.1.3+3` | `1` | stable | Partner final-submit validation, draft/attachment recovery, expired-session recovery, stable upload previews and bounded logging. |

Patch 1 passed Shorebird's native-code and asset compatibility checks. The vehicle screens reuse the car and image icons already bundled in that base release; adding new tree-shaken icon glyphs requires a new base APK. The required API V2 routes were deployed before stable promotion.

The `0.1.3+3` patch (Shorebird patch ID `748007`) also passed both compatibility checks without overrides, covering arm32, arm64 and x86_64. The sign-in recovery button reuses the existing refresh glyph so the bundled icon font remains identical to the installed release. Flutter analysis and all 17 partner submission tests passed before publication. Source version `0.1.4+4` was not published as a new base APK by this patch operation.

**Android base release `0.1.3+3` was published to Shorebird on 25 October 2026**, using Flutter `3.47.7` (Shorebird revision `7dbbfb1fc6`) and the existing release signing identity. Package metadata and the APK signature were verified: `com.brogrammer.onemore`, version name `0.1.3`, version code `3`.

- APK: `build/app/outputs/flutter-apk/app-release.apk` (103,583,557 bytes, approximately 98.8 MiB).
- APK SHA-256: `ad97b5d2ab8c68f02fba724f0eeee87ee739fc2df6bbcfad94c00690c688a47e`.
- Companion bundle: `build/app/outputs/bundle/release/app-release.aab`.
- Distribute the APK separately; Shorebird publication does not install a new base version on existing devices or publish it to Google Play. Native Phase B changes require this new base rather than a patch to `0.1.1+1`.

On this 8 GB Windows machine, the release used process-only Gradle overrides for a 2 GB heap, two workers and Kotlin compilation in process. The project's Gradle settings were not changed.

### Maintenance and checks

```powershell
shorebird upgrade
shorebird flutter versions list
shorebird doctor
flutter analyze
```

Use Flutter `3.47.7` for this project's documented base release command; check that it appears in Shorebird's supported versions. When changing Flutter, update the documented version and publish a new base release. SDK downloads during CLI setup are expected. Building an APK is a deliberate release step, not a routine analysis check.


## Phase C rider experience

Home opens a booking review before confirmation, with category/fare/payment policy, quote expiry and optional pickup instructions. Lost booking responses reconcile the same draft; retries retain the same request key and payload. Home can resume an active rider/driver trip and rebooking requests a fresh quote.

The rider trip page follows server matching, assignment, arrival, combined OTP/confirmation, in-progress navigation, completion and collection. It shows the actual driver/vehicle, timestamped GPS and OSRM remaining route, with visible last-known/error states. Receipt, rating, structured cancellation, reviewed fees, paginated Active/Past history, notification re-entry and trip-linked support share existing app components. Safety offers configured calls, emergency contacts, clipboard and manual WhatsApp sharing of a static summary.

Requires the matching Phase C API V2 and the Phase B native base/location permissions. No new package is required. No APK was built for these checks. See [Phase C implementation and device acceptance](../../../context/PHASE_C_IMPLEMENTATION.md).


## Phase D driver account

Driver home and Settings now link to Driver Account: Account, Payout details, My requests and Safety & help. Earnings & transactions separates completed fares, direct receipts, pending amounts and reviewed charges, with UTC date filters and pagination. Reviewed bank/UPI changes preserve the original approved destination until admin approval. Private vehicle documents can be opened and manually replaced for review; active trips block replacement. RC/insurance/PUC accept PDF or images, while vehicle front/back require images. Exited drivers retain account, statement, settlement and private-document reads.

Deploy the matching API V2 and migration 0012 first. Phase D adds no new native package; retain the new base requirement from Phase B. See [Phase D tracker](../../../context/PHASE_D_IMPLEMENTATION.md) for tests and real-device acceptance.

## Profile and Settings

The home avatar opens a profile overview with the signed-in account's photo/name/email, Personal Information, Documents, Saved Vehicles, Payment Methods and Settings. The gear and Settings card expose Partner Program, the eligible rider/driver switch, driver account/history, saved places, notifications, emergency contacts, support and confirmed logout. There is no bottom navigation. Back navigation preserves session/trip recovery, and exited partners retain read access through their existing account/document screens.

The initial loading skeleton mirrors the profile header and five menu cards, respects reduced motion and adapts to the available screen. Failed initial loads offer retry; failed refreshes keep the last loaded profile. Subtitles describe real actions rather than showing invented document/vehicle/payment counts.

Settings, profile editing and Partner Program use the shared liquid-glass material: real clipped backdrop blur, pastel lighting, reflective rims, translucent panels, dark glossy actions and matching skeletons. This includes policy/application/document/selfie/review/confirmation/final-PDF/activation/exit screens and linked vehicle-registration/catalog/document forms. Read [MOBILE_DESIGN.md](../../../context/MOBILE_DESIGN.md) before all future mobile UI reworks; the [implementation tracker](../../../context/LIQUID_GLASS_MOBILE_REWORK.md) records scope and checks. Admin design remains separate.

Profile photo selection uses the existing camera/gallery plugin, previews locally and uploads only after Save (up to 3 MB). Deploy the matching API V2 `POST /me/avatar` update first: it accepts `image_upload` and performs the shared WebP conversion before cloud storage, while retaining legacy URL callers. No new package, Android configuration or database migration is required. See [the redesign and checks](../../../context/SETTINGS_PROFILE_REDESIGN.md).

## Partner application submission

The editable application starts with contact/delivery and then shows one configured category at a time. Continue validates the current step; Previous/back preserves answers. Image/document fields use compact glass upload cards with a file-review sheet. The draft restores its category, and final Submit validates the entire application before uploading. See [the category-step implementation](../../../context/PARTNER_APPLICATION_CATEGORY_STEPS.md).

Pending documents and the camera selfie now stay in app-private files, with account-scoped encrypted draft metadata. Submit processes one file at a time in a worker isolate, shows progress, and reuses completed uploads after a failure. Reopening restores editable drafts or the server's submitted state. Stop and restart the updated app before testing this change; hot reload cannot replace old in-memory form state. See [submission recovery and device acceptance](../../../context/PARTNER_APPLICATION_SUBMISSION_FIX.md).

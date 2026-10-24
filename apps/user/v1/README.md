# 1more User App

The Flutter rider app signs in with Google and consumes API V2 at `/api/v2`. The API V2 server also supports its `/api/v1` compatibility prefix.

Home avatar opens Settings, including profile and Partner Program. The program includes published rich policy/confirmation documents, dynamic applications and field feedback, private final PDF download, first-login one-time activation and the driver-home placeholder. See [the phased plan](../../../context/PARTNER_ONBOARDING_PLAN.md) and [implementation/operator guide](../../../context/PARTNER_ONBOARDING_IMPLEMENTATION.md). Use the API V2 server for these features.

## Local setup

1. From `apps/api/v2`, apply migrations, regenerate Prisma, run `npm run dev`, and keep the API running while using the app. The default port is `4001`.
2. Copy `.env.example` to `.env` if `.env` is missing.
3. Set `GOOGLE_CLIENT_ID` in `apps/api/v2/.env` to the Google web OAuth client ID.
4. Set `GOOGLE_SERVER_CLIENT_ID` in this app's `.env` to that same client ID.
5. Set `API_BASE_URL` in this app's `.env` to the machine running the API.
6. Run `flutter pub get` and `flutter run` from `apps/user/v1`.

Android builds need JDK 21 for the MapLibre native plugin. Flutter currently selects Android Studio's JDK automatically; check `flutter doctor -v` if the build reports a Java version error.

The `html` dependency is pinned to `0.15.6`: `flutter_html 3.0.0` uses a selector function removed in `html 0.15.7`. Keep this compatibility pin when updating dependencies until the renderer supports the newer API. After pulling dependency changes, run `flutter pub get` before starting the app.

The default API URL, `http://10.0.2.2:4001/api/v2`, works from the Android emulator. Use `http://localhost:4001/api/v2` for an iOS simulator, or the computer's LAN address for a physical device. Use HTTPS for deployed builds.

For a physical phone, open `http://<computer-LAN-IP>:4001/api/v2/health` on the phone before signing in. It should report `database: connected`. A request timeout usually means the API is stopped or the phone cannot reach the computer.

Firebase initializes from `lib/firebase_options.dart` on Android and iOS. The checked-in Android `google-services.json` has OAuth entries for the app and the local debug signing SHA-1 is registered in Firebase. Add the SHA-1 for any other signing key and download an updated `google-services.json` before signing in with that build.

For iOS Google sign-in, create an iOS OAuth client for `com.brogrammer.onemore` in the same Google Cloud project, then download a `GoogleService-Info.plist` containing `CLIENT_ID` and `REVERSED_CLIENT_ID`. Add that file to the Runner target, put its `CLIENT_ID` in `GIDClientID` and its `REVERSED_CLIENT_ID` under `CFBundleURLTypes` in `ios/Runner/Info.plist`. The current Firebase iOS config has neither OAuth value, so iOS Google sign-in needs this step before it can work. The iOS deployment target is 15.0, as required by the current Firebase SDK.

## Connected rider flows

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

Fresh fare quotes use the saved admin Fare Policy rather than category base/time rates. Configure actual rates for all three fare groups in **App > User > Fare Policy** before requesting quotes. No monetary defaults are invented. **Support > Configure > Contact** supplies public help channels.

Deploy the matching API V2 routes and configuration migrations before releasing this mobile change. No new APK or Shorebird patch was published for Phase A or B. See [Phase A implementation, accepted rules and rollout](../../../context/PHASE_A_IMPLEMENTATION.md).

## Phase B: operational driver trip

- Map-first driver home shows readiness, an active vehicle, online/offline status and expiring nearby offers. Online requires precise GPS. Settings, vehicles, trip history, Help and exit/dues retain their existing gates.
- Accepting an offer/restoring an active trip opens the map and a draggable trip card. Navigation follows pickup, then destination after verified start, with maneuver text, distance to the next turn, route progress, browse/follow controls and rerouting after deviation. A routing failure leaves trip controls accessible with a retry.
- Arrival uses the configured radius (initially 150 m) and GPS age (initially 60 s). The waiting screen shows the free waiting clock. Rider confirmation plus the trip code must both succeed. The trip code is separate from partner activation and is only shown to the rider.
- Calls and text chat are scoped to the trip. There is no masked calling provider. Active-trip offers are view-only, without queuing or accepting another ride.
- Completion shows the server fare and collection controls. Only the assigned driver confirms cash/UPI receipt, or reports unpaid fare with a reason. Cancellation, no-show and disputes retain evidence for admin review. Approved cancellation/no-show charges have a separate direct-UPI link when the original driver's approved UPI is available; Support records verified settlement. They never carry into another driver's fare.
- Startup restores active trips; final rider/driver pages provide a return-home action. Driver tracking stops on going offline, switching to rider mode or signing out. Stale GPS pauses offer eligibility and is shown to participants.

**A new base APK is required.** Android adds a foreground location service/notification and wake lock; iOS adds location background mode and its permission description. This change must not be shipped as a Dart-only patch to the old base. No APK was built for checks and no Shorebird release was published. Device testing must cover foreground/background tracking, process restart, revoked permissions, native MapLibre rendering and UPI/calling intents on both platforms. Notifications/chat/matching use foreground polling and persisted inbox entries; background push delivery and voice guidance are separate work.

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
3. Check the version in `pubspec.yaml` (`0.1.2+2` currently). Each new base release needs a new version/build number, for example `0.1.3+3` after releasing `0.1.2+2`.
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

Use the target release's original environment/build settings. The repository is prepared for the next base release, `0.1.2+2`; the existing Android base release is `0.1.1+1`. Explicitly override both build values when patching that installed release:

```powershell
shorebird patch android --release-version 0.1.1+1 --build-name 0.1.1 --build-number 1 --track stable
```

This publishes to installed users of that release. Use the actual released version in all three version arguments. A Dart-only patch keeps the installed base version unchanged and receives its own Shorebird patch number; bumping `pubspec.yaml` does not upgrade installed APK metadata. Changes to native plugins, Gradle, permissions, assets (including `.env`), or Flutter itself need a new base release and APK. Follow [Shorebird patch guidance](https://docs.shorebird.dev/code-push/patch/).

When a patch depends on new API endpoints, publish it to `--track staging` first, deploy the matching API V2 changes, and verify those routes before promoting the patch with `shorebird patches set-track --release-version 0.1.1+1 --patch-number <number> --track stable`.

### Published updates

| Date | Platform | Installed base release | Patch | Track | Changes |
| --- | --- | --- | --- | --- | --- |
| 2026-10-23 | Android | `0.1.1+1` | `1` | stable | Driver vehicle registration, review feedback, draft recovery, and eligibility gate. |

Patch 1 passed Shorebird's native-code and asset compatibility checks. The vehicle screens reuse the car and image icons already bundled in the base release; adding new tree-shaken icon glyphs would require a new base APK. The required API V2 routes were deployed before stable promotion. The repository's `0.1.2+2` version is prepared for a future base release and is not a newly published APK.

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

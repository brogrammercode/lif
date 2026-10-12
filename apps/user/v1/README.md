# 1more User App

The Flutter rider app signs in with Google and consumes the versioned Lif API at `/api/v1`.

## Local setup

1. From `apps/api`, run `npm run dev` and keep the API running while using the app. The configured database must be reachable.
2. Copy `.env.example` to `.env` if `.env` is missing.
3. Set `GOOGLE_CLIENT_ID` in `apps/api/.env` to the Google web OAuth client ID.
4. Set `GOOGLE_SERVER_CLIENT_ID` in this app's `.env` to that same client ID.
5. Set `API_BASE_URL` in this app's `.env` to the machine running the API.
6. Run `flutter pub get` and `flutter run` from `apps/user/v1`.

The default API URL, `http://10.0.2.2:4000/api/v1`, works from the Android emulator. Use `http://localhost:4000/api/v1` for an iOS simulator, or the computer's LAN address for a physical device. Use HTTPS for deployed builds.

For a physical phone, open `http://<computer-LAN-IP>:4000/api/v1/health` on the phone before signing in. It should report `database: connected`. A request timeout usually means the API is stopped or the phone cannot reach the computer.

Firebase initializes from `lib/firebase_options.dart` on Android and iOS. The checked-in Android `google-services.json` has OAuth entries for the app and the local debug signing SHA-1 is registered in Firebase. Add the SHA-1 for any other signing key and download an updated `google-services.json` before signing in with that build.

For iOS Google sign-in, create an iOS OAuth client for `com.brogrammer.onemore` in the same Google Cloud project, then download a `GoogleService-Info.plist` containing `CLIENT_ID` and `REVERSED_CLIENT_ID`. Add that file to the Runner target, put its `CLIENT_ID` in `GIDClientID` and its `REVERSED_CLIENT_ID` under `CFBundleURLTypes` in `ios/Runner/Info.plist`. The current Firebase iOS config has neither OAuth value, so iOS Google sign-in needs this step before it can work. The iOS deployment target is 15.0, as required by the current Firebase SDK.

## Connected rider flows

- Google sign-in, secure token storage, session restoration, logout, and access-token refresh.
- Location search, reverse geocoding, and road routing through the API.
- On home entry, current location is read with `geolocator`; the latest coordinates are cached locally and synced to the user's API record. A cached coordinate is used as the initial map center while fresh permission/location is resolved.
- Server fare quotes and ride requests from the map booking screen.
- Ride history, ride details, cancellation, start confirmation, review, payment checkout, and receipt.
- Profile editing, saved places, notifications, payment methods, emergency contacts, and support conversations.

Cash checkout is recorded as pending until collection is confirmed. Digital methods are intentionally unavailable until a payment-provider adapter and credentials are configured; cash collection confirmation/reconciliation also needs an operator or driver workflow.

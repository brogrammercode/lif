# Lif User App

The Flutter rider app signs in with Google and consumes the versioned Lif API at `/api/v1`.

## Local setup

1. Start PostgreSQL and the API from `apps/api`.
2. Set `GOOGLE_CLIENT_ID` in `apps/api/.env` to the Google web OAuth client ID.
3. Set `GOOGLE_SERVER_CLIENT_ID` in this app's `.env` to that same client ID.
4. Set `API_BASE_URL` in this app's `.env` to the machine running the API.
5. Run `flutter pub get` and `flutter run` from `apps/user/v1`.

The default API URL, `http://10.0.2.2:4000/api/v1`, works from the Android emulator. Use `http://localhost:4000/api/v1` for an iOS simulator, or the computer's LAN address for a physical device. Use HTTPS for deployed builds.

Register the Android application ID and SHA-1 signing certificate in the same Google Cloud project. For iOS, configure the Google OAuth URL scheme in the Runner target. Google sign-in cannot complete until those platform credentials and the matching server client ID are configured.

## Connected rider flows

- Google sign-in, secure token storage, session restoration, logout, and access-token refresh.
- Location search, reverse geocoding, and road routing through the API.
- Server fare quotes and ride requests from the map booking screen.
- Ride history, ride details, cancellation, start confirmation, review, payment checkout, and receipt.
- Profile editing, saved places, notifications, payment methods, emergency contacts, and support conversations.

Cash checkout is recorded as pending until collection is confirmed. Digital methods are intentionally unavailable until a payment-provider adapter and credentials are configured; cash collection confirmation/reconciliation also needs an operator or driver workflow.

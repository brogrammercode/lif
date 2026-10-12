# Lif Project Overview

This document describes the repository as it exists now: its applications, runtime flows, API, database, configuration, local setup, and the parts that are still only planned. It is based on the checked-in source and project documentation, rather than treating the product blueprint as implemented code.

## 1. What Lif is

Lif (also branded as “1more” in some app metadata) is a ride-booking product in development. The current workspace contains:

- A Flutter rider app in `apps/user/v1`.
- A Node.js/TypeScript REST API in `apps/api`.
- A PostgreSQL data model managed by Prisma, with one initial migration and a development seed.
- Product, database, backend, and UI guidance in `PROJECT_SCHEMA.md` and `contexts/`.

The rider app and API are connected for authentication, booking, ride history, profile, saved places, notifications, safety contacts, payment-method records, and support. There is no driver Flutter app or admin/support web app in this repository yet. The API does have driver and admin endpoints. The map booking UI still contains some local presentation state around the real quote and booking calls.

## 2. Repository layout

```text
.
├── PROJECT_SCHEMA.md             Product and target-system blueprint
├── PROJECT_OVERVIEW.md           This current-state guide
├── contexts/
│   ├── code_standard.md          General code conventions
│   └── ui_standard.md            Detailed UI design conventions
├── apps/
│   ├── api/                      Express + TypeScript + Prisma service
│   │   ├── prisma/               Schema, migration, seed
│   │   └── src/                  HTTP app and feature modules
│   └── user/v1/                  Flutter rider app
│       ├── android/              Android host project
│       ├── ios/                  iOS host project
│       ├── assets/images/        Brand and login images
│       └── lib/                  Dart application source
└── .gitignore
```

The API feature folders use a mostly consistent `constant`, `type`, `repo`, `service`, `controller`, and `route` separation. Flutter groups code by feature and has shared UI, theme, routing, and network helpers under `lib/`.

## 3. Runtime architecture

```text
Flutter rider app
  ├─ Google Sign-In / Firebase initialization
  ├─ secure token storage + Dio HTTP client
  ├─ map UI + device location
  └─ HTTPS/JSON requests to /api/v1
          │
          ▼
Express API (port 4000 by default)
  ├─ Helmet, CORS, JSON body parser, request IDs
  ├─ auth, validation, idempotency, error handling
  ├─ feature services and repositories
  ├─ Prisma Client
  ├─ PostgreSQL
  ├─ Nominatim for geocoding
  └─ OSRM-compatible routing service for routes and quotes
```

The Flutter client does not connect directly to PostgreSQL. Database operations stay in API repositories. Normal responses use a shared success envelope; failures use a shared error envelope that includes a request ID. The API prefix is `/api/v1`.

## 4. Rider app

### Startup and navigation

`lib/main.dart` loads the Flutter `.env`, initializes Firebase using `firebase_options.dart`, and starts a Material app with ScreenUtil sizing and the Lif theme. The initial route `/` is a session gate. It checks secure storage, then calls `/auth/me` when a token exists. It routes to login or home based on the result.

Named routes are declared in `lib/core/routes.dart`:

| Route | Page |
|---|---|
| `/` | Session gate |
| `/login` | Login |
| `/home` | Map and ride booking |
| `/profile` | Profile editing |
| `/rides` | Ride history |
| `/ride-detail` | Ride details and available ride actions |
| `/saved-places` | Saved places management |
| `/notifications` | In-app notifications |
| `/emergency-contacts` | Emergency contact management |
| `/support` | Support ticket list and creation |
| `/support-ticket` | Support conversation |
| `/payment-methods` | Saved payment methods |
| `/settings` | Navigation to settings pages and sign out |

`/search` and `/ride` constants exist but are not registered in the route map. The current booking flow is implemented inside the home page. The drawer is opened from home and links into profile, rides, settings, and other feature pages.

### Screens and user flows

- **Login:** A branded sign-in page calls Google Sign-In, sends the resulting identity token to the API, stores the returned access and refresh tokens, then replaces the navigation stack with home.
- **Session gate:** Restores a session from secure storage and validates it with the API. If the API request fails but the local token remains, the gate currently still routes to home.
- **Home and booking:** Restores the locally cached last-known coordinate, then requests device location through Geolocator. A fresh position is cached locally and sent to `PATCH /me/location`. The map falls back to the cached coordinate when permission or location lookup is unavailable. Authenticated user responses also include the last-known coordinate so it can repopulate the local cache. It displays a Flutter Map with OpenStreetMap-compatible tiles, supports pickup/drop-off selection and debounced place suggestions, reverse-geocodes positions, fetches a road route, asks the API for fare quotes, displays vehicle choices, and submits the selected quote as a ride. Ride time selection exists in UI state; the current quote payload contains pickup/drop-off and does not send the selected time.
- **Ride history:** Loads the signed-in rider’s rides, supports pull-to-refresh, and opens a ride detail by passing the ride ID as a route argument.
- **Ride detail:** Loads ride data and exposes actions according to state: cancel, confirm the ride start, checkout, view a receipt, rate the ride, and refresh driver locations for an active ride. Location refresh is a client request; the code does not use a WebSocket stream.
- **Profile:** Reads and updates first name, last name, and phone. Email is shown read-only. The API has an avatar endpoint, but the current profile screen does not provide an avatar upload flow.
- **Saved places:** Creates, edits, and deletes a label/type/address with a selected geocoded location. Types are Home, Work, and Other.
- **Notifications:** Lists in-app notifications, visually marks unread items, supports refresh, and marks a notification read when tapped.
- **Payment methods:** Lists and deletes payment methods. The current add flow offers Cash only; the UI explains that digital methods require a provider integration.
- **Emergency contacts:** Lists, creates, edits, and deletes a contact with name, phone, and optional relationship.
- **Support:** Lists tickets, creates a ticket, opens its conversation, and posts messages.
- **Settings and drawer:** Navigation shortcuts and sign-out. Sign-out attempts to revoke the refresh token server-side, clears secure storage, signs out of Google, and returns to login.

### Flutter app layers

- `lib/core/config.dart`: Reads `API_BASE_URL` and `GOOGLE_SERVER_CLIENT_ID` from dotenv, with Android emulator API URL fallback.
- `lib/core/network/dio_client.dart`: Singleton Dio client; attaches bearer access tokens; retries a failed authenticated request once after refreshing; stores tokens in `flutter_secure_storage`; logs requests and response bodies in debug mode.
- `lib/core/network/api_result.dart`: Unwraps API response payloads and surfaces API error text.
- `lib/core/network/api.constant.dart`: API paths and common header/key constants.
- `lib/features/auth/`: Google sign-in repository, user model, login/session-gate pages, and auth constants.
- `lib/features/user_app/user_app.repo.dart`: Shared repository for rider-facing API features (profile, rides, quotes, saved places, notifications, payments, emergency contacts, support, geocoding, routing, and ride locations).
- `lib/components/ui/`: Reusable app page layout, logo, button, empty state, card, section label, and load-error UI.
- `lib/core/theme.dart` and `color.dart`: Outfit typography, Material 3 base theme, green brand color, and common palette.

The map’s default/fallback position is Jakarta (`-6.2, 106.816666`). The home map uses public map tile services configured in `home.constant.dart`; the API calls public Nominatim for search/reverse geocoding and an OSRM-compatible service for driving routes.

### Platforms and dependencies

The app targets Android and iOS. The Android project uses Kotlin/Java 17 and the Firebase Google Services Gradle plugin. iOS uses CocoaPods and has a minimum deployment target of 15.0. Flutter dependencies include `flutter_map`, `geolocator`, `latlong2`, `dio`, `flutter_secure_storage`, `google_sign_in`, Firebase Core, ScreenUtil, Google Fonts, and Flutter Bloc (the dependency is present; the inspected app startup does not establish a Bloc-based state architecture).

The app ID/package metadata is `com.brogrammer.onemore`; the pubspec package is named `user`, and the product title constant identifies the app. The Android Firebase config is checked in. The README says iOS Google sign-in still needs an iOS OAuth client and a `GoogleService-Info.plist` with URL scheme/client values; the present Firebase iOS options are incomplete for that sign-in setup.

## 5. API service

### Process and middleware

`apps/api/src/main.ts` loads validated environment config, creates the Express app, listens on `PORT` (default 4000), and closes the HTTP server and Prisma connection on SIGINT/SIGTERM. `infra/http/server.ts` installs Helmet, configured CORS, a JSON parser capped at 1 MB, request context, the `/api/v1` router, not-found handling, and centralized error handling.

`core/config.ts` validates environment variables with Zod at startup. The required `DB_STRING` and `JWT_SECRET` must be set; `JWT_SECRET` must contain at least 32 characters. Defaults include a 15-minute access token, 30-day refresh token, port 4000, wildcard CORS, OSRM public routing URL, and a development webhook secret. The sample `.env.example` lists the configuration variables.

Authentication middleware reads bearer access tokens and can enforce roles. The idempotency middleware requires an authenticated request and an `Idempotency-Key`, scopes keys by method and URL path, hashes the request body, detects conflicts/in-progress repeats, and stores the response for replay. The error middleware assigns request IDs and standardizes validation, application, 404, and internal errors.

### Feature modules and current routes

All paths below are under `/api/v1`. `:id` is a resource identifier. Unless marked otherwise, routes require an access token.

| Feature | Routes | Behavior |
|---|---|---|
| Health | `GET /health` | Checks database reachability and reports connected/disconnected. |
| Auth | `POST /auth/google`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Google ID-token login, access/refresh token lifecycle, current user. Logout and `me` require auth. |
| User | `GET /me`, `PATCH /me`, `POST /me/avatar` | Current profile, profile update, avatar URL update endpoint. |
| User location | `PATCH /me/location` | Authenticated update of the user’s last-known latitude and longitude. |
| Saved places | `GET/POST /me/saved-places`, `PATCH/DELETE /me/saved-places/:id` | Rider-owned place CRUD. |
| Notifications | `GET /me/notifications`, `POST /me/notifications/:id/read` | List and mark read. |
| Geocoding | `GET /geocode/search?q=...`, `GET /geocode/reverse?latitude=...&longitude=...`, `GET /geocode/route?...` | Nominatim search/reverse; OSRM-style route. These are currently public routes. |
| Rides | `POST /rides/quote`, `POST /rides`, `GET /rides`, `GET /rides/:id`, `GET /rides/:id/events`, `GET /rides/:id/locations`, `POST /rides/:id/cancel`, `POST /rides/:id/confirm-start`, `POST /rides/:id/reviews` | Fare quote, request, rider history/detail, event/location history, cancellation, start confirmation, review. Creation/cancel/start confirmation use idempotency. |
| Driver | `GET /driver/profile`, `GET /driver/me`, `POST /driver/profile`, `PATCH /driver/availability`, `POST /driver/vehicles`, `GET /driver/offers`, `POST /driver/offers/:id/accept`, `POST /driver/offers/:id/reject`, `POST /driver/location`, `POST /driver/rides/:id/arrive`, `POST /driver/rides/:id/start`, `POST /driver/rides/:id/complete` | Driver profile, availability, vehicle, offer workflow, location updates, trip lifecycle. Routes require authentication; service rules enforce driver eligibility/ownership. |
| Emergency contacts | `GET/POST /emergency-contacts`, `PATCH/DELETE /emergency-contacts/:id` (also `/me/emergency-contacts`) | Authenticated CRUD aliases for user safety contacts. |
| Payments | `GET/POST /payment-methods`, `DELETE /payment-methods/:id`; `/me/payment-methods` aliases; `POST /payments/checkout`; `POST /rides/:id/payment/checkout`; `GET /rides/:id/receipt`; `POST /payments/webhooks/:provider` | Saved method records, checkout state, receipt, signed payment webhook. Checkout is idempotent. Webhook signature uses `x-provider-signature`. |
| Support | `GET/POST /support/tickets`, `GET /support/tickets/:id`, `POST /support/tickets/:id/messages` | User ticket list/create/detail/conversation. Ticket creation is idempotent. |
| Admin | `PATCH /admin/drivers/:id/verification`, `POST /admin/rides/:id/offers` | Requires auth plus ADMIN role; verifies drivers and dispatches offers. |

### Ride quoting and lifecycle

The quote service calls the configured routing provider to get route distance, duration, and geometry. It calculates one quote per configured vehicle type from fixed base, distance, and time rates in `ride.constant.ts`; quotes expire after a configured short lifetime. The client submits the draft ride ID and selected quote ID to request a ride. Repository code persists the ride state and logs mutations. This is deterministic v1 pricing, not a live/demand-based pricing engine.

The schema has ride states from `DRAFT` and `REQUESTED` through dispatch, arrival, waiting, in-progress, completed, cancelled, expired, and no-driver-found. Driver endpoints advance the assigned trip; the rider has cancellation and start-confirmation endpoints. Admin creates ride offers. There is no matching scheduler or automatic dispatch service evident in the current route/service set, and the rider app does not receive live push/socket ride state updates.

### Payments and support boundaries

The API persists payment methods and checkout/payment state. Cash checkout remains pending; it does not mean cash has been collected. Digital methods return a provider-unavailable outcome until a real provider adapter and credentials are configured. A webhook signature boundary exists, but provider-specific payment creation, capture, refund, and reconciliation remain integration work. Support is an API-backed ticket and message flow; a support-agent UI is not included.

## 6. Database and persistence

The Prisma schema is `apps/api/prisma/schema.prisma`; it uses PostgreSQL and snake_case database mappings. The checked-in migration history contains one initial migration, `0001_init`. Prisma’s datasource variable is `DB_STRING`. `infra/database/client.ts` wraps Prisma Client with an ID hook that fills missing IDs using the current millisecond timestamp string; model IDs in this schema are text IDs rather than PostgreSQL UUID types.

### Enums

- `UserRole`: RIDER, DRIVER, SUPPORT, ADMIN.
- `UserStatus`: ACTIVE, SUSPENDED, DELETED.
- `AuthProvider`: GOOGLE, APPLE, PHONE, EMAIL.
- `DriverAvailability`: OFFLINE, AVAILABLE, EN_ROUTE, ON_TRIP, PAUSED, SUSPENDED.
- `VerificationStatus`: PENDING, IN_REVIEW, VERIFIED, REJECTED, EXPIRED.
- `VehicleType`: BIKE, SCOOTER, AUTO, SEDAN, SUV.
- `VehicleStatus`: ACTIVE, INACTIVE, UNDER_REVIEW, REJECTED.
- `RideStatus`: DRAFT, REQUESTED, SEARCHING, DRIVER_ASSIGNED, DRIVER_ARRIVING, DRIVER_WAITING, IN_PROGRESS, COMPLETED, CANCELLED, EXPIRED, NO_DRIVER_FOUND.
- `RideOfferStatus`: SENT, ACCEPTED, REJECTED, EXPIRED, CANCELLED.
- `PaymentMethodType`: CASH, CARD, UPI, WALLET.
- `PaymentStatus`: PENDING, REQUIRES_ACTION, AUTHORIZED, CAPTURED, FAILED, REFUNDED, PARTIALLY_REFUNDED, CANCELLED.
- `NotificationType`: RIDE_UPDATE, PAYMENT_UPDATE, PROMOTION, SAFETY, ACCOUNT, SYSTEM.
- `NotificationChannel`: IN_APP, PUSH, SMS, EMAIL.
- `TicketStatus`: OPEN, IN_PROGRESS, WAITING_FOR_USER, RESOLVED, CLOSED.
- `TicketPriority`: LOW, NORMAL, HIGH, URGENT.

### Models and how they relate

| Model | Purpose |
|---|---|
| `User` | Shared account, role/status, identity/contact details, last known coordinates, and relations to user-owned records. |
| `AuthAccount` | Identity-provider account linked to a user; provider plus provider account ID is unique. |
| `Session` | Hashed refresh token, expiry, revocation, and optional client metadata. |
| `Device` | Push token and platform/app metadata. A device registration endpoint is not currently exposed in the route inventory. |
| `DriverProfile` | Driver availability, verification, rating totals, location, active vehicle, and driver relations. |
| `DriverDocument` | Driver verification document metadata and review state. Upload/review tooling is not a complete driver-facing flow yet. |
| `Vehicle` | Driver vehicle type, approval state, make/model, plate, capacity, and metadata. |
| `SavedPlace` | User-owned named address and coordinates. |
| `Ride` | Aggregate trip record: rider/driver/vehicle, pickup/dropoff, state/timestamps, fare and distance fields, and relations. |
| `FareQuote` | Vehicle-specific priced estimate with route distance/time and expiry. |
| `RideOffer` | A driver’s offer for a ride, response status, and expiry. |
| `RideRoute` | Route provider and encoded/JSON geometry for a ride. |
| `RideLocation` | Time-series driver coordinates associated with a ride. |
| `RideEvent` | Ride lifecycle event and optional actor/metadata. |
| `PaymentMethod` | Cash/card/UPI/wallet record and optional provider references/display fields. |
| `Payment` | One payment record per ride with amount, state, provider reference, and payment timestamps. |
| `Review` | One reviewer-to-reviewee rating per ride, with score/comment. |
| `Notification` | User notification content, channel, read/sent timestamps. |
| `SupportTicket` | User ticket, optional ride, priority/status, and messages. |
| `SupportMessage` | Ticket conversation message and optional author/attachments. |
| `UserLog` | Entity/action audit trail with before/after JSON and optional actor. |
| `EmergencyContact` | User-owned safety contact. |
| `IdempotencyKey` | Request key/hash/response/status/expiry for replay-safe mutations. |

Money is stored as `Decimal` and currency defaults to INR. Coordinates use `Decimal(9,6)`. Timestamps use timezone-aware PostgreSQL timestamps. There is no Redis or spatial extension configured in this repository.

### Development seed and database container

`docker-compose.yml` runs PostgreSQL 16 on port 5432 with a persistent Docker volume. `prisma/seed.ts` upserts `rider@lif.local` and `driver@lif.local`, makes the demo driver verified but offline, creates an active demo bike and sets it as the driver’s active vehicle, adds a Jakarta Home saved place, and creates a welcome notification. The seed is for local development; it does not create a usable Google auth session.

## 7. Environment and local development

### API

1. Start PostgreSQL from `apps/api` with `docker compose up -d` (or use another PostgreSQL instance).
2. Copy `.env.example` to `.env` and set `DB_STRING`, a 32+ character `JWT_SECRET`, and the Google web client ID used by the app.
3. From `apps/api`, install packages with `npm install`.
4. Apply the committed migration with `npm run prisma:deploy`.
5. Optionally load development records with `npm run prisma:seed`.
6. Start with `npm run dev`; health endpoint is `GET http://localhost:4000/api/v1/health`.

Scripts: `dev` runs `tsx watch`, `build` compiles TypeScript, `start` runs compiled JS, and Prisma scripts format/generate/validate/migrate/deploy/seed. Production deployments should use `prisma:deploy` for committed migrations.

### Flutter app

1. Start the API and ensure its database health check reports connected.
2. Copy `apps/user/v1/.env.example` to `.env` and set `GOOGLE_SERVER_CLIENT_ID` to the same OAuth web client ID as API `GOOGLE_CLIENT_ID`.
3. Set `API_BASE_URL` for the target device: Android emulator defaults to `http://10.0.2.2:4000/api/v1`; iOS simulator normally uses localhost; a physical device needs the computer’s LAN address and network access.
4. Run `flutter pub get` then `flutter run` inside `apps/user/v1`.

The pubspec declares `.env` as a Flutter asset. `.env` files are ignored by Git. Do not put production secrets in the app bundle; the mobile server client ID is an OAuth audience identifier, not a server secret.

### Important environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `NODE_ENV` | API | development/test/production mode. |
| `PORT` | API | HTTP listen port; default 4000. |
| `DB_STRING` | API/Prisma | PostgreSQL connection URL. |
| `JWT_SECRET` | API | Signs access tokens; minimum 32 characters. |
| `JWT_EXPIRES_IN` | API | Access-token lifetime; default 15m. |
| `REFRESH_TOKEN_DAYS` | API | Refresh-session lifetime; default 30 days. |
| `CORS_ORIGIN` | API | Comma-separated allowed origins or `*`. |
| `GOOGLE_CLIENT_ID` | API | OAuth audience accepted for Google identity tokens. |
| `ROUTING_BASE_URL` | API | OSRM-compatible routing base URL. |
| `PAYMENT_WEBHOOK_SECRET` | API | HMAC secret for webhook validation. |
| `API_BASE_URL` | Flutter | Versioned API base URL. |
| `GOOGLE_SERVER_CLIENT_ID` | Flutter | OAuth server client ID/audience requested by Google Sign-In. |

## 8. Product and engineering documentation

- `PROJECT_SCHEMA.md` is a broad target architecture and implementation blueprint. It contains a proposed fuller ride-booking schema, state machine, endpoint contracts, security guidance, and phased completion plan. It includes future concepts that are not in the actual Prisma schema or app, such as scheduled rides/stops, promos/discounts, broader payment attempts, and other operational entities. Its final “Implemented API v1 alignment” section relates the blueprint to later API work.
- `contexts/code_standard.md` describes project coding conventions and preferred feature/layer patterns.
- `contexts/ui_standard.md` is a detailed visual design standard. It includes UI guidance from another restaurant/POS-oriented design context, so parts of it (restaurant cards, POS terminal, etc.) are not the current Lif ride app specification.
- `apps/api/README.md` documents API setup, environment, layering, endpoints, and payment limitations.
- `apps/user/v1/README.md` documents rider app setup, Google sign-in setup, connected flows, and local networking.

## 9. What is implemented versus what remains

### Present in source

- Google identity-token authentication and session refresh/revocation.
- A real, server-backed rider profile and rider feature set.
- Location permissions, search/reverse geocoding, road routing, and server fare quotes.
- Ride request/history/detail and several rider/driver lifecycle endpoints.
- Driver profiles, vehicle registration, offers, availability, and location API paths.
- Admin verification/dispatch endpoints protected by ADMIN role.
- Database-backed notification, emergency-contact, and support-ticket features.
- Payment records, cash checkout state, receipt endpoint, and webhook-signature validation boundary.
- PostgreSQL migration and development seed.

### Not present or still integration work

- A driver app, admin console, or support-agent console.
- Automatic ride matching/dispatch orchestration and real-time rider updates over WebSockets/SSE/push.
- Payment-provider adapter, digital payment execution, cash collection confirmation, refund operations, and reconciliation workflow.
- Complete driver document upload/review UI and device/push-token registration flow.
- iOS Google Sign-In OAuth plist/client setup described in the app README.
- Production release signing configuration; Android release currently uses the debug signing config.
- A full enterprise operations layer (rate limiting, scheduled cleanup/expiry workers, external object storage, observability/metrics, and deployment manifests are not represented in the repo).

## 10. Known implementation notes and seams

- The rider home page has local driver-search/driver-found visual state and map animation fields inherited from the early UI. Actual fare quotes and ride creation call the API, but the codebase does not show automatic dispatch creating a live driver match.
- The rider history/detail screens support ride actions against the API. Tracking is based on location-history requests, not a persistent live connection.
- The selected future ride time is currently UI state; it is not included in the quote/ride-request path exposed by the inspected client.
- `POST /me/avatar` exists on the API, but the rider profile screen has no image picker/upload interaction.
- `Device` persistence exists in Prisma, but the route inventory does not expose push-device registration.
- Prisma model IDs are text. The shared create hook currently fills missing IDs with `Date.now().toString()`, which differs from the UUID recommendation in `PROJECT_SCHEMA.md` and can collide if multiple records are created in the same millisecond.
- Several enum/schema entities support a wider target model than the shipped workflows. The canonical “what actually exists” is the Prisma file, migration, API routes, and Flutter implementation rather than every proposal in `PROJECT_SCHEMA.md`.
- There is a Flutter `test/` directory, but this overview task did not run tests or builds.

## 11. Commands and checks available

From `apps/api`:

```bash
npm run dev
npm run build
npm run prisma:validate
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
```

From `apps/user/v1`:

```bash
flutter pub get
flutter run
```

The API README also lists build/schema validation commands. No build or test commands were run while writing this overview.

## 12. Key files to open first

| If you want to understand… | Start here |
|---|---|
| Flutter startup/routes | `apps/user/v1/lib/main.dart`, `apps/user/v1/lib/core/routes.dart` |
| Map and ride request UI | `apps/user/v1/lib/features/home/pages/home_page.dart` |
| Rider API calls | `apps/user/v1/lib/features/user_app/user_app.repo.dart` |
| Auth/session/token behavior | `apps/user/v1/lib/features/auth/auth.repo.dart`, `apps/user/v1/lib/core/network/dio_client.dart` |
| API startup/middleware | `apps/api/src/main.ts`, `apps/api/src/infra/http/server.ts` |
| API routes | `apps/api/src/routes/index.ts` and each feature’s `*.route.ts` |
| Ride logic and pricing | `apps/api/src/features/ride/` |
| Database structure | `apps/api/prisma/schema.prisma` |
| Initial DB creation | `apps/api/prisma/migrations/0001_init/migration.sql` |
| Local seed | `apps/api/prisma/seed.ts` |
| Product/target schema plan | `PROJECT_SCHEMA.md` |


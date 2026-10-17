# Lif API v1

The NestJS implementation is available in [`../v2`](../v2/README.md), with setup, architecture, route coverage and client migration instructions.

This is the TypeScript/Express API for the Lif Flutter apps. It uses Prisma ORM with PostgreSQL and exposes a versioned REST API at `/api/v1`.

## Local setup

```bash
cd apps/api/v1
npm install
cp .env.example .env
# Set DB_STRING in .env and start PostgreSQL if it is local.
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

The API package, environment files, Prisma schema/migrations, dependencies, and build output live in `apps/api/v1`. Run all API commands from this directory. Docker Compose explicitly retains project name `api`, preserving the existing local PostgreSQL volume after the move.

Health check:

```text
GET http://localhost:4000/api/v1/health
```

## Required environment

`DB_STRING` is the PostgreSQL connection string. `JWT_SECRET` must be at least 32 characters. Set `GOOGLE_CLIENT_ID` to the Google web OAuth client ID used as the audience by the mobile app. See `.env.example` for the complete list.

`ROUTING_BASE_URL` configures the OSRM-compatible routing service. The API uses it both for the map route and the distance/duration in fare quotes, so the rider sees the same route the quote is priced against.

Admin image uploads require `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in the API environment. The secret stays on the server. Restart the API after changing `.env`.

All new uploads pass through the shared `infra/media/image_transform.ts` pipeline before any Cloudinary upload request. Sharp decodes the validated input and converts it to WebP in memory (quality 85, alpha quality 100), honoring orientation and retaining transparency/animation frames. Processing is limited to 40 million input pixels and 10 seconds; converted files must remain within 5 MB. Conversion errors stop the save before upload. Cloudinary accepts only WebP from this pipeline, and its response format is checked. Existing stored URLs are unchanged. See [Sharp's WebP output options](https://sharp.pixelplumbing.com/api-output/#webp).

Until a payment provider is integrated, digital payment methods are rejected and cash checkout remains `PENDING`; the API does not claim cash was collected.

## Layering

Each feature follows the project convention:

```text
feature.constant.ts
feature.type.ts
feature.repo.ts
feature.service.ts
feature.controller.ts
feature.route.ts
```

Repositories own Prisma access. Mutations run in a transaction and write a `UserLog`. Services own state and authorization rules. Controllers parse inputs and wrap responses. Routes only connect middleware and controllers.

## Implemented endpoints

### Authentication and user

```text
POST  /api/v1/auth/google
POST  /api/v1/auth/refresh
POST  /api/v1/auth/logout
GET   /api/v1/auth/me
PATCH /api/v1/me
PATCH /api/v1/me/location
POST  /api/v1/me/avatar
GET   /api/v1/me/saved-places
POST  /api/v1/me/saved-places
PATCH /api/v1/me/saved-places/:id
DELETE /api/v1/me/saved-places/:id
GET   /api/v1/me/notifications
POST  /api/v1/me/notifications/:id/read
```

The Google endpoint accepts an `id_token`, verifies its audience and signature with Google's public keys, then creates the Lif session. The mobile app's `GOOGLE_SERVER_CLIENT_ID` must match this API's `GOOGLE_CLIENT_ID`.

`PATCH /api/v1/me/location` accepts `{ "latitude": number, "longitude": number }` and updates the authenticated user's last-known coordinates.

### Rides

```text
POST /api/v1/rides/quote
POST /api/v1/rides
GET  /api/v1/rides
GET  /api/v1/rides/:id
POST /api/v1/rides/:id/cancel
POST /api/v1/rides/:id/confirm-start
GET  /api/v1/rides/:id/events
GET  /api/v1/rides/:id/locations
POST /api/v1/rides/:id/reviews
```

`POST /api/v1/rides`, cancellation, rider start confirmation, payment checkout, and support ticket creation require an `Idempotency-Key` header.

### Geocoding and safety

```text
GET    /api/v1/geocode/search?q=...
GET    /api/v1/geocode/reverse?lat=...&lng=...
GET    /api/v1/me/emergency-contacts
POST   /api/v1/me/emergency-contacts
PATCH  /api/v1/me/emergency-contacts/:id
DELETE /api/v1/me/emergency-contacts/:id
```

The geocoding provider is called only by the API. Provider failures are returned as a controlled `502` response.

Quote pricing is intentionally deterministic for v1 and can be replaced by a pricing provider without changing the response contract.

### Drivers

```text
GET  /api/v1/driver/profile
GET  /api/v1/driver/me
POST /api/v1/driver/profile
PATCH /api/v1/driver/availability
POST /api/v1/driver/vehicles
GET  /api/v1/driver/offers
POST /api/v1/driver/offers/:id/accept
POST /api/v1/driver/offers/:id/reject
POST /api/v1/driver/location
```

Driver verification is intentionally required before the driver can become `AVAILABLE`.

### Payments and support

```text
GET    /api/v1/payment-methods
POST   /api/v1/payment-methods
DELETE /api/v1/payment-methods/:id
GET    /api/v1/me/payment-methods
POST   /api/v1/me/payment-methods/setup
DELETE /api/v1/me/payment-methods/:id
POST   /api/v1/payments/checkout
POST   /api/v1/rides/:id/payment/checkout
POST   /api/v1/payments/webhooks/:provider
GET    /api/v1/rides/:id/receipt
GET    /api/v1/support/tickets
POST   /api/v1/support/tickets
GET    /api/v1/support/tickets/:id
POST   /api/v1/support/tickets/:id/messages
```

Payment webhooks require an `x-provider-signature` HMAC-SHA256 header. The current checkout boundary persists payment state and is ready for a provider adapter; actual provider credentials and refund calls remain deployment-specific integrations.

### Admin operations

```text
GET   /api/v1/admin/users?query=...&page=1&page_size=20
GET   /api/v1/admin/users/:id
PATCH /api/v1/admin/users/:id
PATCH /api/v1/admin/drivers/:id/verification
POST  /api/v1/admin/rides/:id/offers
```

Admin operations require the `ADMIN` role and write an audit record. The offer endpoint accepts `{ "driver_id": "...", "expires_in_minutes": 10 }`.

The user directory lists nondeleted accounts, supports case-insensitive ID/name/email/phone search, and returns `{ users, total, page, page_size }` (20 users by default; maximum 50). Detail responses expose personal and account metadata, without auth accounts or sessions. Personal updates accept only `{ first_name, last_name, phone_e164, avatar_url, expected_updated_at }`. Optional personal fields can be cleared with `null`; first name is required. Phone numbers must use international format and remain unique; profile images must use HTTPS. Email, role, status, and location cannot be edited through this endpoint. Stale updates return `409 USER_CONFLICT`; successful updates write an audit record atomically. No new migration is required.

Category create/update and personal update bodies also accept optional `image_upload: { file_name, data_url }`. The data URL must contain base64 JPEG, PNG, or WebP bytes, up to 5 MB; decoded file signatures and Cloudinary's image metadata are checked. The API uploads only during an authorized entity mutation, then stores the returned HTTPS URL as `image_url`/`avatar_url`. New uploads are signed with SHA-256, use fresh IDs under `1more-admin/vehicle-categories` or `1more-admin/users`, and never overwrite existing assets. An entity save failure triggers best-effort cleanup of its new asset. Image uploads run outside the database transaction; audit records do not contain image bytes. The two admin form routes allow 8 MB JSON bodies; other endpoints keep their 1 MB limit. Existing URL-based clients remain compatible, while the admin interface uses file selection exclusively.

## Verification commands

```bash
npm run build
npm run test:unit
npm run prisma:validate
npx prisma generate
```

Production applies committed migrations with:

```bash
npm run prisma:deploy
```

Do not run `prisma migrate dev` against production.

Production must configure private JWT and payment webhook secrets; the development fallback and public `.env.example` values are rejected. `ADMIN_WEB_ORIGIN` and explicit `CORS_ORIGIN` lists must contain exact HTTP/HTTPS origins, without URL paths. `JWT_EXPIRES_IN` requires an explicit duration unit such as `15m`.

Payment webhooks sign the exact UTF-8 request body bytes with HMAC-SHA256 and send its hexadecimal digest as `x-provider-signature`. Checkout requires a completed owned ride and preserves existing settled payments. Support ride links and ride review recipients are owner/participant checked.

Shared authentication checks the current database account and role on protected endpoints. Mobile logout accepts the refresh token as revocation proof, including when the access token has expired. It cannot revoke browser refresh tokens through the mobile endpoint.

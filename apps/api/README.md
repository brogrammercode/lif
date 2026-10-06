# Lif API v1

This is the TypeScript/Express API for the Lif Flutter apps. It uses Prisma ORM with PostgreSQL and exposes a versioned REST API at `/api/v1`.

## Local setup

```bash
cd apps/api
npm install
cp .env.example .env
# Set DB_STRING in .env and start PostgreSQL if it is local.
npm run prisma:deploy
npm run prisma:seed
npm run dev
```

Health check:

```text
GET http://localhost:4000/api/v1/health
```

## Required environment

`DB_STRING` is the PostgreSQL connection string. `JWT_SECRET` must be at least 32 characters. Set `GOOGLE_CLIENT_ID` to the Google web OAuth client ID used as the audience by the mobile app. See `.env.example` for the complete list.

`ROUTING_BASE_URL` configures the OSRM-compatible routing service. The API uses it both for the map route and the distance/duration in fare quotes, so the rider sees the same route the quote is priced against.

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
POST  /api/v1/me/avatar
GET   /api/v1/me/saved-places
POST  /api/v1/me/saved-places
PATCH /api/v1/me/saved-places/:id
DELETE /api/v1/me/saved-places/:id
GET   /api/v1/me/notifications
POST  /api/v1/me/notifications/:id/read
```

The Google endpoint accepts an `id_token`, verifies its audience and signature with Google's public keys, then creates the Lif session. The mobile app's `GOOGLE_SERVER_CLIENT_ID` must match this API's `GOOGLE_CLIENT_ID`.

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
PATCH /api/v1/admin/drivers/:id/verification
POST  /api/v1/admin/rides/:id/offers
```

Admin operations require the `ADMIN` role and write an audit record. The offer endpoint accepts `{ "driver_id": "...", "expires_in_minutes": 10 }`.

## Verification commands

```bash
npm run build
npm run prisma:validate
npx prisma generate
```

Production applies committed migrations with:

```bash
npm run prisma:deploy
```

Do not run `prisma migrate dev` against production.

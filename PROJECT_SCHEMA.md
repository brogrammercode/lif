# Lif — Product, Database, and Backend Schema

This document is the implementation blueprint for completing Lif as a ride-booking platform with a Flutter rider app, a driver app, an admin/support surface, a Node.js/TypeScript API, Prisma ORM, and PostgreSQL.

The current Flutter app is an early MVP. It already contains:

- Google-style login UI and a login-to-home flow.
- A map with current-location detection.
- Pickup and destination search using geocoding.
- Route calculation using OSRM.
- Vehicle selection cards.
- A mocked driver-search and driver-found state.
- A drawer with profile, rides, settings, feedback, and emergency placeholders.

The schema below turns those mock states into durable, authenticated, auditable data.

## 1. Recommended project shape

Keep the Flutter app as a client only. Do not connect Flutter directly to PostgreSQL.

```text
Flutter rider app
Flutter driver app                 ── HTTPS/WebSocket ──> API service
Admin/support web app                                      │
                                                           ├── Prisma Client
                                                           ├── PostgreSQL
                                                           ├── Redis (optional)
                                                           ├── Object storage
                                                           └── Payment/maps/messaging providers
```

Recommended backend layout:

```text
apps/api/
  src/
    modules/
      auth/
      users/
      drivers/
      vehicles/
      rides/
      pricing/
      payments/
      notifications/
      support/
      admin/
    common/
    main.ts
  prisma/
    schema.prisma
    seed.ts
    migrations/
```

Use REST for normal CRUD and commands. Use WebSockets or Server-Sent Events for ride-status and driver-location updates. Redis is useful for short-lived driver availability and matching locks, but PostgreSQL remains the source of truth.

## 2. Core domain decisions

### Identity

- A `User` is the account shared by the rider, driver, support, or admin experience.
- Authentication providers are stored in `AuthAccount`; never use an email or Google subject as the primary key.
- Use UUID primary keys.
- Store refresh-token hashes, never raw refresh tokens.
- Keep deleted users as soft-deleted records so ride, payment, and audit history remains valid.

### Money and time

- Store money as PostgreSQL `numeric`, represented as Prisma `Decimal`.
- Store the currency on every fare/payment record. Start with `INR`.
- Store all timestamps in UTC using `timestamptz`.
- Convert to the user's local timezone only in the client presentation layer.

### Locations

- Store latitude and longitude as `numeric(9,6)` for normal application reads.
- Store the human-readable address captured at booking time on the ride. Do not rely on a later geocoder response to reconstruct trip history.
- Keep route geometry in `RideRoute.routeData` as JSONB or an encoded polyline.
- For the first version, nearby-driver matching can use a bounding-box query. Add PostGIS later if matching scale requires true spatial indexes.

### Ownership

- Riders own rides, saved places, payment methods, reviews, and notifications.
- A driver owns a driver profile, vehicles, documents, and driver-side ride offers.
- A ride is the aggregate root for quotes, offers, route, location history, events, payment, and reviews.

## 3. Prisma schema

Create `apps/api/prisma/schema.prisma` with the following starting point. Keep the models together for the first migration; split them into multiple `.prisma` files later only if the backend becomes large.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  RIDER
  DRIVER
  SUPPORT
  ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum AuthProvider {
  GOOGLE
  APPLE
  PHONE
  EMAIL
}

enum OtpPurpose {
  LOGIN
  SIGNUP
  CHANGE_PHONE
  CHANGE_EMAIL
  RESET_PASSWORD
}

enum DriverAvailability {
  OFFLINE
  AVAILABLE
  EN_ROUTE
  ON_TRIP
  PAUSED
  SUSPENDED
}

enum VerificationStatus {
  PENDING
  IN_REVIEW
  VERIFIED
  REJECTED
  EXPIRED
}

enum DocumentType {
  DRIVING_LICENSE
  GOVERNMENT_ID
  VEHICLE_REGISTRATION
  INSURANCE
  PROFILE_PHOTO
}

enum VehicleType {
  BIKE
  SCOOTER
  AUTO
  SEDAN
  SUV
}

enum VehicleStatus {
  ACTIVE
  INACTIVE
  UNDER_REVIEW
  REJECTED
}

enum RideStatus {
  DRAFT
  REQUESTED
  SEARCHING
  DRIVER_ASSIGNED
  DRIVER_ARRIVING
  DRIVER_WAITING
  IN_PROGRESS
  COMPLETED
  CANCELLED
  EXPIRED
  NO_DRIVER_FOUND
}

enum RideOfferStatus {
  SENT
  ACCEPTED
  REJECTED
  EXPIRED
  CANCELLED
}

enum RideEventType {
  CREATED
  SEARCH_STARTED
  QUOTE_SELECTED
  OFFER_SENT
  DRIVER_ACCEPTED
  DRIVER_REJECTED
  DRIVER_ARRIVING
  DRIVER_WAITING
  TRIP_STARTED
  TRIP_COMPLETED
  RIDER_CANCELLED
  DRIVER_CANCELLED
  SYSTEM_CANCELLED
  NO_DRIVER_FOUND
  PAYMENT_AUTHORIZED
  PAYMENT_CAPTURED
  PAYMENT_FAILED
  REFUND_CREATED
}

enum SavedPlaceType {
  HOME
  WORK
  OTHER
}

enum PaymentMethodType {
  CASH
  CARD
  UPI
  WALLET
}

enum PaymentStatus {
  PENDING
  REQUIRES_ACTION
  AUTHORIZED
  CAPTURED
  FAILED
  REFUNDED
  PARTIALLY_REFUNDED
  CANCELLED
}

enum PaymentAttemptStatus {
  CREATED
  PENDING
  SUCCEEDED
  FAILED
}

enum NotificationType {
  RIDE_UPDATE
  PAYMENT_UPDATE
  PROMOTION
  SAFETY
  ACCOUNT
  SYSTEM
}

enum NotificationChannel {
  IN_APP
  PUSH
  SMS
  EMAIL
}

enum DiscountType {
  PERCENTAGE
  FIXED_AMOUNT
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  WAITING_FOR_USER
  RESOLVED
  CLOSED
}

enum TicketPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

model User {
  id                 String             @id @default(uuid()) @db.Uuid
  role               UserRole           @default(RIDER)
  status             UserStatus         @default(ACTIVE)
  firstName          String?
  lastName           String?
  email              String?            @unique
  phoneE164          String?            @unique
  avatarUrl          String?
  lastKnownLatitude  Decimal?           @db.Decimal(9, 6)
  lastKnownLongitude Decimal?           @db.Decimal(9, 6)
  deletedAt          DateTime?          @db.Timestamptz(3)
  createdAt          DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime           @updatedAt @db.Timestamptz(3)

  authAccounts       AuthAccount[]
  sessions           Session[]
  devices            Device[]
  otpChallenges      OtpChallenge[]
  driverProfile      DriverProfile?
  savedPlaces        SavedPlace[]
  riderRides         Ride[]             @relation("RiderRides")
  reviewsGiven       Review[]           @relation("ReviewsGiven")
  reviewsReceived    Review[]           @relation("ReviewsReceived")
  paymentMethods     PaymentMethod[]
  promoRedemptions    PromoRedemption[]
  notifications      Notification[]
  emergencyContacts  EmergencyContact[]
  supportTickets     SupportTicket[]
  supportMessages     SupportMessage[]  @relation("SupportMessageAuthors")
  rideEventsAsActor  RideEvent[]        @relation("RideEventActors")
  auditLogs          AuditLog[]         @relation("AuditLogActors")

  @@index([role, status])
  @@index([createdAt])
}

model AuthAccount {
  id                String       @id @default(uuid()) @db.Uuid
  userId            String       @db.Uuid
  provider          AuthProvider
  providerAccountId String
  providerEmail     String?
  createdAt         DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime     @updatedAt @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id               String    @id @default(uuid()) @db.Uuid
  userId           String    @db.Uuid
  refreshTokenHash String    @unique
  userAgent        String?
  ipAddress        String?
  expiresAt        DateTime  @db.Timestamptz(3)
  revokedAt        DateTime? @db.Timestamptz(3)
  createdAt        DateTime  @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@index([expiresAt])
}

model OtpChallenge {
  id           String     @id @default(uuid()) @db.Uuid
  userId       String?    @db.Uuid
  target       String
  purpose      OtpPurpose
  codeHash     String
  attempts     Int        @default(0)
  expiresAt    DateTime   @db.Timestamptz(3)
  consumedAt   DateTime?  @db.Timestamptz(3)
  createdAt    DateTime   @default(now()) @db.Timestamptz(3)

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([target, purpose, expiresAt])
  @@index([userId])
}

model Device {
  id           String    @id @default(uuid()) @db.Uuid
  userId       String    @db.Uuid
  pushToken    String    @unique
  platform     String
  appVersion   String?
  lastSeenAt   DateTime  @default(now()) @db.Timestamptz(3)
  revokedAt    DateTime? @db.Timestamptz(3)
  createdAt    DateTime  @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
}

model DriverProfile {
  id                 String              @id @default(uuid()) @db.Uuid
  userId             String              @unique @db.Uuid
  availability       DriverAvailability  @default(OFFLINE)
  verificationStatus VerificationStatus  @default(PENDING)
  licenseNumber      String?             @unique
  ratingAverage      Decimal             @default(0) @db.Decimal(3, 2)
  ratingsCount       Int                 @default(0)
  completedRides     Int                 @default(0)
  currentLatitude    Decimal?            @db.Decimal(9, 6)
  currentLongitude   Decimal?            @db.Decimal(9, 6)
  lastLocationAt     DateTime?           @db.Timestamptz(3)
  activeVehicleId    String?             @db.Uuid
  verifiedAt         DateTime?           @db.Timestamptz(3)
  createdAt          DateTime            @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime            @updatedAt @db.Timestamptz(3)

  user          User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  activeVehicle Vehicle?         @relation("ActiveVehicle", fields: [activeVehicleId], references: [id], onDelete: SetNull)
  vehicles      Vehicle[]        @relation("DriverVehicles")
  documents     DriverDocument[]
  rides         Ride[]           @relation("DriverRides")
  offers        RideOffer[]      @relation("DriverRideOffers")
  locations     RideLocation[]   @relation("DriverLocations")

  @@index([availability, verificationStatus])
  @@index([currentLatitude, currentLongitude])
}

model DriverDocument {
  id           String             @id @default(uuid()) @db.Uuid
  driverId     String             @db.Uuid
  type         DocumentType
  fileUrl      String
  documentNo   String?
  status       VerificationStatus @default(PENDING)
  rejectionNote String?
  expiresAt    DateTime?          @db.Timestamptz(3)
  reviewedAt   DateTime?          @db.Timestamptz(3)
  createdAt    DateTime            @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime            @updatedAt @db.Timestamptz(3)

  driver DriverProfile @relation(fields: [driverId], references: [id], onDelete: Cascade)

  @@index([driverId, type])
  @@index([status, expiresAt])
}

model Vehicle {
  id          String        @id @default(uuid()) @db.Uuid
  driverId    String        @db.Uuid
  type        VehicleType
  status      VehicleStatus @default(UNDER_REVIEW)
  make        String
  model       String
  color       String?
  plateNumber String        @unique
  capacity    Int           @default(1)
  photoUrl    String?
  metadata    Json?
  createdAt   DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime      @updatedAt @db.Timestamptz(3)

  driver       DriverProfile  @relation("DriverVehicles", fields: [driverId], references: [id], onDelete: Cascade)
  activeFor    DriverProfile? @relation("ActiveVehicle")
  rides        Ride[]         @relation("RideVehicles")

  @@index([driverId, status])
  @@index([type, status])
}

model SavedPlace {
  id          String         @id @default(uuid()) @db.Uuid
  userId      String         @db.Uuid
  type        SavedPlaceType @default(OTHER)
  label       String
  address     String
  latitude    Decimal        @db.Decimal(9, 6)
  longitude   Decimal        @db.Decimal(9, 6)
  placeData   Json?
  createdAt   DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime       @updatedAt @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, type])
}

model Ride {
  id                 String       @id @default(uuid()) @db.Uuid
  riderId            String       @db.Uuid
  driverId           String?      @db.Uuid
  vehicleId          String?      @db.Uuid
  paymentMethodId    String?      @db.Uuid
  promoCodeId        String?      @db.Uuid
  status             RideStatus   @default(DRAFT)
  pickupAddress      String
  pickupLatitude     Decimal      @db.Decimal(9, 6)
  pickupLongitude    Decimal      @db.Decimal(9, 6)
  dropoffAddress     String
  dropoffLatitude    Decimal      @db.Decimal(9, 6)
  dropoffLongitude   Decimal      @db.Decimal(9, 6)
  scheduledFor       DateTime?    @db.Timestamptz(3)
  requestedAt        DateTime?    @db.Timestamptz(3)
  matchedAt          DateTime?    @db.Timestamptz(3)
  arrivedAt          DateTime?    @db.Timestamptz(3)
  startedAt          DateTime?    @db.Timestamptz(3)
  completedAt        DateTime?    @db.Timestamptz(3)
  cancelledAt        DateTime?    @db.Timestamptz(3)
  cancelReason       String?
  riderNote          String?
  accessCode         String?
  estimatedDistanceM Int?
  estimatedDurationS Int?
  actualDistanceM    Int?
  actualDurationS    Int?
  estimatedFare      Decimal?     @db.Decimal(12, 2)
  finalFare          Decimal?     @db.Decimal(12, 2)
  currency           String       @default("INR") @db.VarChar(3)
  createdAt          DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime     @updatedAt @db.Timestamptz(3)

  rider         User           @relation("RiderRides", fields: [riderId], references: [id], onDelete: Restrict)
  driver        DriverProfile? @relation("DriverRides", fields: [driverId], references: [id], onDelete: SetNull)
  vehicle       Vehicle?       @relation("RideVehicles", fields: [vehicleId], references: [id], onDelete: SetNull)
  paymentMethod PaymentMethod? @relation(fields: [paymentMethodId], references: [id], onDelete: SetNull)
  promoCode     PromoCode?     @relation(fields: [promoCodeId], references: [id], onDelete: SetNull)
  stops         RideStop[]
  quotes        FareQuote[]
  offers        RideOffer[]
  route         RideRoute?
  locations     RideLocation[]
  events        RideEvent[]
  payment       Payment?
  reviews       Review[]
  discounts     RideDiscount[]
  promoRedemptions PromoRedemption[]
  tickets       SupportTicket[]

  @@index([riderId, createdAt])
  @@index([driverId, status, createdAt])
  @@index([status, requestedAt])
  @@index([scheduledFor, status])
}

model RideStop {
  id          String   @id @default(uuid()) @db.Uuid
  rideId      String   @db.Uuid
  sequence    Int
  address     String
  latitude    Decimal  @db.Decimal(9, 6)
  longitude   Decimal  @db.Decimal(9, 6)
  arrivedAt   DateTime? @db.Timestamptz(3)
  departedAt  DateTime? @db.Timestamptz(3)

  ride Ride @relation(fields: [rideId], references: [id], onDelete: Cascade)

  @@unique([rideId, sequence])
  @@index([rideId])
}

model FareQuote {
  id                 String      @id @default(uuid()) @db.Uuid
  rideId             String      @db.Uuid
  vehicleType        VehicleType
  distanceM          Int
  durationS          Int
  pickupEtaS         Int?
  baseFare           Decimal     @db.Decimal(12, 2)
  distanceFare       Decimal     @db.Decimal(12, 2)
  timeFare           Decimal     @db.Decimal(12, 2)
  surgeMultiplier    Decimal     @default(1) @db.Decimal(5, 2)
  discountAmount     Decimal     @default(0) @db.Decimal(12, 2)
  totalFare          Decimal     @db.Decimal(12, 2)
  currency           String      @default("INR") @db.VarChar(3)
  expiresAt          DateTime    @db.Timestamptz(3)
  selectedAt         DateTime?   @db.Timestamptz(3)
  createdAt          DateTime    @default(now()) @db.Timestamptz(3)

  ride Ride @relation(fields: [rideId], references: [id], onDelete: Cascade)

  @@index([rideId, expiresAt])
  @@index([vehicleType, createdAt])
}

model RideOffer {
  id          String          @id @default(uuid()) @db.Uuid
  rideId      String          @db.Uuid
  driverId    String          @db.Uuid
  status      RideOfferStatus @default(SENT)
  sentAt      DateTime        @default(now()) @db.Timestamptz(3)
  respondedAt DateTime?       @db.Timestamptz(3)
  expiresAt   DateTime        @db.Timestamptz(3)
  createdAt   DateTime        @default(now()) @db.Timestamptz(3)

  ride   Ride          @relation(fields: [rideId], references: [id], onDelete: Cascade)
  driver DriverProfile @relation("DriverRideOffers", fields: [driverId], references: [id], onDelete: Restrict)

  @@unique([rideId, driverId])
  @@index([driverId, status, expiresAt])
  @@index([rideId, status])
}

model RideRoute {
  id              String   @id @default(uuid()) @db.Uuid
  rideId          String   @unique @db.Uuid
  provider        String
  encodedPolyline String?
  routeData       Json?
  distanceM       Int
  durationS       Int
  createdAt       DateTime @default(now()) @db.Timestamptz(3)

  ride Ride @relation(fields: [rideId], references: [id], onDelete: Cascade)
}

model RideLocation {
  id          String         @id @default(uuid()) @db.Uuid
  rideId      String         @db.Uuid
  driverId    String?        @db.Uuid
  latitude    Decimal        @db.Decimal(9, 6)
  longitude   Decimal        @db.Decimal(9, 6)
  heading     Decimal?       @db.Decimal(6, 2)
  speedKph    Decimal?       @db.Decimal(7, 2)
  recordedAt  DateTime       @default(now()) @db.Timestamptz(3)

  ride   Ride           @relation(fields: [rideId], references: [id], onDelete: Cascade)
  driver DriverProfile? @relation("DriverLocations", fields: [driverId], references: [id], onDelete: SetNull)

  @@index([rideId, recordedAt])
  @@index([driverId, recordedAt])
}

model RideEvent {
  id        String        @id @default(uuid()) @db.Uuid
  rideId    String        @db.Uuid
  actorId   String?       @db.Uuid
  type      RideEventType
  metadata  Json?
  createdAt DateTime      @default(now()) @db.Timestamptz(3)

  ride  Ride  @relation(fields: [rideId], references: [id], onDelete: Cascade)
  actor User? @relation("RideEventActors", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([rideId, createdAt])
  @@index([actorId, createdAt])
}

model PaymentMethod {
  id                   String            @id @default(uuid()) @db.Uuid
  userId               String            @db.Uuid
  type                 PaymentMethodType
  provider             String?
  providerCustomerId   String?
  providerMethodId     String?
  cardBrand            String?
  cardLast4            String?
  upiHandle            String?
  isDefault            Boolean           @default(false)
  createdAt            DateTime          @default(now()) @db.Timestamptz(3)
  updatedAt            DateTime          @updatedAt @db.Timestamptz(3)

  user  User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  rides Ride[]
  payments Payment[]

  @@index([userId, isDefault])
}

model Payment {
  id                String        @id @default(uuid()) @db.Uuid
  rideId            String        @unique @db.Uuid
  paymentMethodId   String?       @db.Uuid
  status            PaymentStatus @default(PENDING)
  provider          String?
  providerPaymentId String?       @unique
  amount            Decimal       @db.Decimal(12, 2)
  currency          String        @default("INR") @db.VarChar(3)
  paidAt            DateTime?     @db.Timestamptz(3)
  failedAt          DateTime?     @db.Timestamptz(3)
  refundedAt        DateTime?     @db.Timestamptz(3)
  createdAt         DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime      @updatedAt @db.Timestamptz(3)

  ride          Ride           @relation(fields: [rideId], references: [id], onDelete: Restrict)
  paymentMethod PaymentMethod? @relation(fields: [paymentMethodId], references: [id], onDelete: SetNull)
  attempts      PaymentAttempt[]

  @@index([status, createdAt])
}

model PaymentAttempt {
  id                String               @id @default(uuid()) @db.Uuid
  paymentId         String               @db.Uuid
  status            PaymentAttemptStatus @default(CREATED)
  providerReference String?
  amount            Decimal              @db.Decimal(12, 2)
  errorCode         String?
  errorMessage      String?
  createdAt         DateTime             @default(now()) @db.Timestamptz(3)
  completedAt       DateTime?            @db.Timestamptz(3)

  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Cascade)

  @@index([paymentId, createdAt])
}

model Review {
  id         String   @id @default(uuid()) @db.Uuid
  rideId     String   @db.Uuid
  reviewerId String   @db.Uuid
  revieweeId String   @db.Uuid
  score      Int
  comment    String?
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  ride     Ride @relation(fields: [rideId], references: [id], onDelete: Cascade)
  reviewer User @relation("ReviewsGiven", fields: [reviewerId], references: [id], onDelete: Restrict)
  reviewee User @relation("ReviewsReceived", fields: [revieweeId], references: [id], onDelete: Restrict)

  @@unique([rideId, reviewerId, revieweeId])
  @@index([revieweeId, createdAt])
}

model PromoCode {
  id              String       @id @default(uuid()) @db.Uuid
  code            String       @unique
  discountType    DiscountType
  discountValue   Decimal      @db.Decimal(12, 2)
  maxDiscount     Decimal?     @db.Decimal(12, 2)
  minFare         Decimal?     @db.Decimal(12, 2)
  usageLimit      Int?
  usageCount      Int          @default(0)
  perUserLimit    Int          @default(1)
  startsAt        DateTime     @db.Timestamptz(3)
  endsAt          DateTime     @db.Timestamptz(3)
  active          Boolean      @default(true)
  createdAt       DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime     @updatedAt @db.Timestamptz(3)

  rides       Ride[]
  redemptions PromoRedemption[]
  discounts   RideDiscount[]

  @@index([active, startsAt, endsAt])
}

model PromoRedemption {
  id          String   @id @default(uuid()) @db.Uuid
  promoCodeId String   @db.Uuid
  userId      String   @db.Uuid
  rideId      String   @db.Uuid
  redeemedAt  DateTime @default(now()) @db.Timestamptz(3)

  promoCode PromoCode @relation(fields: [promoCodeId], references: [id], onDelete: Restrict)
  user      User      @relation(fields: [userId], references: [id], onDelete: Restrict)
  ride      Ride      @relation(fields: [rideId], references: [id], onDelete: Restrict)

  @@unique([promoCodeId, userId, rideId])
  @@index([userId, promoCodeId])
}

model RideDiscount {
  id          String   @id @default(uuid()) @db.Uuid
  rideId      String   @db.Uuid
  promoCodeId String?  @db.Uuid
  label       String
  amount      Decimal  @db.Decimal(12, 2)
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  ride      Ride       @relation(fields: [rideId], references: [id], onDelete: Cascade)
  promoCode PromoCode? @relation(fields: [promoCodeId], references: [id], onDelete: SetNull)

  @@index([rideId])
}

model Notification {
  id          String              @id @default(uuid()) @db.Uuid
  userId      String              @db.Uuid
  type        NotificationType
  channel     NotificationChannel @default(IN_APP)
  title       String
  body        String
  data        Json?
  readAt      DateTime?           @db.Timestamptz(3)
  sentAt      DateTime?           @db.Timestamptz(3)
  createdAt   DateTime            @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, readAt, createdAt])
}

model EmergencyContact {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  name        String
  phoneE164   String
  relationship String?
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model SupportTicket {
  id          String         @id @default(uuid()) @db.Uuid
  userId      String         @db.Uuid
  rideId      String?        @db.Uuid
  status      TicketStatus   @default(OPEN)
  priority    TicketPriority @default(NORMAL)
  subject     String
  createdAt   DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime       @updatedAt @db.Timestamptz(3)
  resolvedAt  DateTime?      @db.Timestamptz(3)

  user     User            @relation(fields: [userId], references: [id], onDelete: Restrict)
  ride     Ride?           @relation(fields: [rideId], references: [id], onDelete: SetNull)
  messages SupportMessage[]

  @@index([userId, status, createdAt])
  @@index([rideId])
}

model SupportMessage {
  id          String   @id @default(uuid()) @db.Uuid
  ticketId    String   @db.Uuid
  authorId    String?  @db.Uuid
  body        String
  attachments Json?
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  ticket SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  author User?         @relation("SupportMessageAuthors", fields: [authorId], references: [id], onDelete: SetNull)

  @@index([ticketId, createdAt])
}

model AuditLog {
  id         String   @id @default(uuid()) @db.Uuid
  actorId    String?  @db.Uuid
  entityType String
  entityId   String
  action     String
  beforeData Json?
  afterData  Json?
  ipAddress  String?
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  actor User? @relation("AuditLogActors", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([entityType, entityId, createdAt])
  @@index([actorId, createdAt])
}
```

## 4. Important schema corrections before the first migration

The code block is the target domain model, but run validation before migration:

```bash
cd apps/api
npx prisma format
npx prisma validate
npx prisma migrate dev --name init
npx prisma generate
```

If the selected Prisma version reports a relation ambiguity, add an explicit relation name to the affected pair. The most likely candidates are the two `PaymentMethod` relations and the `PromoCode` relations because they are intentionally used by several models.

Add these business validations in the API layer and database transactions:

- `Review.score` must be an integer from 1 to 5.
- A ride can be reviewed only after `COMPLETED`.
- The rider cannot review the rider; the driver cannot review the driver.
- `Ride.finalFare` cannot be negative.
- `FareQuote.expiresAt` must be in the future when selected.
- Only a verified driver with an active vehicle can accept a ride.
- A vehicle plate number must be normalized before the unique check.
- A promo code must be active, within its date range, under its usage limit, and valid for the current fare.
- A payment webhook must be idempotent on provider event/reference ID.
- A ride-status transition must be validated against the state machine below.

## 5. Ride state machine

Only the backend may perform these transitions:

```text
DRAFT
  └─> REQUESTED ──> SEARCHING ──> DRIVER_ASSIGNED
                                  ├─> DRIVER_ARRIVING
                                  │    └─> DRIVER_WAITING
                                  │          └─> IN_PROGRESS ──> COMPLETED
                                  └─> NO_DRIVER_FOUND

REQUESTED, SEARCHING, DRIVER_ASSIGNED, DRIVER_ARRIVING,
DRIVER_WAITING, IN_PROGRESS ──> CANCELLED

REQUESTED, SEARCHING ──> EXPIRED
```

Every transition must:

1. Update the `Ride` row.
2. Insert a `RideEvent` row.
3. Update the relevant timestamp (`matchedAt`, `startedAt`, `completedAt`, etc.).
4. Publish a notification/event after the transaction commits.
5. Be safe to retry.

For driver assignment, use a transaction with a conditional update so two drivers cannot accept the same ride:

```sql
UPDATE "Ride"
SET "status" = 'DRIVER_ASSIGNED',
    "driverId" = $driverId,
    "vehicleId" = $vehicleId,
    "matchedAt" = NOW(),
    "updatedAt" = NOW()
WHERE "id" = $rideId
  AND "status" = 'SEARCHING'
  AND "driverId" IS NULL;
```

The API should accept the offer only when this update affects exactly one row.

## 6. API surface required by the Flutter app

### Authentication

```text
POST /v1/auth/google
POST /v1/auth/refresh
POST /v1/auth/logout
GET  /v1/me
PATCH /v1/me
POST /v1/me/avatar
```

Response requirements:

- Return a short-lived access token and a refresh-token cookie or securely stored refresh token.
- Return the user profile, role, driver verification state, and default payment method needed to render the app.
- Make login idempotent for the same provider account.

### Places and map search

```text
GET  /v1/geocode/search?q=...
GET  /v1/geocode/reverse?lat=...&lng=...
GET  /v1/me/saved-places
POST /v1/me/saved-places
PATCH /v1/me/saved-places/:id
DELETE /v1/me/saved-places/:id
```

The backend should proxy or abstract the geocoder so the Flutter app does not own provider keys, rate limits, or provider-specific response formats.

### Fare and ride creation

```text
POST /v1/rides/quote
POST /v1/rides
GET  /v1/rides/:id
GET  /v1/rides
POST /v1/rides/:id/cancel
POST /v1/rides/:id/confirm-start
GET  /v1/rides/:id/events
GET  /v1/rides/:id/locations
```

`POST /v1/rides/quote` should return the vehicle options currently mocked in `HomePage`:

```json
{
  "rideDraftId": "uuid",
  "route": {
    "distanceM": 4200,
    "durationS": 900,
    "polyline": "..."
  },
  "options": [
    {
      "quoteId": "uuid",
      "vehicleType": "BIKE",
      "pickupEtaS": 240,
      "totalFare": "86.00",
      "currency": "INR",
      "expiresAt": "2026-10-02T15:00:00.000Z"
    }
  ]
}
```

`POST /v1/rides` must re-check the quote server-side. Never trust the fare, route distance, or vehicle type sent by the client.

### Driver matching and trip tracking

```text
GET  /v1/driver/me
PATCH /v1/driver/availability
POST /v1/driver/location
GET  /v1/driver/offers
POST /v1/driver/offers/:id/accept
POST /v1/driver/offers/:id/reject
POST /v1/driver/rides/:id/arrive
POST /v1/driver/rides/:id/start
POST /v1/driver/rides/:id/complete
```

Use a WebSocket channel for the rider's active ride:

```text
ride:{rideId}
  ride.status.changed
  ride.driver.location
  ride.driver.assigned
  ride.payment.updated
```

Persist important location samples and status changes. Do not use the WebSocket stream as the only record of a trip.

### Payments and post-ride actions

```text
GET  /v1/me/payment-methods
POST /v1/me/payment-methods/setup
DELETE /v1/me/payment-methods/:id
POST /v1/rides/:id/payment/checkout
POST /v1/payments/webhooks/:provider
GET  /v1/rides/:id/receipt
POST /v1/rides/:id/reviews
```

Do not store PAN, CVV, bank passwords, or raw UPI credentials. Store only provider tokens and display-safe fields such as brand and last four digits.

### Drawer features

```text
GET  /v1/me/notifications
POST /v1/me/notifications/:id/read
GET  /v1/me/emergency-contacts
POST /v1/me/emergency-contacts
PATCH /v1/me/emergency-contacts/:id
DELETE /v1/me/emergency-contacts/:id
POST /v1/support/tickets
GET  /v1/support/tickets
GET  /v1/support/tickets/:id
POST /v1/support/tickets/:id/messages
```

## 7. Admin and support requirements

The rider app is not enough to operate the platform. Build an authenticated admin/support surface with these capabilities:

- Approve or reject driver profiles, documents, and vehicles.
- Suspend users, drivers, or vehicles.
- View a ride timeline, route, offers, location samples, fare, payment, and support tickets.
- Manually cancel or reassign a ride with an audit reason.
- Create, pause, and expire promo codes.
- Refund or partially refund payments through the payment provider.
- Export ride, payout, payment, and safety reports.
- Read `AuditLog` entries; never allow silent destructive changes.

Add role checks to every admin endpoint. Hiding a button in the UI is not authorization.

## 8. Database indexes and operational rules

Required indexes are included in the Prisma schema, but also plan for:

- A partial PostgreSQL index for active drivers if the driver search volume becomes high.
- A time-based retention/partitioning strategy for `RideLocation` if it grows beyond millions of rows.
- A case-insensitive normalized promo code column or normalized input before querying.
- Cursor pagination on rides, notifications, events, support messages, and audit logs.
- Database-level foreign keys. Do not use Prisma `relationMode = "prisma"` for this PostgreSQL deployment unless there is a specific infrastructure reason.

Use transactions for:

- Creating a ride draft plus its quote and route.
- Selecting a quote and creating a ride request.
- Accepting a driver offer.
- Starting and completing a ride.
- Capturing payment and writing the payment event.
- Redeeming a promo code and incrementing usage.

Use idempotency keys for all client-retryable commands:

```text
POST /v1/rides                 Idempotency-Key: <uuid>
POST /v1/rides/:id/cancel      Idempotency-Key: <uuid>
POST /v1/payments/checkout     Idempotency-Key: <uuid>
```

If command idempotency becomes substantial, add an `IdempotencyKey` model containing `userId`, `key`, `method`, `path`, `requestHash`, `responseJson`, and `expiresAt`.

## 9. Security and privacy checklist

- Validate every request with a typed schema such as Zod or Valibot.
- Rate-limit login, OTP, geocoding, quote, ride creation, and payment endpoints.
- Hash OTPs and refresh tokens with a slow hash; never log them.
- Redact phone numbers, emails, tokens, and payment-provider secrets from logs.
- Encrypt sensitive driver documents at rest and use signed, expiring download URLs.
- Require explicit authorization for every rider-owned `:id` resource lookup.
- Keep a server-side audit log for admin actions and financial changes.
- Verify payment webhooks using provider signatures.
- Add a data deletion/export workflow for privacy requests.
- Configure backups, point-in-time recovery, and restore drills before production launch.

## 10. Flutter integration plan

Replace the current mock behavior in this order:

1. Add an API client with access-token refresh and typed response models.
2. Replace `UserConstants`/hard-coded profile data with `GET /v1/me`.
3. Move geocoding and OSRM calls behind the backend.
4. Implement quote creation and render server-returned `FareQuote` values.
5. Create a ride only after the rider selects a quote.
6. Subscribe to the active ride channel and render real status/location updates.
7. Replace the three-second fake driver-found delay with `RideOffer`/WebSocket events.
8. Add ride history, ride detail, receipt, cancellation, and rating screens.
9. Wire the drawer to saved places, notifications, emergency contacts, support, settings, and logout.
10. Add offline/retry states and idempotent command handling.

Suggested Flutter feature routes:

```text
/login
/home
/ride/quote
/ride/active/:rideId
/ride/completed/:rideId
/rides
/rides/:rideId
/saved-places
/notifications
/payment-methods
/emergency-contacts
/support
/settings
```

## 11. Migration and delivery phases

### Phase 0 — backend foundation

- Create `apps/api` with TypeScript and the chosen HTTP framework.
- Add `DATABASE_URL`, separate development/staging/production databases, and secret management.
- Add Prisma, `schema.prisma`, migration scripts, seed scripts, and health checks.
- Add structured logging, request IDs, validation, and error responses.

### Phase 1 — authentication and profile

- Migrate `User`, `AuthAccount`, `Session`, `Device`, and `OtpChallenge`.
- Complete Google sign-in and token refresh.
- Implement `/me`, profile editing, avatar upload, and logout.

### Phase 2 — map, quote, and ride lifecycle

- Migrate `SavedPlace`, `Ride`, `RideRoute`, `FareQuote`, `RideEvent`, and `RideStop`.
- Move route/geocoder provider calls to the API.
- Implement quote expiry and ride state transitions.

### Phase 3 — driver operations

- Migrate `DriverProfile`, `DriverDocument`, `Vehicle`, `RideOffer`, and `RideLocation`.
- Add driver onboarding, document review, availability, matching, and trip commands.
- Add WebSocket ride events.

### Phase 4 — money and trust

- Migrate `PaymentMethod`, `Payment`, `PaymentAttempt`, `Review`, `PromoCode`, and discounts.
- Add payment-provider webhooks, receipts, refunds, ratings, and promo validation.

### Phase 5 — support and production operations

- Migrate notifications, emergency contacts, support tickets, and audit logs.
- Build admin/support workflows.
- Add monitoring, backups, alerting, load tests, security review, and release gates.

## 12. Seed data for development

The seed script should create:

- One rider account with a verified-looking profile.
- One driver account with a verified driver profile.
- One active bike and one active auto vehicle.
- A few saved places around Jakarta.
- Three fare quotes with different vehicle types.
- One completed ride with payment and two reviews.
- One active promo code.
- One support ticket and notification.

Never seed real payment credentials or production tokens.

## 13. Definition of done

The first production-ready version is complete when:

- A new user can authenticate, edit a profile, and persist a device session.
- A rider can select pickup/drop-off, receive a server-calculated quote, and request a ride.
- A verified driver can go online, receive an offer, accept it, arrive, start, and complete the trip.
- Both clients receive durable ride-status updates and the rider can see the driver's location.
- Cancellation, no-driver-found, retry, app restart, and network loss are handled safely.
- Payment status is driven by verified provider webhooks and is idempotent.
- The rider sees ride history, receipt, review, notifications, saved places, and support.
- Admins can verify drivers, inspect rides, refund payments, manage promos, and audit changes.
- Database migrations run in CI/staging and production with `prisma migrate deploy`.
- Backups restore successfully and logs/metrics/alerts are in place.

## 14. Prisma/PostgreSQL references

- [Prisma schema overview](https://docs.prisma.io/docs/orm/prisma-schema/overview)
- [Prisma PostgreSQL connector and type mappings](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql)
- [Prisma relations and database foreign keys](https://docs.prisma.io/docs/orm/prisma-schema/data-model/relations/relation-mode)
- [Prisma indexes](https://docs.prisma.io/docs/orm/prisma-schema/data-model/indexes)
- [Deploying migrations](https://docs.prisma.io/docs/orm/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)

## 15. Implemented API v1 alignment

The implementation lives in `apps/api`. The repository coding standard is the source of truth for code-level conventions, so the executable API schema uses snake_case fields and timestamps, transaction-backed `UserLog` records, and the project ID middleware. The earlier conceptual model in this document remains the product/domain reference; `apps/api/prisma/schema.prisma` is the migration source of truth.

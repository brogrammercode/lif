# API V2 review

## Scope

Reviewed `apps/api/v2`: Nest bootstrap, module wiring, route registration, guards, validation, response handling, repositories, Prisma writes, sessions, idempotency, media processing, package scripts, and production output. The database schema and migration history remain compatible with V1.

## Fixes

| Finding | Change | Regression evidence |
| --- | --- | --- |
| Google login could replace edited names and avatars, including fields intentionally cleared in the admin panel. | Existing provider bindings preserve personal details. Initial binding fills missing details without replacing existing values. | Real database checks exercise mobile and browser login repositories after personal edits. |
| Ride pagination accepted values large enough to cause invalid Prisma queries; offsets used the requested size before clamping. | Added strict, bounded query validation and calculate offsets from the effective page size. | HTTP checks reject invalid numbers before the service runs and verify default pagination. |
| Timestamp ID generation omitted upsert, bulk-return, and nested relation creation. Ride routes and fare quotes could receive UUIDs. | Centralized preparation uses Prisma relation metadata and covers direct writes, nested creates, createMany, connectOrCreate, upsert, and updates containing creates. Explicit IDs and arbitrary JSON remain intact. | Fast nested-data checks plus real database assertions for upsert, bulk-return, nested session creation, ride routes, and fare quotes. |
| Unsupported request charsets were reported as server errors. | Return HTTP 415 with the API error envelope for unsupported charset/content encoding. | Real HTTP requests reproduce and verify the corrected response. |
| Nest changed malformed JSON into a generic error code, and invalid gzip bodies returned HTTP 500. | Normalize parser errors before Nest's adapter replaces them: preserve `MALFORMED_JSON` and return HTTP 400 for invalid compressed bodies. | HTTP assertions verify status and error codes for malformed JSON and gzip payloads. |
| Nest accepts case-insensitive routes, but the larger image form parser matched only lowercase URLs. | Apply the same image limit to supported route casing. | Requests larger than the normal limit reach image-form validation on V1, V2, and uppercase V2 paths. |
| Driver location changes had no audit entry. | Write `UPDATE_DRIVER_LOCATION` in the same transaction as the location update, without duplicating coordinates in the audit payload. | Database-backed HTTP checks verify saved coordinates, timestamp, audit actor/entity, and missing-profile behavior. |
| Listener failure did not explicitly close the created application. | Close the Nest application when listening fails, allowing its Prisma shutdown hook to run. | Compiled server exits with code 1 and reports `EADDRINUSE` when the listener port is occupied. |
| The route manifest assigned the `/me` action to the user feature even though the Auth controller owns it. | Corrected the feature and added a comparison against actual compiled Nest metadata. | Fast checks compare every method, path, handler, feature, guard, and idempotency policy. |

## Follow-up review

The second pass examined alternate URL spellings, expected database failures, role changes, and driver verification races.

| Finding | Change | Regression evidence |
| --- | --- | --- |
| Changing URL casing, adding a trailing slash, or using an equivalent encoded parameter could bypass duplicate-request protection. The failing regression executed one mutation three times. | Build the scope from Nest's matched route and decoded parameters before normalizing the API version. Preserve parameter casing because entity IDs are case-sensitive. | HTTP checks verify one mutation across URL spellings and separate scopes for different IDs. |
| Missing-record races, foreign-key conflicts, and aborted conflicting transactions returned HTTP 500. | Map Prisma `P2025` to 404, and `P2003`/`P2034` to safe 409 responses. Internal query diagnostics remain private. | HTTP error assertions plus concurrent deletion of the same owned emergency contact. |
| Creating a driver profile unconditionally changed the account role to DRIVER, removing administrator or support privileges. | Promote RIDER accounts only; preserve existing ADMIN, SUPPORT, and DRIVER roles. | Database-backed registration checks retain privileged roles and verify the administrator still has admin access. |
| Trip completion always marked a driver AVAILABLE, including after verification was revoked. Verification updates did not share the driver lock used by assignment and trip transitions. | Serialize verification updates with driver operations. Rejected idle drivers become OFFLINE; active rides retain their current state until completion. Completion restores AVAILABLE only for a verified, active account. Audit verification-driven availability changes. | Database checks cover revocation before completion, simultaneous revocation/completion, normal completion, and repeated completion without double-counting rides. |
| Ride cancellation could use verification data read before waiting for the driver lock. | Re-read the driver under the lock before deciding availability. | A deterministic repository check verifies the read occurs after locking, and a concurrent cancellation/verification database check verifies the final driver remains OFFLINE. |

## Callback, coordinate, rating, and fare review

The third pass added failing regressions before each fix. They exposed four functional gaps:

| Finding | Change | Regression evidence |
| --- | --- | --- |
| Blank query coordinates were coerced to zero; null, booleans, and arrays also passed numeric coercion in schema calls. | Accept numbers or nonempty numeric strings before range validation. Genuine zero coordinates remain valid. | Schema checks plus HTTP requests on both API versions reject invalid values before calling geocoding providers. |
| A first PENDING callback returned early without saving its provider/payment reference. A later callback without a ride ID could not find the payment. | Bind valid references even when the status is unchanged. Repeated bound callbacks remain idempotent, and status-change events are emitted only for actual transitions. Preserve timestamps on duplicate statuses and update them on new transitions. | Repository checks cover PENDING, reference-only capture, duplicate capture, ignored downgrade, and partial/full refunds. Database-backed signed callbacks exercise the PENDING-to-reference-only-capture sequence. |
| Review creation left driver rating counts and averages unchanged. Concurrent reviews on different rides had no shared driver lock. | Serialize reviews for the same driver and recompute the count and rounded average inside the review transaction. Include the resulting statistics in its audit record. | Repository checks verify locking and transaction order. Database checks cover concurrent scores, rounding, duplicate rejection, and audit data. |
| Binary floating-point arithmetic rounded a fare of 1.005 down to 1.00. | Calculate distance/time components and their total with Prisma Decimal; round components half-up to two decimal places. | A quote-service regression verifies that 500 meters and 30 seconds at rates of 2.01 produce 1.01 for each component and a total of 2.02. |

The configured test database contained no reviews before this pass, so it required no historical rating repair.

## Verification

| Check | Result |
| --- | --- |
| Fast regression suite | 44 passed, zero failures |
| Full PostgreSQL integration suite | 16 passed, zero failures |
| Compiled route metadata | All 76 method/path combinations match the manifest |
| HTTP access checks | All 65 authenticated routes reject unauthenticated requests on both URL versions |
| Strict TypeScript checking | Passed |
| Nest production build | Passed |
| Prettier formatting check | Passed |
| Prisma schema validation | Passed |
| Dependency audit | Zero reported vulnerabilities |
| Occupied-port startup check | Exited with code 1 and reported the listener error |
| Compiled server with unavailable database | Started, returned HTTP 503 with the database-disconnected response, and shut down cleanly |

The request parser fix was also checked against the database-backed HTTP regression after the full suite completed.
The expanded driver verification/completion/cancellation database regression was re-run separately during the second pass and is included in the latest full suite.
The concurrent rating regression was also re-run against the final source after the third pass and passed.
After database runs, read-only inspections confirm that integration fixture users and categories are removed.

The checks use Node's built-in test runner. Fast tests override credentials with fixtures and cannot connect to the configured application database. Integration tests require explicit opt-in, enforce a test database name, create unique fixtures, and remove their users, rides, categories, payments, and associated records afterward. Test files are excluded from production compilation.

Additional inspection found no conflict markers, null bytes, or replacement characters in the reviewed source/schema files. The Prisma schema matches V1. Environment files, dependencies, compiled output, test output, and audit logs are ignored by Git.

## Verification limits

Live Google sign-in and actual Cloudinary network uploads were not performed. Provider requests are mocked; image decoding, WebP conversion, transparency, animation, signing, persistence, and failure cleanup are exercised. API checks do not establish a complete Flutter/admin-to-provider booking flow. This review does not cover unrelated changes in the Flutter, admin, or V1 packages.

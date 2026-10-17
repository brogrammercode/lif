# API v2 NestJS migration

## Implementation decisions

- New standalone package: `apps/api/v2`, NestJS 12, Node.js 24+, port 4001.
- URL prefix `/api/v2`, with `/api/v1` compatibility aliases served by Nest URI versioning.
- Preserve all 13 existing feature groups and all 76 method/path combinations, including existing aliases.
- Convert controllers to decorated Nest class methods, services/repositories/media uploads to injected providers, and feature dependencies to Nest module imports/exports.
- Replace Express auth/origin/rate/webhook middleware with Nest guards and duplicate-request middleware with a Nest interceptor.
- Preserve strict Zod input validation, Prisma transactions/audit records, request IDs, safe response/error contracts, raw webhook bytes, image body limits, and WebP conversion before Cloudinary upload.
- Copy existing environment settings privately into V2 and change only the listener port. Keep existing Prisma schema/migration history and data compatible.

## Completed

1. Inventoried routes, aliases, middleware, service dependencies, and external integrations.
2. Added the package, Nest CLI/compiler settings, runtime dependencies, and separate Prisma client generation.
3. Migrated every feature controller, service and repository; no V1 runtime source dependency or Express Router mounting remains.
4. Added shared Nest guards, exception filter, request-context middleware, idempotency interceptor, database shutdown provider, and application bootstrap.
5. Added separate V2 browser cookie naming and a common cookie path for both supported URI versions.
6. Retained V1-compatible idempotency scopes, schemas, migrations, seed/provisioning utilities, and provider settings.
7. Generated `apps/api/v2/route-manifest.json` with route access metadata and documented startup/client cutover in the package README.
8. Generated Prisma, passed strict TypeScript compilation and a Nest build, and started/stopped the compiled application successfully.
9. Audited the migrated implementation, added automated HTTP/media/database regression checks, and fixed the issues documented in [API_V2_REVIEW.md](./API_V2_REVIEW.md).

## Practical limits

V2 now has its own fast checks and opt-in integration suite against a test PostgreSQL database. Google token verification and Cloudinary network requests have not been exercised with live accounts during the review; image conversion, signing, persistence, and failure cleanup are covered using provider fixtures. A complete client-to-provider booking flow remains outside these API checks. Current admin and Flutter environment settings continue to select their configured server until explicitly pointed at V2.

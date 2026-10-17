# 1More Admin access management

> Current V2 update: see [ADMIN_EXPANSION_IMPLEMENTATION.md](./ADMIN_EXPANSION_IMPLEMENTATION.md). The following implementation/check history includes earlier V1 work. New backend development is V2 only; V1 files are frozen unless explicitly requested.

## Navigation and usage

Open **Admin → Access → 1More Admin**, route `/admin/access/1more-admin`. `/admin` and `/admin/access` redirect to this page. The App and Users sections remain available.

- Grant full administrator access using the intended person's exact Google account email.
- An existing active account is promoted; its prior role is retained for later restoration. An unknown email creates an active account ready for verified Google sign-in. No email is sent, and no password is created.
- Existing active administrators can manage other administrators. These are full administrator grants, without new permission levels.
- Search name/email/ID, filter active/suspended accounts, refresh, and page through the directory. Global overview counts remain independent of filters.
- Remove access through a confirmation dialog. Personal data and ride history remain intact. The person returns to their previous non-admin role and loses browser admin sessions.
- Self-removal is blocked. At least one active administrator must remain. Suspended/deleted accounts cannot receive access. Repeated grants/removals do not duplicate changes or audit entries.

## Implementation

Frontend: `apps/admin/v1/src/modules/admin-access`, shared AppShell navigation and existing UI primitives. Small dialogs use local form state, duplicate-submit protection, cancellation, a 45-second mutation timeout and safe API errors. Search is debounced by 300 ms. Load requests cancel on filter/page changes; old responses cannot replace current results. A stale removal refreshes the list and requires a new selection.

API V1: Express `features/admin_access` router/controller/service/repository.

API V2: injected Nest `AdminAccessModule`, controller/service/repository, registered in `AppModule` and `route-manifest.json`. The new module brings V2 to 14 feature modules and 79 method/path combinations. Historical migration/review documents describe the earlier 76-route baseline.

Both implementations expose the following relative to their API prefix. V2 also accepts its `/api/v1` compatibility prefix.

| Method | Path | Input / result |
| --- | --- | --- |
| GET | `/admin/access/1more-admin` | `query` up to 100 chars; `status=all/ACTIVE/SUSPENDED`; one-based `page`; `page_size` 1–50, default 20. Returns `admins`, `total`, `page`, `page_size`, `stats`. |
| POST | `/admin/access/1more-admin` | `{ email }`, trimmed/lowercased. Returns `{ changed, admin }`. |
| DELETE | `/admin/access/1more-admin/:id` | V2: `{ expected_access_version }` from the directory (timestamp or null for a legacy grant). Returns `{ changed, id, role }`; an absent account returns changed=false and role=null. Legacy expected_updated_at callers remain supported. |

All three require an authenticated, current active administrator. Grant/revoke also re-read the actor inside the write transaction. Browser family validity and deleted-account checks remain enforced on protected requests.

## Persistence, concurrency and audit

Migration `0004_admin_access` adds one `admin_access` row per managed account, recording its previous role, latest grant actor/time and latest removal actor/time. User.role remains the authority. Foreign keys preserve consistency and actor deletion sets actor references to null. Existing ADMIN users need no backfill: the directory shows legacy access without invented metadata.

Access writes take an exclusive PostgreSQL transaction advisory lock (`720048`). Browser admin sign-in and refresh take the shared lock before their existing identity/family locks; grants also use the existing normalized email identity lock (`720047`). This serializes access changes and prevents a browser refresh from creating a surviving session during removal. Both API processes and the CLI provisioning command use these locks.

Grant rejects multiple case-insensitive email matches, inactive accounts and deleted accounts. V2 removal uses the active grant's access-specific version to detect a revoke/regrant, so profile edits, location updates and login no longer cause false conflicts. Role updates, access metadata, browser session invalidation and UserLog entries commit together. Transactions have a 10-second pool wait and a 30-second execution limit.

Removing an account restores its recorded SUPPORT/DRIVER/RIDER role. If a former rider acquired a driver profile while an administrator, it returns to DRIVER. Legacy grants without recorded prior roles return to DRIVER when a driver profile exists, otherwise RIDER. Driver profile creation preserves ADMIN/SUPPORT roles in both API implementations.

All active browser refresh family sessions for the target are revoked when access is removed or newly granted. New protected requests check current role and family validity; already-running requests are not canceled. Existing mobile sessions retain their normal account access under the restored role. Regranting requires a fresh admin sign-in. Existing Google subject binding is retained. Admin sign-in in both APIs preserves saved names/avatars and fills missing fields only when first linking the Google account.

UserLog records `GRANT_ADMIN_ACCESS`, `REVOKE_ADMIN_ACCESS`, and CLI `PROVISION_ADMIN` with before/after roles and actor information. The CLI remains available to provision the first administrator, writes access metadata and preserves previous roles; it is not invoked by application startup.

## Deployment and checks

Run migrations and generate the client from V2 for new deployments. The current expansion is V2 only; do not copy new schemas/migrations to V1. The original access migration 0004 was historically applied once to the shared database and checked from both packages before the user froze V1 development. Historical check results below predate the current expansion.

Implementation checks:

| Check | Result |
| --- | --- |
| Admin TypeScript + Vite production build | Passed |
| Admin source formatting | Passed |
| API V1 TypeScript (`tsc --noEmit`) | Passed |
| API V2 TypeScript and Nest production build | Passed |
| API V2 source formatting | Passed |
| Prisma schemas | Valid; V1/V2 files identical |
| Migration | `0004_admin_access` applied; V1 reports schema up to date |

Initial feature delivery used compilation and schema checks. The follow-up identity verification below adds automated coverage using temporary test accounts. No real person's access is changed by those checks. The actual Google popup is not automated.

## First sign-in identity verification

The user record is created **when access is granted**, even if Google has never been linked. It receives the same generated timestamp ID, ACTIVE status, timestamps, and optional profile fields as a record created by user-app registration. Its role is ADMIN. The first admin Google login matches the verified email, attaches Google's stable subject to that record, fills missing name/avatar fields, and creates a browser session. It does not allocate a second user ID. Later sign-in in the user app reuses the same user and Google link, with a separate mobile session.

Existing mobile accounts are promoted in place, preserving their ID and data. Signing in through mobile first after a grant also binds to the granted record; later admin sign-in reuses that link. Shared identity/email advisory locks coordinate simultaneous first sign-ins and a grant racing with mobile registration.

The follow-up closes these gaps in both API versions:

- Normalize the verified Google email before either app resolves an account; reject tokens missing a verified, nonempty email.
- Reject ambiguous case-insensitive email owners in both login paths instead of selecting an arbitrary match.
- Reject an already-bound Google identity if its current email points to a different user. Never silently merge accounts or replace a Google subject.
- Reject suspended and soft-deleted users before attaching a Google identity or creating sessions. Mobile refresh also rejects soft-deleted users.
- Preserve saved names/avatars on V1 mobile login, matching V2 and the admin path.

Focused database scenarios in each API cover: grant → admin → mobile, grant → mobile → admin, an existing rider promoted to ADMIN, simultaneous admin/mobile first sign-ins, a grant racing mobile registration, normalized emails and a different Google subject, duplicate email owners, inactive/deleted accounts, and changed-email conflicts. They assert stable user IDs, exactly one Google link, actual session records, profile preservation and audit creation. Fixtures are uniquely named and deleted afterward; the suite refuses database names without `test`.

Run from either API directory:

```powershell
$env:LIF_RUN_DB_TESTS = '1'
npm run test:identity
```

The focused suite is also included in `test:integration`; integration files run sequentially. `test:unit` includes Google-claim validation with the provider verification call mocked. Database identity tests use already-verified fixture identities and exercise real repositories/sessions; they do not make real Google sign-ins.

Verification results on 2026-10-17:

| Check | Result |
| --- | --- |
| V2 focused database identity scenarios | 9 passed, 0 failed, 0 skipped |
| V1 focused database identity scenarios | 9 passed, 0 failed, 0 skipped |
| V2 unit/HTTP/provider-fixture checks | 49 passed |
| V1 unit/provider-fixture checks | 20 passed |
| TypeScript checks in both APIs | Passed |
| V2 Nest build and formatting; V1 changed-file formatting | Passed |
| Temporary identity fixtures | Cleaned up by successful suite teardown |

No schema change was required for this follow-up. Browser Google popup interaction and real OAuth issuance were not automated; provider claims are mocked for token-validation tests, and verified fixture identities feed the database scenarios.

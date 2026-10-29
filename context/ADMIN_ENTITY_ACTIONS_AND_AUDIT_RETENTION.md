# Admin entity actions, application deletion and audit retention

## Scope

Admin V1 and API V2 only. Driver activation is the permanent cutoff for deleting a partner application. This change does not delete user accounts or revoke activated drivers.

## Entity menus

The common `ActionMenu` provides an ellipsis trigger, native top-layer popup, outside-click dismissal, Escape, arrow-key navigation and focus restoration. It stays outside table clipping and closes when its anchor moves during scrolling or resizing.

Entity actions use it in vehicle categories/subcategories, brands/models, requirement fields/sections, applications/confirmations, exit requests, application/vehicle field reviews, user directory/account actions, rides, ride reports, administrator access, registration-email records and audit entries. Save, submit, approval-confirmation and file-preview controls remain visible within their forms/readers.

Only the application menu gains a new permanent deletion action. Menus on other entities retain their supported actions; they do not introduce new destructive endpoints.

## Application deletion

1. Open **Partner Program → Applications → Applications → entity menu → Delete application**. Also available from the application review header.
2. A server preview shows the applicant identity and counts of the records/files being removed.
3. Type the applicant's contact email to confirm. Comparison ignores casing and surrounding whitespace.
4. The API rechecks active admin access, the application revision, activation history and mail-delivery state inside one transaction. A stale revision requires refreshing the preview; the dialog retains errors.
5. All database deletions and the deletion audit commit together or roll back together.

### Permanently removed

- The partner application, its policy/confirmation snapshots, review metadata and encrypted activation material.
- All submitted application answers, definition snapshots, field decisions and rejection reasons.
- The application's signed confirmation and its review decision.
- Its delivery records, including PDF delivery and manual-sharing metadata.
- Its linked notifications/queued lifecycle emails. Legacy in-app partner status notices are scoped to the applicant and application's creation time.
- The applicant's application documents, live selfies and final PDF bytes in `partner_assets`, including superseded/draft application uploads. Applications are unique per user; these purposes are separate from vehicle/exit assets.

### Preserved

- User account, login identities and sessions.
- Vehicles, vehicle verification documents, rides and trip/payment history.
- Shared requirements, requirement categories, published documents and vehicle catalogs.
- A record of the deletion in the audit stores, subject to seven-day retention.

Already sent emails, downloaded documents and files shared outside the app cannot be recalled. A new application can subsequently be submitted through the normal rider onboarding flow.

### Blocks and concurrency

Deletion is refused if the application or user has any driver activation timestamp, the user has the DRIVER role, the application is ACTIVATED/EXITED, or exit history exists. Changing the visible application status cannot bypass activation history. An in-progress email/PDF delivery also blocks deletion. Identity/partner locks and delivery-row locks serialize deletion against activation, edits, uploads and email claims. The UI is advisory; the API is authoritative.

### Endpoints

- `GET /api/v2/admin/partner-program/applications/:id/deletion-preview`
- `DELETE /api/v2/admin/partner-program/applications/:id` with `{ "version": 3, "confirmation": "applicant@example.com" }`

Both require authenticated active admin access. The preview does not return file contents.

## Audit titles and inspection

Every registered admin and operational route has an explicit domain title. Examples: **Driver location updated**, **Pickup arrival confirmed**, **Ride offer accepted**, **Trip issue reported**, **Delete partner application**. The outcome remains a separate status badge so failed attempts are visible.

Existing generic method/path or “POST administrator request” titles are translated when read. Original paths and request IDs remain available through **View log details** rather than dominating the list. Request payloads, credentials, documents and activation codes are not included in request audit records.

## Seven-day retention

- Applies to `admin_activity` (request audit, age measured from `started_at`) and `user_logs` (entity-change audit, age measured from `created_at`).
- An entry expires at timestamp + 7 × 24 hours, using UTC instants. Audit list queries exclude entries at or beyond the cutoff immediately.
- Physical deletion happens on the next cleanup pass, in batches of at most 1,000 rows per store/transaction. A PostgreSQL advisory lock prevents overlapping cleanup workers and `SKIP LOCKED` avoids waiting on in-flight entries.
- Persistent Node servers run cleanup at startup and every 15 minutes. Audit-list requests also schedule a rate-limited background pass.
- Vercel includes a daily cron at `0 0 * * *`, calling `/api/v2/internal/audit-retention`. By explicit user request, this endpoint is public and requires no login, secret or additional environment variable. Callers cannot supply a retention period, cutoff or record IDs; the seven-day policy and batch limits stay fixed in the service. Responses are not cached. Hosted cron delivery timing is best effort, so physical cleanup is not guaranteed at the exact expiry second.
- Run `npm run audit:prune` from `apps/api/v2` to clear an existing backlog manually using the same seven-day policy. No application/user deletion is performed by this command.
- Migration `202610290001_audit_retention_index` adds the time index for `user_logs`; `admin_activity` already has its time index.

The later request to remove extra environment requirements removes the cron guard and its configuration entirely. Existing authentication and administrator guards on all other routes remain. API compilation and all 215 API unit/HTTP tests passed after this change, including an unauthenticated cleanup request with attempted cutoff overrides that are ignored.

## Validation

Unit/HTTP tests cover route title completeness, deletion scope, activation guards, stale revisions, email-in-progress blocking, authorization and batched cleanup. The PostgreSQL retention test uses namespace-checked connection-local temporary tables and verifies the exact cutoff and one-millisecond-newer retention; it never deletes public business records. Browser tests exercise actual menus, typed confirmation, changed eligibility, conflict recovery and existing review flows.

Verified on 29 October 2026: 214 API unit/HTTP tests, all 56 admin Chromium tests, the temporary-table PostgreSQL retention test, both production compilations, Prisma schema validation, formatting checks and Git whitespace checks passed. After the final lock-order/menu-listener refinements, the 14 lifecycle tests and all 10 partner-program browser tests passed again. The additive audit timestamp index was applied to the configured database. Manual cleanup removed 3 expired request logs and 0 business audit logs; no real applications were deleted. Deploy the matching API code to enable the hosted cron; no cron environment configuration is required.

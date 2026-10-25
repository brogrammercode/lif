# Admin pending queues and workflow repair

Scope: API V2, Admin V1, User V1. API V1 stays outside this change.

## Delivery checklist

- [x] Inspect existing audit, SMTP, partner submission, ride review and user navigation code.
- [x] Add an authenticated counts-only pending endpoint with shared database cache, bounded visible entity counts and consistent queue definitions.
- [x] Add shared pending badges to primary navigation, secondary navigation, tabs and visible entities; refresh after changes and pause polling when hidden.
- [x] Replace oversized ride review forms with a compact report list and focused review detail, including rider, driver and reporter names.
- [x] Add paginated Rides under each user, selecting booked rides for riders and assigned rides for drivers.
- [x] Hide and reject vehicle verification for non-driver accounts, including direct links.
- [x] Centralize SMTP transport and safe delivery diagnostics; verify configuration without sending test customer messages.
- [x] Queue application lifecycle emails transactionally, deliver after commit, and expose retry/status instead of silently losing failures.
- [x] Repair reproduced final-submit failure paths and blank viewport; preserve drafts, successful uploads and committed submissions.
- [x] Run API compile/unit tests, admin build/browser tests and Flutter analyze/tests. Record remaining deployment/device checks.

## Pending counts contract

`GET /api/v2/admin/pending-counts` requires an active administrator. Optional visible user/application IDs are bounded to 50 in total. The response contains numbers and requested entity IDs only. Brand/model requests, actionable vehicle/application reviews, submitted confirmations, open exit requests and unresolved ride reports contribute once to their queue. Email failures and locked activation attempts are separate attention counts; repeated fields/deliveries must not inflate application navigation totals. Empty optional fields and corrections waiting solely on the applicant are excluded.

Store the aggregate snapshot in PostgreSQL for 30 seconds, protect rebuilding with a transaction lock, invalidate on relevant committed writes, and avoid process-only caches. Poll once per visible admin workspace every 60 seconds; coalesce requests and refresh after mutations. Authentication precedes cache access. Successful automatic count polls are exempt from activity logging; denied/failed requests remain audited.

The cache uses a versioned key so rolling deployments cannot interpret an older payload as the new contract. Rebuilds and invalidation share advisory lock `720091`; invalidation runs after handlers from either app, including handler errors that may follow a commit. It has a short timeout and cannot turn a committed action into a failure; TTL remains the fallback for external/database-only changes and background workers. File staging, GPS updates and chat messages do not invalidate pending queues.

Optional query parameters are `user_ids` and `application_ids`, as comma-separated opaque IDs. They share a total limit of 50. They only request counters for visible entities. Responses include `total`, `sections`, `tabs`, `queues` and `entities`, with numeric counts and the requested entity keys; no account profiles, documents, HTML or file contents. Headers declare contract version and cache TTL. Browser caching is disabled.

Queue rules:

- Catalog: each `REQUESTED` brand or model, including requests temporarily marked inactive.
- Vehicles: `UNDER_REVIEW`, or a rejected vehicle with outstanding pending fields. Owners must be active driver accounts; suspended/deleted accounts and completed partner exits are excluded from this actionable queue.
- Applications: submitted applications, corrections that still have a provided field awaiting admin review, or a failed/stalled email relevant to the current application stage. Empty optional fields are excluded from field counts.
- Confirmations: submitted confirmations, blocked activation attempts, or relevant failed/stalled confirmation/activation email deliveries. Several delivery failures on the same application still count as one confirmation item.
- Exits: requested/reviewing requests and completed exits whose settlement email needs retry.
- Ride reports: requested, disputed and approved reports awaiting resolution/verified settlement.
- Registration emails: failed/stalled new-account alerts, exposed under Admin > Access > Registration emails. These are delivery work items, not extra users.
- No pending workflow is invented for configuration pages. Driver Account remains deferred.

Primary totals sum queue work items, while repeated secondary/tab badges do not add another copy. Field counts are details within an application, not additional applications. Global email failure and activation counters are diagnostic breakdowns and do not get added again to navigation totals. Unknown or unavailable counts do not display as zero; failed refreshes retain and mark the last count.

## Email coverage and operation

Previously, application submission and application approval had no email hook. They only wrote in-app notifications. This change adds a private transactional email outbox alongside the existing signup and PDF delivery queues.

| Event | Email recipient |
| --- | --- |
| New account | Active administrators, deduplicated by normalized email |
| Application submitted/resubmitted | Active administrators and applicant receipt |
| Field correction or requested selfie | Applicant |
| Application approved | Applicant, with the next confirmation step |
| Confirmation submitted | Active administrators |
| Confirmation correction | Applicant |
| Confirmation approved | Applicant, with the existing final PDF attachment |
| Activation email explicitly requested by admin | Applicant, with code and PDF |
| Exit completed | Driver, with settlement PDF |

Queues are saved in the same transaction as the action, then dispatched after commit. Account/partner outbox rows stay outside the mobile notification feed. Recipient access, contact address and workflow stage are checked again before sending. Obsolete lifecycle messages are skipped. SMTP errors are classified without storing raw exchanges or credentials. Existing five-minute conditional claims protect concurrent retries; SMTP acceptance is recorded separately from inbox delivery.

The shared transport uses explicit SMTP options rather than combining an overriding Gmail service preset with a different port. Required deployment variables remain `MAIL_USER` and `GOOGLE_APP_PASSWORD`. Optional variables are `SMTP_HOST` (default `smtp.gmail.com`), `SMTP_PORT` (587), and `SMTP_SECURE` (`false`, using STARTTLS). Put these in the API Vercel project's environment settings. Local `.env` values are not automatically deployed.

Applicant lifecycle messages and retry controls appear in application review. Registration alerts have a compact delivery page under Admin > Access. Existing final PDF, activation and exit email retry controls remain available. `npm run notifications:retry` processes a bounded batch of queued account/partner messages; lists and subsequent actions also schedule retries. No WhatsApp Cloud API was added; manual WhatsApp sharing remains unchanged. Normal in-app ride notifications were not converted into email spam.

## Final submission investigation

The tester reports failure on final Submit. No Android device is attached at the start of this review. Inspect upload requests, authentication refresh, validation, workflow reconstruction, widget lifecycle and post-commit reload separately. Do not describe a device crash as reproduced without evidence. Regression tests must exercise the complete submit-to-review transition and error recovery.

Repairs:

- Validate the full draft, including fields no longer mounted by the scrolling form. Previously, `FormState.validate()` alone missed offscreen fields.
- Validate all uploaded document metadata in one bounded API query instead of one query per field inside the submission transaction. Never fetch document contents during final validation.
- Keep the image/selfie preview slot at a stable height while detaching the decoded image during uploads, including error previews. A test reproduced a scroll position beyond the form's maximum extent when these heights changed.
- Do not restore a long form's old scroll offset into the shorter saved status view. Reset after successful actions and clamp scrolling around submission errors.
- Fence older status requests when saving starts; detach editable widgets before changing their controllers during the post-commit reload.
- On an ambiguous final response, recover only if the server has a newer revision containing the same contacts and answers. Never automatically duplicate the POST.
- A successful submission remains a saved state if its immediate status refresh or local cleanup fails. Corrections use the same safeguard.
- A malformed HTTP success body cannot be mistaken for a submission receipt and discard the draft. The API must confirm the application ID, newer version and submitted status.
- Preserve drafts and uploaded IDs on an expired session, offer sign-in recovery, and show a server request reference for other API failures.
- Bound terminal logging of policy HTML and collections, keeping private media redacted. Megabytes of embedded policy images must not flood the Flutter log buffer after Submit.

The reproduced blank viewport and submission errors are covered by regression tests. A native process termination on the tester's phone remains unverified without a connected device/log. The mobile code must be delivered in an updated APK or a compatible Shorebird patch before the tester can exercise these changes.

## Verification record

Verified on 25 October 2026:

- API V2: `npm run build:compile` and all **189 unit/HTTP tests** passed. Route metadata/security checks include all 182 routes on both supported URI prefixes. Tests cover counts authorization, audit exemption, scoped rider/driver history, driver-only verification, transactional notification queues, safe SMTP failures, stale messages and batched final upload validation.
- PostgreSQL: `npm exec -- tsx --test src/tests/pending_counts.integration.spec.ts` passed. Counts and drill-downs agree across application corrections, confirmations, activation lockouts, failed emails, exits and ride reports; several failed deliveries count once per confirmation. Empty optional values, deleted accounts and stale notices are excluded. Every fixture and cache row lives in a checked connection-local temporary table and is removed automatically. Public business records are not seeded or deleted.
- Admin: production build and all **49 browser tests** passed. Additional viewport assertions confirm the Rides dialog stays inside desktop/mobile viewports. The delivery retry, role-based tab visibility, named review participants, stale decision protection and badges were exercised. Screenshots are in the ignored `.artifacts/admin-ui` folder.
- Flutter: `flutter analyze --no-pub` reports **no issues** and all **88 tests** passed. The successful submission test now checks the saved view starts at the top; the expired-session test checks scroll bounds and retained uploads. Logging tests retain the full response for app logic while bounding terminal output.
- SMTP authentication verified locally without sending a test/customer email. Provider and delivery tests use mocks.
- Both additive migrations were applied to the configured `lif_test` database: pending snapshot storage/indexes and the queued email index. There is no destructive data migration.
- API V1 and private `.env` files were not changed. No APK build, Shorebird publication, external deployment or Git push was performed in this task.

Rollout: deploy API V2 and Admin V1 from these changes, ensure SMTP credentials exist in the API deployment environment, then deliver the mobile Dart changes through a new APK or compatible Shorebird patch. Re-test the tester's exact final-submit flow on the device; a native process termination has not been claimed as reproduced.

## Second audit — 25 October 2026

Additional defects found and repaired:

- Confirmation submission queued the administrator alert with the application's old status. The delivery worker then treated it as obsolete and skipped it. The alert now records the committed confirmation status. The regression fixture now returns immutable read snapshots like Prisma rather than mutating an earlier read result.
- Manual email retries could overwrite a concurrent worker's claim if both updates shared a timestamp. Both retry endpoints now compare the original JSON payload as well as its timestamp. Partner retries also constrain the notification kind, channel, type and title.
- A full email batch containing skipped or failed records stopped queue draining prematurely. Draining now uses fetched batch size, orders by last update to avoid retry starvation, and processes at most three batches per run with a runtime check between batches. SMTP transport creation is lazy and failures remain retryable. Obsolete messages can be skipped even without SMTP credentials. The retry CLI uses the same drain.
- Ordinary navigation links always opened pending-only lists, making existing users or catalog entries appear absent. Ordinary links now open the full list; independent, accessible badge links open pending queues. Pending filters survive account/tab selection, clear conflicting directory filters, and reset correctly when returning to normal tabs. Mobile badge spacing is checked against label bounds.
- Exit request links now follow URL changes, preserve the pending filter when closing a reader, and atomically replace the creation link with the new request link after saving.
- Switching accounts could briefly reuse the prior ride screen or its request error. Ride screens are keyed by account, selected-account errors/loading are scoped to their request, and nested ride data, pagination, dates, fares and currency are validated before rendering.
- Draft restoration previously mutated controllers and file selections during asynchronous reads. Restoration now stages local data and applies it only after checking request ownership and intervening edits, capture or submission. Background readers never delete draft files. A foreground server-confirmed saved state safely retires an obsolete draft.
- Submit now requires successful local recovery-draft persistence before uploads and after each uploaded file. A failed save stops submission with retained selections; sign-in recovery cannot navigate away after a failed draft save. Invalid workflow structures become recoverable load errors instead of widget-build exceptions.

Recheck results:

- API V2 compile and **195 unit/HTTP tests passed**, including confirmation-stage notifications, same-millisecond retry races, bounded queue draining and obsolete mail without SMTP. Formatting checks passed.
- PostgreSQL temporary-table counts/drill-down integration test passed again. No customer fixtures or public table data were changed.
- Admin production build and **52 browser tests passed**, including normal versus pending navigation, filter restoration, malformed ride response recovery, account switching, role gating and mobile badge/reader bounds. The exit creation navigation assertion is also checked in the focused pending/ride suite.
- Flutter analysis reports **no issues** and all **90 tests passed**, including failed recovery-draft persistence and a delayed background restore completing after final submission.
- No private environment files or API V1 code were changed. No customer email, APK build, deployment, Shorebird publication or Git push was performed during this second audit. Native process termination on the tester's phone still requires device reproduction; the verified fixes cover submission and recovery paths in code and widget tests.

## Mobile patch publication — 25 October 2026

At the user's subsequent request, incremented the source version from `0.1.3+3` to `0.1.4+4` and published Android **patch 1 to stable for installed base `0.1.3+3`** (release ID `924062`, patch ID `748007`). Patches keep the installed APK version name/code; `0.1.4+4` remains the next base release version.

The initial build was correctly blocked by Shorebird because a new login icon changed the bundled Material font. Reusing the already bundled refresh icon resolved the difference. The successful patch passed native and asset compatibility checks without bypass flags, used the base release's exact Flutter revision `7dbbfb1fc6`, and covered arm32, arm64 and x86_64. Flutter analysis was clean and all 17 partner submission tests passed after this adjustment. No new base APK was released.

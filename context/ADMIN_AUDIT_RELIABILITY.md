# Administrator audit visibility and reliability

25 October 2026. API changes are confined to `apps/api/v2`; UI changes are in `apps/admin/v1`.

## Investigation

Read-only database inspection confirmed the recent partner application approval already existed in both `user_logs` (the committed business event) and `admin_activity` (a successful HTTP request). The admin page displayed only method/path, mixed background reads with changes, and did not expose the readable action name. Some older request entries also had no completed outcome.

No historical actions were fabricated, deleted or assigned an inferred success/failure. Legacy method/path entries are described when read, without rewriting their stored history. Older entries with no outcome are labeled **Outcome not recorded**.

## Changes

- A central action catalogue describes every current admin route. Route-manifest regression coverage requires descriptions when new protected routes are added. Unknown future admin paths still receive a request audit entry.
- Admin-prefix requests are recorded before body parsing and authorization. Denied requests and invalid payloads are retained, with an unidentified actor unless identity was actually verified.
- Successful handler outcomes are awaited before response serialization. Errors are completed in the shared exception filter. Response-finish handling remains a retry path protected by Vercel `waitUntil`.
- Starts are idempotent by request ID. Concurrent start/finish/close callbacks do not create duplicates. Connection closures use audit status 499; this is an audit marker, not a claim that the server delivered an HTTP 499 response. A later completed handler can replace that marker. Serialization failures replace provisional success rather than being recorded as successful requests.
- A completion-write failure does not turn an already committed business mutation into a retryable response error. The pre-existing attempt remains, finish handling retries, and failure is reported to server logs. Transactional business audit records remain tied to their mutations.
- Approval business events now include safe previous/new status and version values. No submitted identity documents, selfies, activation codes or bank details are added to request logs.
- The admin audit page displays the readable action alongside actor, timestamp, method/path, outcome and request ID. Updated 29 October: All activity is the default view so browsing and private-file reads are visible. Changes/session and reads-only filters remain available. The first page refreshes every 30 seconds while visible and avoids overlapping reads; historical pages use manual refresh. Outcome and text filters are combined, and searches can find historical approvals by readable or canonical action names.
- Request payloads, authorization headers and query strings are excluded from the request audit.

## Expiry / automatic clearing

**Updated 29 October 2026: request and business audit records expire after seven days.** `AdminActivity.started_at` and `UserLog.created_at` determine the cutoff. Audit list reads exclude expired entries; a batched cleanup service physically deletes them on its next pass. Persistent servers run it every 15 minutes, and Vercel has a daily cron calling a public cleanup endpoint, as explicitly requested. Actor relations still use `SET NULL` if an account is physically deleted; normal deactivation does not cascade audit rows.

See [current deletion and retention behavior](ADMIN_ENTITY_ACTIONS_AND_AUDIT_RETENTION.md) for the manual cleanup command and exact timing. No extra cron environment variable is required. Hosting-provider console logs have their own separate retention policy. Verification below records the original 25 October audit reliability work.

## Verification

- API unit/HTTP regressions cover the complete admin route catalogue, real approval HTTP handling, denied and malformed requests, safe payload exclusions, actor attachment, completion races/retries, connection closure, serialization failure, legacy searches and transactional approval snapshots.
- Browser coverage checks readable approval actions, changes/read/all filters, failure/connection-closure outcomes, search, retention copy and mobile containment.
- A read through the compiled audit controller verifies the existing approval can be found using its canonical action name without altering database records.
- All 177 API unit/HTTP tests and 46 admin Chromium tests passed. API compilation, the admin production build, formatting and Git whitespace checks passed. The final audit-page regression also passed after the outcome-label update.
- No migration or database write is needed for this update. Deploy matching API V2 and admin code to apply it to the hosted workspace.

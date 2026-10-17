# Admin and vehicle integration review

Date: 2026-10-16

## Scope

Reviewed the admin React source, browser session lifecycle, category APIs and hierarchy, shared API infrastructure touched by those flows, driver registration/reclassification/selection, quote creation, dispatch, ride acceptance, cancellation, and the corresponding Flutter vehicle screens. Existing map and location work was preserved. This review does not claim every unrelated feature in the repository has been audited.

## Findings and fixes

| Area | Finding | Fix |
| --- | --- | --- |
| Request privacy | Idempotency scope omitted the authenticated account, allowing cached response replay across accounts with the same key. | Scope includes the authenticated user. Regression exercises another account and the original owner. |
| Admin logout | Rotated refresh tokens could outlive logout, and issued browser access tokens had no revocation link. | Added session families, serialized rotation/logout in PostgreSQL, revoked whole families on logout, and validated family activity for new browser access tokens. |
| Session cookies | Refresh reset browser cookie lifetime beyond the session's actual expiry. | Cookie expiry now matches the absolute database session expiry. |
| Logout failures | The server cleared the refresh cookie even if database revocation failed. | Cookie is cleared after successful revocation so the user can retry a failed logout. |
| Browser session races | Login/logout were not coordinated with refresh; another tab could retain its signed-in UI. | One mutation queue and Web Lock cover login/refresh/logout. Session versions reject stale refresh results. BroadcastChannel propagates sign-out without storing tokens. |
| Session retry | A second unauthorized response after refresh left the UI authenticated. | End the local session after the single retry fails authorization. |
| Profile freshness | Refresh returned updated profile data without updating the header. | Session updates notify the auth provider. Avatar fallback resets when its URL changes. |
| Mobile refresh | Rotation was split across transactions, accepted suspended users, and could consume browser refresh tokens. | Atomic claim/revoke/create with audit logging, active-account checks, browser-session exclusion, and preservation of absolute expiry. |
| Request timeouts | Passing an AbortSignal removed the HTTP timeout. | Combine caller cancellation with a timed controller, including response-body reading; release timers/listeners afterward. |
| Catalog races | Overlapping loads could overwrite newer data or complete after unmount. | Cancel superseded loads and ignore results after cancellation/unmount. |
| Save consistency | Saving one row left related parent/child state stale if refresh failed. | Recompute hierarchy, parent names, enabled state, and selectable state locally before refreshing. |
| Duplicate mutations | Multiple submit events or Google callbacks could start duplicate writes/logins. | Synchronous refs guard submissions and sign-in callbacks, in addition to disabled controls. |
| Edit recovery | A conflict message offered no direct recovery inside the editor. | Preserve pending edits until the user deliberately selects Reload latest category. |
| Catalog privacy | Rider/driver catalog exposed admin counts and raw parent records. | Public authenticated catalog omits internal counts and nested parent records. |
| Category consistency | Registration/reclassification/dispatch could race with category configuration changes. | Shared category locks coordinate readers with exclusive configuration writes; per-driver and per-ride locks serialize dependent transitions. |
| Quote freshness | A category could change between reading pricing and persisting its quote. | Read choices after routing and validate category availability, family, and revision before persisting. |
| Booking concurrency | Concurrent requests could select a draft more than once. | Serialize by ride and guard the DRAFT transition; selected quote metadata is included in the returned ride. |
| Payment ownership | A ride could reference another account's payment method. | Validate ownership before requesting the ride. |
| Driver matching | Matching did not check active-vehicle ownership, grouping categories, suspended accounts, or the original quote's advertised seats. | One shared eligibility function enforces owner, physical family, active leaf/ancestor, vehicle approval, and current/historical capacity. |
| Driver assignment | Two simultaneous acceptances could double-book one driver; manual availability changes could bypass busy state. | Serialize by driver, check active rides, and prevent availability or selected-vehicle changes during a trip. |
| Offers | Expired offers appeared in the list; an accepted offer could subsequently be rejected; competing offers stayed open. | Filter expired/non-searching offers, guard rejection, cancel competing offers on acceptance, and cancel remaining offers on ride cancellation. |
| Driver state | Cancellation left assigned drivers busy, and trip start did not update ON_TRIP availability. | Update related driver availability in the same guarded transaction as the ride transition. |
| Registration | The profile was reread outside its uncommitted transaction; duplicate profile creation produced an internal error. | Read through the transaction and serialize/reject duplicate creation with a conflict. |
| Vehicle selection | Registration did not select a first vehicle and no owner selection flow existed. | Select the first vehicle, add an owner-scoped active-vehicle API, and expose approved vehicle selection in Flutter. Approval checks remain mandatory for matching. |
| Flutter dialogs | Duplicate opening/saving was possible, barrier dismissal could hide an in-flight mutation, and seat validation missed category minimums. | Guard actions/submission, require explicit dialog dismissal, check actual category capacity, and render load failures without an uncaught refresh future. |
| Error responses | Malformed JSON and duplicate records were returned as internal errors. | Return structured 400/413/409 responses and request IDs; expected client errors do not log full stacks or submitted JSON. |
| Database helpers | Millisecond IDs collided within batches and transaction typing used `any`. | Use a monotonically increasing millisecond allocator within the process, derive transaction typing from the extended client, and serialize audit JSON explicitly. |
| Accessibility | Dialog descriptions and field hints were not consistently associated; background scrolling remained possible. | Associate descriptions/hints, lock background scrolling, and retain modal keyboard/focus behavior. |
| UI resilience | Toast lifetime did not reset for new messages; long account details could force layout growth; image URLs received referrers. | Reset toast timer, truncate account text, and suppress image referrers. Shared buttons default to type=button. |
| Local preview | Preview omitted the API proxy and Google popup header and used an unauthorized default port. | Preview shares development port/proxy/headers. |
| Module layering | Admin auth performed database operations directly in its service. | Separate the repository, service, and type definitions. |
| Compiler hygiene | The API did not enforce unused declarations and contained 19 unused route imports. | Remove the imports and enable noUnusedLocals/noUnusedParameters across the API. |
| Dependencies | Prisma's config dependency pulled a vulnerable deepmerge-ts release. | Pin its transitive dependency to patched 8.0.0 through an npm override; preserve Prisma 6 compatibility and lockfile. Both npm audits report zero vulnerabilities. |

Dependency reference: [DeepmergeTS advisory GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx). Prisma schema validation and the integration suite exercise configuration loading with the override.

## Second review

The second pass also inspected the mobile HTTP client, shared API authorization, Google account binding, payments, support tickets, reviews, startup configuration, and geocoding responses.

| Area | Additional finding | Fix |
| --- | --- | --- |
| Shared authorization | Account suspension and browser family revocation were checked only on admin routes. | Every protected request now checks the current database account/role and, when present, session family. Admin middleware uses that verified role. Protected responses use no-store. |
| Mobile retry | Retrying through a queued error interceptor could deadlock if the retry also failed. | Use ordinary interceptors with one shared refresh future, preserve the retry's actual error, and clear rejected sessions after the single retry. |
| Mobile account changes | Old requests/refreshes could overwrite a later sign-in or repopulate location data after logout. | Serialize secure-storage mutations, track session versions, reject stale requests/responses, suppress stale refresh results, and clear previous-account location caches at logout/new sign-in. |
| Mobile logout | Automatic refresh could rotate the token after logout had read it; an expired access token prevented server revocation. | Wait for rotation before reading the logout token, share manual/background refresh handling, and authorize mobile revocation by the supplied refresh token. Browser refresh tokens remain excluded from this endpoint. |
| Mobile robustness | Storage exceptions could leave interceptor handlers unresolved; a detached refresh cleanup future could report an unhandled error. | Complete handlers on storage failures and return the future that owns refresh cleanup. Dispose temporary refresh clients. Log-formatting failures cannot fall back to an unredacted body. |
| Identity binding | Mobile login tried to recreate manually provisioned users and concurrent first logins raced. | Resolve identities atomically under identity/email locks, reuse a matching provisioned account, preserve its role, and reject conflicting stable identities. Admin binding shares the email lock. |
| Browser payloads | Type assertions accepted null envelopes, malformed sessions, and invalid catalog rows/hierarchies. | Validate response envelopes, administrator identity fields, category fields, duplicate IDs, and parent references at API boundaries. Invalid responses show a recoverable error. |
| Auth UI state | A late restore failure could overwrite a newer session event. | Version auth-provider work and ignore stale restore results/errors after a session change or unmount. |
| Support ownership | A ticket could attach another user's ride. | Only the rider or assigned driver can attach that ride. |
| Review ownership | A rider could review an arbitrary account using a completed ride. | Restrict the recipient to the assigned driver's user ID. |
| Checkout integrity | Retrying checkout could reset captured/refunded payments, and checkout accepted unfinished rides. | Guard by ride, require completion/final fare, and return existing settled/authorized payments without changing them. |
| Webhooks | Signatures used reconstructed JSON; mismatched references/amounts and backward status transitions could corrupt payment history. | Verify the received body bytes, serialize updates, validate provider/reference/charged amount, preserve the original payment amount, and ignore stale transitions. |
| Payment defaults | Concurrent default-method creation could leave multiple defaults; deletion left none. | Serialize by account and choose a replacement default on deletion. |
| Provider failures | Network errors, invalid JSON, malformed places, and invalid route geometry escaped as internal errors. | Validate upstream payloads, map outages to provider errors, distinguish missing routes/addresses, enforce coordinate/integer bounds, and retain tiny positive routes in the integer response contract. |
| Fare limits | Extreme route/rate combinations could exceed the database's decimal range. | Validate calculated fares before persistence and return a structured fare-limit error. |
| Startup configuration | Invalid durations/origins/ports failed late; production accepted known public example secrets. | Validate at startup and reject public/development JWT/webhook secrets in production. Short database operations use consistent bounded transaction defaults. |
| Regression fixtures | A concurrent test assumed a particular winner, and payment fixtures prevented teardown. | Assert against the actual accepted offer, remove dependent payment/audit records first, and clean failed-run fixtures using their reserved test identities. |

## Verification

- API TypeScript build passed.
- API unused-local/unused-parameter checks passed; 163 API/admin/mobile source and documentation files were checked for empty files, invalid UTF-8, replacement characters, and common encoding corruption, with no problems found. Git whitespace checks passed.
- Admin TypeScript/Vite production build passed.
- Admin formatting check passed.
- Browser regression suite: 16 checks passed, including real Chromium interaction with fixture Google/API responses and malformed/inactive-account cases.
- API unit suite: 15 checks passed for provider response handling and startup configuration; no live provider requests are made.
- HTTP/PostgreSQL integration suite: 8 checks passed for current-role/session revocation, refresh races, idempotency privacy, mobile rotation/suspension, identity binding, payment/ownership rules, hierarchy/conflicts, vehicle selection, quote history/capacity, concurrent booking/acceptance, and cancellation.
- Flutter analysis: no issues. Nine HTTP-client tests exercise retry failures, refresh deduplication, logout/rotation ordering, stale account responses, and location-cache isolation with memory adapters. No APK was built.
- Prisma schema validated and migration `0003_admin_session_families` applied additively. Existing migration `0002_vehicle_categories` remains applied.
- API and admin dependency audits: zero reported vulnerabilities after the override.
- Test fixture account/category counts were verified as zero after cleanup. Environment files, installed dependencies, build output, and browser artifacts remain ignored by Git.

## Practical boundaries

- Live Google sign-in with the user's account still requires the authorized JavaScript origin in Google Cloud; browser tests use an identity fixture.
- Flutter checks include static analysis and HTTP-client tests using memory adapters. Physical-device interaction and vehicle approval operations were not exercised through a running mobile UI.
- Existing mobile access tokens retain the existing JWT expiration policy; the new family revocation check applies to browser access tokens carrying the session-family claim.
- The millisecond ID allocator prevents collisions within one API process. Multiple independent API processes still need a database-coordinated ID strategy before scaling that scheme.
- The in-memory sign-in rate limiter is per API process. Shared deployment-wide limits require deployment infrastructure or a shared store.
- Changes remain in the working tree; no commit or push was requested for this review.

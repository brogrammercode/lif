# Phase C follow-up audit

24 October 2026. Scope: rider booking, matching, active trip, payments, history and recovery in `apps/user/v1` and `apps/api/v2`. Existing API V1 changes were left untouched.

## Issues corrected

1. **Uncertain booking recovery:** a failed status read previously looked like an unsubmitted draft. The review now distinguishes a confirmed draft, an existing booking and an unknown result. Fresh quotes remain blocked after an uncertain submission until the original ride is checked. Missing/foreign IDs or unknown states do not imply successful booking; identical request retries retain their original key and payload.
2. **Disposed booking sheet:** a pending retry/status read could resume after logout/navigation and call `setState` or submit another request. Continuations check whether the sheet remains mounted before writing or rendering.
3. **Route transition race:** a cached or in-flight pickup route could be described as a drop-off estimate after the trip started. Snapshot transitions immediately invalidate mismatched targets, late responses are discarded, and routing retries the current target. Invalid targets, geometry, distance or duration cannot produce a displayed estimate.
4. **Route and GPS age:** ETA freshness now checks the route's own captured location as well as the current driver fix. Expired remaining paths fall back to the booked route. Future-dated fixes and negative accuracy are rejected by API freshness checks; routing also rechecks fix age after the provider responds.
5. **Snapshot consistency:** rider detail requires explicit rider ownership semantics, a matching nested trip ID and consistent known status before displaying actions. A refresh failure labels the last confirmed state without claiming that the trip remains active on the server.
6. **Terminal and form recovery:** expired requests have a clear outcome and can be reconciled; failed history loads do not leave stale errors on a new filter or duplicate retry panels. Returning from booking review restores the available category selection. The Home payment field resets with a fresh draft so a changed payment policy cannot retain a disallowed dropdown value.

## Verification

- API V2: **137/137** isolated unit/HTTP tests pass. New cases reject future GPS/negative accuracy and expiry during routing. Existing rider ownership, privacy, route origin/target, history and rating cases remain passing.
- Flutter: **58/58** tests pass. New cases cover uncertain fresh-options recovery, malformed booking status, disposal during a pending read, in-flight route changes, mismatched trip snapshots and a 320 by 568 viewport across trip stages.
- Flutter analysis: **no issues**. API Nest compile, Prisma validation and Prettier checks pass. No schema push, live customer mutation, APK build, release or push was performed.
- Admin was not changed by this audit. Its Phase C production build and 35 browser tests passed in the implementation turn.

These fixture-based checks do not replace the paired physical-device, native intent and background/location acceptance checks in [the Phase C tracker](PHASE_C_IMPLEMENTATION.md).

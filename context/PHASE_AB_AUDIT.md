# Phase A and B follow-up audit

24 October 2026. Scope: API V2, admin V1 and the shared rider/driver Flutter app. Existing unrelated workspace changes were preserved; API V1 was not edited.

## Findings fixed

| Area | Finding | Correction |
| --- | --- | --- |
| Matching | Taking the nearest eight candidates before checking declined offers or UPI eligibility could starve other eligible drivers. Busy drivers could consume all slots before available drivers. | Select up to eight usable offers after filtering; prioritize available drivers and continue beyond declined/incompatible candidates. Batch approved UPI lookup into one database query for the bounded candidate pool. |
| Acceptance | A fresh offer could outlive the overall search deadline, or a driver could move outside its search radius before accepting. | Recheck search age, current coordinates, GPS freshness/accuracy and current pickup distance while holding assignment locks. A retry of an already accepted assignment remains idempotent. |
| Legacy paths | Dormant repository methods could start a trip without the combined proofs, omit reviewed cancellation policy, and copy estimated measurements into actual trip measurements. | Remove duplicate implementations. Service compatibility methods delegate to the operational flow; driver start requires a valid six-digit code. The older offers endpoint uses the same readiness-filtered dashboard data. |
| Receipts/privacy | The older receipt query included the full driver user/profile and private vehicle record. | Share the public driver/vehicle selection used by rider history. Contact remains scoped to active trip context. |
| Collection state | New direct collection could reset refunded, partially refunded, authorized or pending provider-managed payments. | Protect resolved/provider-managed states, use the selected quote's payment policy consistently and show truthful terminal states without collection buttons in Flutter. |
| Legacy checkout/webhooks | Switching a pending direct UPI payment through the old cash endpoint retained UPI metadata; provider callbacks could change a newly recorded direct payment. | Cash checkout records CASH and clears the UPI recipient. Provider callbacks cannot capture direct CASH/UPI records. Existing paid/resolved checkout retries remain idempotent. |
| Admin review | An obsolete unpaid report could overwrite a payment resolved through another flow. | Recheck the payment state under the review's trip lock before approval, waiver or settlement. An obsolete report can be rejected without changing the payment. |
| No-show/cancellation | Arrival evidence was not scoped to the reporting driver; a cancellation retry without a review could fail after it had committed. | Use the assigned reporting driver's latest arrival evidence. Already cancelled trips return their current outcome. Verify that one no-show creates only one proposed charge. |
| Actual distance | When every recorded GPS segment was rejected as an impossible jump, completion stored zero as though it were a measured trip distance. | Store no actual distance unless at least one segment is usable. The accepted fare remains unchanged. |
| Rider routing | A routing-provider failure silently substituted straight-line distance and a fixed-speed ETA. | Clear route measurements, display an explicit routing error and provide retry. Successful quotes use their server distance/duration. |
| Native map updates | A widget update during an asynchronous render could be dropped or incorrectly marked as already rendered. | Capture each render's values and schedule a follow-up render for updates received while it is running. |
| Location lifecycle | A fresh-fix action could skip an in-flight upload; closed stream state and late errors were not handled consistently; driver-trip GPS errors could be hidden by successful routing. | Wait for an in-flight upload before refreshing, detect stream completion, ignore errors from stopped generations, and show tracking/freshness warnings and permission recovery on the driver trip page. |
| Mobile requests | An action could overlap an older context poll, or its parent refresh could be skipped. | Serialize context reads before actions and wait for an in-flight parent trip read before refreshing the completed action. |
| Chat/lifecycle | A successful send cleared text typed while the send was pending; a notification refresh could call setState after disposal. | Clear only the sent text and guard the notification reload against disposal. |
| Admin response handling | Null/malformed Fare Policy, Support or Ride Review payloads could cause an indefinite loader or render exception. | Decode response shapes before rendering; provide the existing retry state and prevent editing malformed data. Validate saved configuration responses as well. |

## Second pass

The repeated review found and fixed these additional issues:

- Opening a completed trip could stop global tracking for an ongoing trip. Tracking now follows account availability and any active driver assignment, including when a suspended driver is finishing a trip. Tests cover history, approach, ongoing and stopped states.
- Driver detail and action state came from independent reads and could disagree during a transition. The context endpoint now includes a public trip summary and reads its ride, proofs and payment relations using a Repeatable Read transaction. The driver screen consumes that single result, checks driver ownership and omits private rider contact from historical summaries.
- Navigation could skip the next turn during its final ten metres. The turn remains visible until its route boundary is passed.
- Route guidance and optional offers were awaited by the trip refresh, delaying actions when those services were slow. They now refresh independently; offer failures have a separate retry and a route target change triggers the appropriate new route.
- Live location polling downloaded the entire trip history repeatedly. The endpoint now returns the newest 500 points in chronological order, with ownership enforced. This is a live-location tail; authoritative completion telemetry uses its separate query.
- Stale admin reviews could be submitted repeatedly without a reload, and an approval note remained populated for settlement. Conflicted/closed reviews now block further decisions until a successful reload, preserve the unsaved draft, clear old errors after reload, and clear the note after a successful decision. Settlement therefore needs its own note. Fare/Support reloads also clear resolved errors.

## Verification

| Check | Result |
| --- | --- |
| API V2 TypeScript check and unit/HTTP regressions | Passed; 130 tests |
| API V2 Nest compilation, Prisma validation and formatting | Passed |
| Admin TypeScript/Vite production build and formatting | Passed |
| Admin Chromium suite | 35 passed, one worker |
| Flutter analyzer | No issues |
| Flutter tests | 38 passed, concurrency 1 |

The checks cover matching starvation/priority, batched UPI eligibility, offer deadline/radius and retry, both start-proof orders, code locks/expiry, cancellation after current eligibility changes, no-show evidence/one-charge rules, collection versus provider callbacks, stale financial reviews, receipt privacy, invalid telemetry, malformed admin payload recovery and existing onboarding/vehicle/session regressions.

The previous cancellation regression was migrated to the operational service and expanded to test current verification and preserved suspension after acquiring the driver lock. Tests use fake database/services and mocked browser API responses; no live customer fixture or payment is required.

## Release limits

No new dependencies or database schema changes are required by this follow-up. No customer records, fare settings or environment secrets were changed, and no emails/messages were sent. No commit, push, deployment or Shorebird release was performed.

Phase B's new native location permissions still require a new signed base release. Physical-device GPS/background/permission behavior, native MapLibre rendering, real calling/UPI intents and a paired rider/driver trip remain release acceptance checks. Automated checks cannot establish those device outcomes.

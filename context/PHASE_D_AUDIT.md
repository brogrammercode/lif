# Phase D follow-up audit

25 October 2026. Scope: API V2, admin V1 and the shared rider/driver Flutter app. No API V1 changes, APK build, database migration or customer-data mutation was needed for this audit.

## Corrections

1. **Missing receipt totals:** statement totals previously subtracted all payment amounts from all completed fares. An over-recorded payment could therefore conceal a different trip with no receipt. The statement now separately aggregates completed trips with no payment record, using the same owner/date predicate and transaction snapshot.
2. **Provider-managed states:** `REQUIRES_ACTION` was missing from statement buckets and could still offer direct collection in the shared trip controls. It is now reported with the provider/refund-managed original fares. Trip context explicitly states whether direct collection is permitted, including provider ownership of pending payments; the UI also blocks unknown payment states. These values are original fares, not claimed refund amounts.
3. **Unreadable payout details:** one damaged approved destination could previously fail an entire matching batch. Its UPI now becomes unavailable without reviving a retired application destination; other drivers remain usable. Admin reveal/approval and retry paths produce a recoverable domain error, and rejection remains possible. Ciphertext parsing rejects extra segments, malformed encoding and invalid nonce/tag sizes.
4. **KYC masking:** a combined bank-account/IFSC label could expose an account number through the IFSC display branch. Only a valid IFSC value can use that branch; account numbers remain masked and raw application values remain excluded from the account response.
5. **Replacement preview:** choosing a vehicle document previously uploaded it immediately. The flow now shows its name, size and image/PDF preview, then requires explicit submission. Cancelling uploads nothing. Busy-page navigation and mounted checks prevent a late upload result from submitting a renewal or opening a private file after the page has gone away.
6. **Document refresh crash:** the document page returned a Future from a `setState` callback. Refresh after submission/cancellation now updates state synchronously and awaits the load separately. New tests exercise the actual preview/submit/refresh sequence.
7. **Review presentation:** renewed fields now display the replacement filename instead of retaining the old display value. Other review fields and active-trip/version guards remain intact. Fresh account restrictions are applied before independent catalog loading, and payout-change entry is disabled while refreshing.
8. **Admin response validation:** invalid monetary values, counts, versions, dates and transaction identifiers no longer render as valid statement/review data. Recovery remains available; unreadable encrypted details do not disable the rejection path as if they were a stale-version conflict.

## Verification

- API V2: 151/151 unit and HTTP tests passed; Nest compile, Prisma validation and formatting passed.
- Flutter: 66/66 tests passed; flutter analyze reports no issues.
- Admin: 37/37 Chromium tests passed; TypeScript/Vite production build and formatting passed.
- Git whitespace checks passed. No APK, new migration, commit, push or deployment was performed. Existing schema and the previously applied migration 0012 remain unchanged.

Physical-device file pickers/viewers, logout during native preview, real collection/provider reconciliation and paired rider/driver trips still require the acceptance checks in [the Phase D tracker](PHASE_D_IMPLEMENTATION.md). Automated tests use isolated fixtures rather than real transfers or new customer records.

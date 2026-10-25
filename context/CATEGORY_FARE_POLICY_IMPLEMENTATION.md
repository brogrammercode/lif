# Independent vehicle-category fares

25 October 2026. Replaces the former shared vehicle-family pricing model. API changes are confined to V2.

## Contract

Every vehicle category and subcategory owns these three values independently:

| Value | Meaning |
| --- | --- |
| max_profit_km | First distance band charged at the profit rate; not a monetary fare cap |
| profit_fare_per_km | INR/km within that distance band |
| normal_fare_per_km | INR/km after that distance band |

Fare = min(distanceKm, maxProfitKm) * profitRate + max(distanceKm - maxProfitKm, 0) * normalRate. Decimal money rounds once after summing both bands. Existing zero base/time/commission rules remain unchanged. Payment, cancellation/no-show and matching settings remain shared and snapshotted on quotes.

- Different categories of the same physical vehicle type can have different prices.
- Parent and child prices are independent. Grouping parents are never quoted while they have children.
- New categories start unconfigured; explicit zero rates are allowed but never invented as defaults.
- Disabled categories/parents and unpriced leaves are excluded from fresh quotes. Fare configuration remains accessible for disabled/grouping entries.
- Renaming, reordering, changing a parent or adding categories does not change another category's price. The admin list comes from current IDs, without fixed family slots.
- Removing a category removes its own fare fields; no orphan fare row remains. Existing deletion restrictions for referenced categories still apply. Historical snapshot amounts are preserved, while a deleted/disabled category cannot start a fresh booking from an old draft.
- Fare edits/clearing affect new quotes. Existing unexpired quotes retain their snapshotted amount unless their category is unavailable. Trip completion, collection, receipts and driver earnings continue using the accepted fare.

## Delivered checklist

- [x] Store the three nullable fare columns on VehicleCategory, with an all-or-none/nonnegative/range database constraint.
- [x] Migrate existing effective rates without inventing new prices; retain archived group rows for older deployments during rollout.
- [x] Remove family-to-fare selection from runtime code and admin configuration.
- [x] Share one fare editor between category create/update and App > User > Fare Policy.
- [x] Dynamic registry, disabled/subcategory labels, independent previews, unconfigured state and recoverable validation errors.
- [x] Audit and authenticate category and bulk fare writes; serialize with category/quote construction and reject stale category timestamps or deleted IDs.
- [x] Snapshot category ID/update time/rates and shared rule version; preserve accepted trip/payment history.
- [x] Reject a draft whose category was deleted rather than starting a category-less search.
- [x] Run migrations before schema push in the deployment build, update documentation and add regression coverage.

## API shape

Category create/update accepts optional fare_policy containing all three numbers, or null to explicitly leave/mark it unconfigured. Omitting that property on an existing category preserves its fare, supporting existing clients. Legacy base_fare/per_kilometer/per_minute fields remain compatibility data and never price modern quotes.

GET /admin/fare-policy returns shared settings plus a rates registry with category_id, name, parent_name, vehicle_type, active/selectable flags, updated_at and nullable fare_policy. PATCH accepts expected_version for shared settings and a rates array of category_id, expected_updated_at and nullable fare_policy. IDs must be unique; no fixed category count or family-price enum is accepted. Missing rows in a partial update are preserved, never deleted implicitly. Both editors use the same category fields and optimistic update timestamp.

## Migration and rollout

Migration 0013_category_fare_policy runs in a transaction under category/fare locks. It copies the former effective group rate onto each category once, then enforces complete/ranged values. The historical table/enum are retained only for migration history and rollout compatibility; current runtime services do not read or update group rates. New categories do not consult those archived rows.

Applied to the configured lif_test database. Before/after verification confirmed all five category-pricing records retain their previous values. None had a configured legacy rate, so all five remain intentionally unpriced until an administrator enters actual values. No user, vehicle, ride, receipt or payment fixtures were created or altered. PostgreSQL temporary-table tests separately verified a populated backfill, independent same-type edits, unconfigured entries and the database constraint.

Deploy matching API/admin code together. The build runs prisma generate, prisma migrate deploy and then prisma db push before compilation. Do not use schema push alone to bypass the migration backfill. Mobile uses API quote totals already; it has no duplicated family-rate calculation and needs no new native dependency for this change.

## Follow-up audit — 25 October 2026

- [x] Compare category revisions as UTC instants in both save paths. Equivalent ISO values such as `00:00:00Z` and `00:00:00.000Z` no longer cause a false conflict.
- [x] Advance category-editor revisions by at least one millisecond, matching bulk fare edits. Same-millisecond writes and clock skew cannot reuse a revision and hide an edit from stale-write or quote-construction checks.
- [x] Use common fare definitions and response validation in both admin editors. Reject incomplete/extra properties, invalid dates, date-only revisions, out-of-range rates and excess decimal precision before enabling edits; preserve the recoverable reload flow.
- [x] Add API regression coverage for equivalent timestamps, clock skew, preserved omitted fares and stale writes. Add browser regressions for both response boundaries and recovery with a valid response.

This audit made no database changes and did not alter accepted quotes, payments or historical fares. Migration 0013 remains unchanged.

## Verification

Coverage includes arbitrary category counts, duplicate/partial/negative values, independent same-family and subcategory quotes, unpriced exclusion, shared-default version races, stale/deleted category writes, deleted-category booking denial, dynamic admin catalog changes and category-editor pricing without inheritance.

- API V2: 166 unit/HTTP tests passed; Nest compile and formatting passed again during the follow-up audit. Generated Prisma client and schema validation passed during the implementation checks.
- Admin: TypeScript/Vite build and 42 Chromium browser tests passed, including dynamic new/removed categories, two sedan prices, creation/child non-inheritance and both malformed-fare recovery paths.
- Flutter: analyzer clean; all 82 tests passed. Existing mobile screens consume server quote snapshots/totals and require no new native code.
- PostgreSQL: temporary-table migration/constraint tests passed, migration 0013 applied, and before/after category values verified. A read through the compiled configuration service returned all five current categories and shared-default policy version zero successfully.
- No APK, deployment, commit or push. API V1 was not modified. Configure the five unpriced categories with actual values before expecting new ride options.

# Ride and vehicle presentation rework

Date: 25 October 2026. Scope: Admin V1 and additive API V2 response metadata.

## Changes

- Replaced document-reader layouts in Ride Reviews and Users > Rides with a content-sized compact dialog. Removed stretched grid rows and unused ride-reader styles. Kept document/attachment readers unchanged.
- Added shared route, participant, metadata and section components. Use consistent spacing, readable supporting text, subtle dividers, restrained fare emphasis and the existing amber buttons/status badges.
- Review reports show reasons, named participants and vehicle identity; evidence, supporting times, reporter identity and references expand together. The review note, charge approval, waiver, rejection and verified-settlement behavior remain protected by the existing validation and revision checks.
- Ride details show route, status/fare, booking/payment/distance, passenger, driver and vehicle. Historical timing and the trip reference remain accessible in an expandable section.
- Added `VehicleIdentity` with circular, contained 40px logos and consistent name/detail/badge rows. Applied it to rides, reports, verification, category rows and brand/model catalogs; fare headings and previews share its circular avatar primitive.
- Added model/brand/category public logo metadata to the relevant API selects. Model-logo failures fall back to the brand, then category image, then the correct physical-family icon. Brand catalogs use a neutral catalog fallback. No private verification pictures are used as logos.
- Standardized supporting table metadata to 12px/18px. Preserved category hierarchy/group labels, disabled states, catalog review actions and searchable registration selection.

## Verification

Regression coverage includes desktop/mobile dialog bounds, compact reader selection, circular avatars, broken model-to-brand fallback, missing-logo bike fallback, field approvals, stale decisions, fee settlement and category hierarchy after a failed refresh. Screenshots are generated under the ignored Admin `.artifacts/admin-ui` directory.

Passed: API V2 production compile and all **195 unit/HTTP tests**; Admin production build and all **53 browser tests**. Code formatting and Git whitespace checks pass. Desktop and phone screenshots were visually inspected after the final layout adjustments.

No database migration is required. API V1, private environment files and Flutter code are outside this change. No APK build or Shorebird publication is part of this admin rework.

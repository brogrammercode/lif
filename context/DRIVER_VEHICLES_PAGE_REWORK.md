# Driver Vehicles Page Rework

Scope: replace the driver My Vehicles list and add/edit entry points with a compact brand-first solid UI, preserving catalog, verification, active-vehicle and ride-history rules.

## Checklist

- [x] Replace the long vehicle list with a horizontal registered-brand row, selected brand state and trailing Add circle.
- [x] Filter vehicle tiles by the selected brand and show the shared brand logo, vehicle identity, registration, state and menu.
- [x] Reuse a solid bottom action sheet for Edit vehicle and Delete vehicle.
- [x] Add a confirmation before vehicle removal.
- [x] Build Add as catalog brand → model → prefilled registration form.
- [x] Keep the existing edit form and verification uploads; align fields and fixed save action with the profile form scale.
- [x] Add an authenticated, driver-scoped API removal action. It marks the vehicle inactive, retains ride history, clears it as active/offlines the driver when needed, writes an audit event, and rejects removal while a ride is active.
- [x] Update the route manifest and mobile design spec.
- [x] Run Flutter analysis, API compile/format checks and `git diff --check`.
- [ ] Validate the brand selector, edit form, and removal behavior on a signed-in device/account with registered vehicles.

## Removal behavior

“Delete vehicle” is an account-facing removal. The API retains the vehicle record and historical ride associations by setting its state to `INACTIVE`. This keeps trip records intact. The removed vehicle no longer appears in My Vehicles. Removing the currently selected vehicle also clears the driver's active vehicle and sets availability to `OFFLINE`. A server-side active-trip check prevents changing vehicle state during a live ride.

## Verification status

Code and static checks are complete. Device/account validation remains pending because it requires an authenticated driver with catalog choices and registered vehicles.
- [x] Reopen approved/inactive vehicle edits safely: preserve unchanged approved fields, re-review changed fields, block changes during active rides, and take an edited active vehicle offline until review completes.
- [x] Consolidate rider/driver upload presentation into `SolidFileUpload`, use the dashed selection zone and full-bleed selected image with a top-right remove badge, and migrate upload surfaces.
- [x] Restyle Suggest Brand/Model with the shared solid form controls and circular brand/logo identity at the top.
- [x] Re-run Flutter/API static checks after the follow-up editing and shared uploader changes.
- [ ] Validate file preview/remove and vehicle edits on a signed-in device/account with registered vehicles.

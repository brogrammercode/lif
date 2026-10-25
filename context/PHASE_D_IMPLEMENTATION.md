# Phase D: driver operations and account completion

Started 24 October 2026, after pushing Phases A-C as `085a25e`.

## Contracts

- One app, existing design system, API V2 only. Cash and direct driver UPI remain the only collection methods; commission/platform fee are zero. The app does not hold driver money, so there is no fabricated withdrawable wallet or automated payout.
- Earnings and transaction views reconcile accepted completed fares, confirmed direct receipts, waived/provider-resolved payments and separately reviewed charges in one consistent snapshot. Pending fares and unapproved reports are not received earnings. Statements are owner scoped and support date ranges/pagination.
- A driver may request a bank/UPI change. Sensitive values are encrypted; list responses/audits are masked. The old approved destination stays active until admin approval. New destinations never rewrite historical receipts.
- Own rejected catalog requests can be corrected in place with optimistic concurrency and return to REQUESTED; verified/shared entries cannot be edited by a driver. Duplicates remain conflicts for manual resolution.
- Account/document center reuses existing protected partner and vehicle file routes and review feedback. Required vehicle documents remain per vehicle. Expiry restrictions/renewal schedules and legal text are not invented; these remain manually configured/reviewed as previously requested.
- Suspended or exited drivers retain owner-scoped history/account/settlement/help reads. Suspension blocks driving while allowing reviewed corrections; exit blocks new operational writes. Deactivated accounts retain the existing administrator-controlled access policy.

## Tracker

- [x] D1: Driver finance reconciliation, dated earnings and paginated transaction detail; matching admin user view.
- [x] D2: Encrypted reviewed payout changes, validation, conflict/retry protection, admin review and current approved UPI integration.
- [x] D3: Own catalog requests/history/corrections and vehicle/document review maintenance.
- [x] D4: Driver account/document/restriction center, entry links, support/safety/exit recovery and permission actions.
- [x] D5: Consistent admin/mobile screens and regression tests; schema migration/generation, API/admin builds, Flutter analysis/tests and current screen catalog.

Only the pre-Phase-D snapshot has been pushed. Track completion and release acceptance here as implementation proceeds.


## Delivered surfaces

| Surface | Behavior |
| --- | --- |
| Driver account | Account, Payout details, My requests and Safety & help tabs. Shows partner/verification/availability, restrictions, application field reviews, private documents and final agreement. Links to profile, vehicles, finance, support, contacts and exit/settlement. |
| Earnings & transactions | UTC date range up to 93 days; trip and reviewed-charge records; 20-row pagination; original trip detail links; gross fares, confirmed cash/UPI/other receipts, pending/unrecorded fares, waivers, provider-resolved states and separate approved/received/reviewed charges. No fabricated payout balance. Failed refresh retains the checked statement. |
| Reviewed account changes | Account holder, UPI and/or bank account/IFSC. Validates identifiers, uppercases IFSC and preserves leading zeroes. Submission retries freeze values and reuse a UUID. Only one pending request is allowed. Masked history retains the old approved destination until a version-checked admin decision. |
| Vehicle document center | Owner-only vehicle/field review states and reasons, protected file opening, manage/register link and manual replacement of approved documents. Replacement pauses that vehicle until review; active trips block replacement; replaying the same replacement is safe. Other approved fields remain intact. Exited drivers retain a read-only view. |
| Vehicle uploads | Front/back require JPEG/PNG/WebP images. RC, insurance and PUC may also use PDF, up to 3 MB. Images still convert centrally to WebP; PDFs preserve bytes with signature/EOF checks. Existing preview/upload-on-submit flow and draft recovery remain. Admin previews identify PDFs correctly. |
| Own catalog requests | Paginated own brand/model requests with status and rejection reason. Only rejected requests owned by that driver can be corrected in place with expected updated_at. Verified/shared/foreign entries cannot be changed. Logo preview/replacement reuses the suggestion form; no URL-pasting UI. Duplicate conflicts require manual admin resolution. |
| Admin Users > Driver Account | Same authoritative finance statement and date/record filters. Masked destination history, audited on-demand reveal/hide of private values, required review note, versioned approve/reject and explicit stale-review reload. Uses existing page headings, cards, field/editor sections, badges, buttons and pagination. |
| Shared account/help | Settings and driver home expose account/finance entry. Account notices link back to Driver Account. Existing support inbox, contacts, agreements, exit PDF and trip history are reused. Permission actions open the actual app/device location settings. |

## Financial boundaries

This is a reconciliation statement over authoritative completed rides, payment receipts and reviewed obligations in one Repeatable Read snapshot, not a new wallet/provider accounting ledger. Trip ranges use completion date; charge ranges use last review-update date. Pending reports never count as received money. Unpaid-fare reviews are excluded from the separate charge total to avoid counting the same debt twice. Unrecorded receipts and missing final fares are reported separately. Platform commission and payouts are zero under the agreed direct-collection model.

Automated withdrawals, settlement providers, payout batches, expenses/incentives, immutable double-entry accounting, bank ownership verification providers, automatic expiry enforcement and catalog merges are not invented. Legal/language/closure workflows remain the user's next-release decision. Reviewed KYC identity changes and rejoining remain operator-assisted through Support.

## Data and rollout

- New migration: 0012_driver_account, adding encrypted payout-change records, unique per-user retry keys and a database constraint allowing one pending request per user. Applied successfully to the configured lif_test database. No customer fixtures or financial records were created.
- Sensitive payout values use authenticated AES-256-GCM encryption derived from the existing JWT secret; keep that private secret stable. Rotating it requires deliberate re-encryption of existing records, as with other existing encrypted workflows. Lists and audit payloads contain masked summaries; private reveals require administrator rights and are audited. Mobile network logs redact account numbers, UPI and ciphertext.
- Approved changes override the partner-application UPI for new payment selection/matching. Existing payment recipient snapshots are retained. A newly approved bank-only destination does not silently reuse an older UPI.
- Deploy matching API V2 and the new table before the admin/mobile client. API inventory: 177 route definitions; mobile inventory: 23 named routes. No new dependency or native permission was introduced by Phase D; Phase B still requires its new native base.
- Phases A-C were pushed as 085a25e before this work. Phase D remains in the workspace for review; no Phase D commit, deployment or Shorebird release was made.

## Acceptance

Automated checks cover payout validation/encryption/retry/admin-version checks, approved UPI selection, owner-scoped finance/date totals, KYC masking, catalog correction ownership, genuine PDF acceptance, active-trip/stale renewal protection, review preservation, payout-form retries, exited-account reads, finance recovery and admin private reveal/stale review behavior.

Physical-device acceptance remains: PDF/image picker and draft restoration, native file opening, real paired-trip/receipt reconciliation, approved account switch, old receipt destination retention, restricted/exited account recovery, permissions and settlement PDF. Operator bank/UPI ownership verification remains manual.


## Verification results - 24 October 2026

- API V2: 148/148 unit/HTTP tests passed, including route/security metadata parity for all 177 route definitions. Nest compile, generated Prisma client, schema validation and formatting passed.
- Flutter: 62/62 tests passed; analyzer reports no issues. No APK build was used.
- Admin: TypeScript/Vite production build and formatting passed. The existing 35 browser regressions passed; the new driver-account review/private-details/viewport test passed after correcting its user-directory fixture, and passed again against the final page.
- Migration 0012 deployed successfully to the configured development database. No customer fixtures, receipts or balance adjustments were created.
- Git whitespace checks passed. Physical-device/native-file/paired-trip acceptance remains outstanding as listed above. Phase D changes are not pushed.

## Follow-up audit - 25 October 2026

See [Phase D audit](PHASE_D_AUDIT.md) for corrections to statement totals/provider states, payout decryption and masking, document preview/refresh lifecycle and admin response validation. No new migration or data mutation was needed.

Audit verification: 151 API tests, 66 Flutter tests and 37 admin browser tests passed; both builds, schema validation, formatting and Flutter analysis passed. Details and remaining device checks are in the audit report.

## Combined Phases A-D audit - 25 October 2026

The [combined audit](PHASE_ABCD_AUDIT.md) adds driver navigation target validation, immediate route invalidation at trip start, recovery after lost completion responses and isolated GPS startup/upload generations. It records the final cross-phase checks and remaining physical-device acceptance. Phase D and these follow-up changes remain unpushed.

A second combined pass also brought the five older driver maintenance/offer-rejection writes under the shared account lifecycle lock and transaction-level active-account recheck. Six new regressions cover rejection after deactivation/soft deletion and successful eligible-vehicle selection for an active driver.

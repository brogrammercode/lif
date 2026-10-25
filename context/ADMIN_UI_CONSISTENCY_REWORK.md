# Admin UI consistency rework

25 October 2026. Scope: `apps/admin/v1`. Design authority: [WEB_DESIGN.md](WEB_DESIGN.md), the existing shared catalog/editor components, and the user's screenshot examples.

## Completed changes

- [x] Establish a consistent 24px page stack for configuration, account and review panels; remove touching cards and duplicate page-heading margins.
- [x] Group section titles and helper text; remove redundant first-section dividers and improve shared helper-text readability and contrast.
- [x] Rework Fare Policy into independent category cards, consistent three-value field grids, compact revision information and a separate save surface.
- [x] Replace the flat fare preview with category tiles showing estimates, parent identity and configuration/availability states. Validate draft ranges and precision before showing an estimate.
- [x] Rework ride reviews around the common catalog panel. Keep filters and refresh compact, group report facts and evidence, retain review notes/conflict protection, and place empty states/pagination within the results surface.
- [x] Replace the vehicle dropdown block and duplicate identity card with a registration panel containing selection, status and real approval progress. Retain shared per-field review, rejection and private-preview behavior.
- [x] Add a shared reader variant for accepted documents and private attachments: a wider viewport-bounded dialog with persistent header/footer, rich content, explicit download actions, responsive reading space and focus restoration.
- [x] Remove the admin Driver Account tab and page. Redirect old bookmarks to Personal and verify that account/finance/private-payout endpoints are not requested. Retain API/mobile functionality for future work.
- [x] Preserve the existing amber palette, typography, shared fields, buttons, badges, tables, forms, loading/error states and accessible labels.

## Validation

New browser coverage checks desktop/mobile layouts, panel spacing, field approval progress, fare-preview recalculation, zero-result review layout, long document/table scrolling, fixed dialog actions, Escape/focus restoration and deferred-route behavior. Existing tests continue to exercise category creation, stale saves, partner approvals, confirmations, uploads and vehicle reviews.

- TypeScript/Vite production build passed.
- All 45 Chromium browser tests passed with two workers, including the new responsive and deferred-route checks.
- After final label/date alignment and narrow attachment-footer polish, all 13 configuration/review tests and all five vehicle-verification tests passed again. Private attachment actions also remain contained at 320px.
- Formatting and Git whitespace checks passed.
- Desktop (1440px) and mobile (390px) screenshots were inspected for fare cards/previews, empty and populated ride reports, vehicle selection/fields, confirmations and long accepted documents. Private-attachment readers were also checked at 320px. Browser fixtures intentionally block external font delivery; screenshots use the existing system fallback, while production retains Space Grotesk.

Screenshots are local review artifacts under the admin app's ignored `test-results` / `.artifacts` directories. No live administrator/user records were changed. Existing uncommitted mobile release/version documentation was preserved. No APK was built and no code was pushed for this admin UI task.

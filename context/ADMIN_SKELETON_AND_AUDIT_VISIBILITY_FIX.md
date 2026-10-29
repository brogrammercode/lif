# Consistent admin loading and audit visibility

29 October 2026. Admin V1 UI; API V2 read-audit regression coverage. API V1 and Flutter remain outside this change.

## Investigation

The screenshot's retention copy used a bare paragraph with `catalog-note`, while the old typography selector only styled paragraphs nested inside that class. It inherited normal body text size and sat outside the card. It now uses `PanelNote`, the shared compact footer pattern, inside the audit panel. The category guidance uses the same pattern.

Read-only database inspection found 26 GET requests and 2 POST requests in the preceding 20 minutes, including partner requirements, applications, attachment access, vehicle categories and the audit view. Those records were already being written. The audit page defaulted to changes/session events, hiding browsing, and did not refresh itself. No historical events or login actions were invented or backfilled.

## Changes

- Removed the circular spinner from the shared icon registry and every consumer.
- Shared skeleton shapes cover workspace restoration, rows, directories, forms, review details, rich documents, attachment previews, Google sign-in, image selection and busy buttons.
- Preserved button labels/disabled behavior and duplicate-submit protection; skeleton shapes do not contain fake input values.
- Responsive geometry follows the existing rails, white bordered cards, 12px card/8px field corners, muted gray palette and common insets.
- Embedded loading states no longer impose 100dvh of blank space. Reduced-motion preferences and accessible status/busy announcements remain supported.
- Audit defaults to All activity. The first page refreshes every 30 seconds while visible, skips overlapping reads, pauses in hidden tabs and refreshes on returning after the cooldown. Historical pages retain manual refresh and filters remain selected.
- Loaded audit rows remain visible during background refresh. Errors remain explicit and retryable.
- Auditing continues to distinguish actual sign-in from session refresh and page reads. Browsing is not labeled as a new login.

## Verification

Browser regressions cover skeleton bounds at 1440px/390px, reduced motion, absence of spinning loaders, the audit note's 12px type and in-panel placement, read/mutation/outcome filters, visible updates and hidden-tab pause/resume. API regression verifies that an authenticated administrator's GET request outside the admin route prefix is recorded with its actor, readable title and completed status. Existing write-audit and authorization tests remain enforced.

Completed checks: all 68 admin Chromium tests and all 216 API unit/HTTP tests passed. The admin production build, formatting and Git whitespace checks passed. Desktop/mobile screenshots were inspected for the audit panel and shared skeleton layouts. Source inspection found no remaining spinner icon, rotating loader class or old full-viewport loading-state component in Admin V1.

## Follow-up review

The follow-up review found and corrected additional edge cases:

- Audit responses now validate rows, identities, dates, outcomes, unique IDs and pagination before rendering; invalid payloads remain retryable.
- Resource data/errors carry their request path. Rows from a previous filter are not displayed under a newly selected filter.
- Same-query refresh failures retain the last valid rows and show an explicit warning instead of replacing the entire table. The update indicator reflects failure.
- Busy-control shimmer uses an inset position and static icons remain mounted, preserving control width.
- The visible-refresh cooldown follows manual request completion too, avoiding an immediate redundant focus/poll refresh.
- Open audit detail outcomes update from refreshed records. Historical pagination follows a server clamp when expired records reduce the number of pages.

Regressions cover malformed payload recovery, delayed filter responses, stable button dimensions, no overlapping reads, background-error recovery, current detail outcomes and retention-related pagination changes.

Follow-up verification: all 72 admin Chromium tests, the production build, formatting and Git whitespace checks passed. The follow-up changed admin behavior only; API V2 logging and its previously passing 216 tests remain unchanged.

# Partner Program code audit

Date: 2026-10-18

## Corrections

| Problem | Correction |
| --- | --- |
| An optional blank answer could stay rejected while the application advanced. | Both API approval and the admin approval button require all rejections to be resolved. |
| A stored upload could violate field limits changed before submission. | Submission rechecks stored sizes and allowed extensions, while retaining central WebP image normalization. |
| WebP conversion could make an upload larger than its original accepted size. | The final stored bytes must satisfy both the 3 MB transport cap and the configured field cap. |
| Newly configured document requirements could default to an obsolete 5 MB limit. | The API default now matches the 3 MB admin and mobile limit. |
| Concurrent activation could read an old role or overwrite an admin grant. | Activation rereads the role after locking and conditionally promotes only an active RIDER account. Consumed-code retries stay idempotent. |
| Background email failures before SMTP handling could reject without a handler. | The queued job has explicit failure handling and an operator diagnostic. Retry rejects missing applications and applications without an approved final PDF. |
| Mobile corrections could trim or rebuild values already approved. | Approved answers are resubmitted exactly from their saved values. Mobile default text limits match server validation. |
| Checklist inputs in published documents had no mobile renderer; link launch failures could escape the callback. | Mobile documents render read-only checkboxes and recover from unavailable link handlers. |
| Admin configuration could exceed the submission endpoint's 200-field contract. | Serialized configuration writes enforce the same limit when creating/enabling fields or enabling categories. |

## Regression coverage

API checks cover first-login code generation, no-expiry storage, encrypted-code integrity, persistent wrong attempts, lockout, one-time consumption, concurrent role changes, rejected optional answers, upload constraints, final-PDF ownership and release, document sanitization, and field-count limits.

Browser checks cover the shared admin workspace plus document editing, field review, invalid/valid PDF selection, deferred upload, rejection eligibility and desktop/mobile boundaries.

Unit checks use a database substitute. Browser checks intercept API responses. No database fixtures or real delivery messages are created by these checks. Flutter was checked with analyze; no APK build was performed.

The earlier UI corrections and their design references are documented in ADMIN_PARTNER_UI_REVIEW.md and WEB_DESIGN.md.

## Results

- API V2: 66 unit checks passed, including 12 Partner Program regressions.
- Admin: 21 browser checks passed; production build and formatting passed.
- User app: Flutter analysis reported no issues.
- API and admin production dependency audits reported zero known vulnerabilities.

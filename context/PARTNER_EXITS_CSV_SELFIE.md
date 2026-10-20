# Partner exits, catalog CSV import and application selfies

Implemented October 20, 2026. Backend changes are confined to `apps/api/v2`.

## Exit Request & Dues

- Admin: Partner Program → Applications → Exit Request & Dues. Shared panels, toolbar, filters, pagination, forms and confirmation dialogs.
- Drivers can request exit from driver home, read review feedback, resubmit rejected requests and download the final settlement PDF. Admins can also start a request from an activated application's review.
- One exit record per application with optimistic version checks, reason, internal notes, rejection reason, amount, INR currency and balance direction: driver owes, payable to driver, or settled/no dues. Recording dues does not move money.
- Admins select and preview a PDF locally, then explicitly complete the exit. Files upload only on completion. PDF signature, extension, size (3 MB), ownership, request binding and account quota are enforced by the API.
- Completion is final: it marks the application EXITED, suspends driver availability, expires driver verification, cancels pending offers and clears activation secrets. An active ride blocks completion.
- Driver endpoint guards and checks inside driver write locks prevent subsequent operations, including requests already in flight when the exit completes. The account and history remain available; driver status is retained to route returning users to the closed driver home and settlement page.
- The final PDF is released to its owner only after completion. Admin access follows the existing private asset rules.
- Existing SMTP delivery now supports an independent EXIT_EMAIL channel. Completion queues the email; admins can inspect status and retry failed or expired delivery attempts. Existing send leases prevent parallel duplicate jobs.
- Native browser file sharing can send the PDF via installed apps. Unsupported browsers download it and open WhatsApp; the administrator attaches the PDF manually. Sharing can be recorded separately and is not a delivery receipt.
- Exit creation, review, completion, uploads, retries and sharing are audited. No fixtures or external messages were created while implementing this feature.

## Vehicle catalog CSV import

- Separate Import brands CSV / Import models CSV actions on App → User → Vehicle Models.
- Templates, guidelines, drag/drop picker, UTF-8 validation, quoted commas/newlines, header validation, local row preview and field errors before any API request.
- Maximum 100 rows and 1 MB per file. API independently validates each row; the browser submits small sequential batches and shows progress.
- Brands: `name` required; `country`, `description`, `website_url` optional.
- Models: `brand_name`, `name`, `vehicle_type`, `fuel_type`, `seating_capacity` required; `year_from`, `year_to`, `description` optional.
- Import brands first. Models must reference an active verified brand. Seats are 1–8; years are 1900–2050 with a valid range. Supported vehicle/fuel values are listed in the dialog.
- New records are active and verified. Existing normalized brand names / model names within a brand are skipped without overwriting data. Logos use the existing upload editor after import; CSV imports never fetch external images.
- Final created/skipped/failed counts, row messages and downloadable results. Interrupted imports can be retried safely; existing records are skipped. Exported CSV cells are escaped to prevent spreadsheet formula execution.

## Live application selfie

- Per user clarification, this is part of the initial application alongside its documents, not a daily driver task.
- Reserved system requirement `__live_selfie__`, required IMAGE, single file, camera capture mode. Requirements administrators cannot remove this system field.
- Flutter uses the official image_picker camera flow with front camera preference, local preview, retake and Android lost-capture recovery. iOS camera/photo usage descriptions are included. Upload happens on application submission, and images use the central WebP conversion.
- Private assets use purpose APPLICATION_SELFIE; ownership and field binding are checked on submission. Capture source is recorded in the upload contract. Camera-only UI is not biometric liveness or face matching.
- Admin application review includes a private image preview and the existing per-field approval/rejection/reason controls. Rejected selfies must be replaced before resubmitting; approved fields remain unchanged.
- Pending applications created before this feature can add the selfie on resubmission, and administrators can explicitly request it. Approval is blocked until the selfie field has been submitted and approved. Already approved/activated applications keep their prior approval.

## Database and validation

- Additive migration: `apps/api/v2/prisma/migrations/0008_partner_exits/migration.sql`.
- Schema synchronized to the configured development database without a data-loss override. API V1 is unchanged.
- Prisma validation, API production compilation, admin production build, formatting and Flutter analysis are the validation commands used. Automated test suites were not run for this change.
- Camera capture, permission prompts, SMTP delivery and native file sharing still require a real-device / configured-provider exercise; none was simulated as a successful delivery.
- Camera setup reference: https://pub.dev/packages/image_picker.

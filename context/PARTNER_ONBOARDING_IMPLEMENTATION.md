# Partner onboarding delivery

## Implemented flow

1. The rider home avatar opens Settings. The account card uses the signed-in user’s profile; journey, safety, account/help and Partner Program entries use the existing mobile card/tile design.
2. Partner Program displays the published policy. Explicit acceptance opens the categorized dynamic application, including contact email and WhatsApp phone for delivery.
3. Fields are loaded from admin Requirements, including string/text/number/date/boolean and file/image/PDF types, required flags, limits and categories. Selected files preview locally and upload only on submission. Approved values are locked during corrections.
4. Admin reviews individual answers in Partner Program → Applications → Applications. Each rejection requires a reason shown below the corresponding field in the user app. Required/provided answers must be approved before the application can advance.
5. Application approval snapshots the published confirmation. The user reads that version, enters their legal name and explicitly accepts. Confirmations have a separate admin tab and review decision.
6. Confirmation approval requires the complete final PDF uploaded by the administrator. It is preserved exactly, made available privately in-app, queued for SMTP email and made available for manual media sharing from admin. No PDF is fabricated and no WhatsApp Cloud API is used.
7. The user sees the final PDF page and “Sign out and re-login as Driver”. Their first fresh Google login after final approval generates one six-digit activation code. An administrator retrieves it and sends it manually. There is no expiry or regeneration on later logins.
8. Five wrong attempts require an admin unlock of the same code. Correct verification consumes the code, removes its stored hash/encrypted copy, promotes the rider to DRIVER and verifies their driver profile. Existing activated drivers go directly to the blank “Driver home page” after normal login.

## Admin document editor

Requirements → Policy and Confirmation share the same Tiptap editor: headings, font family/size, text/background colors, bold/italic/underline/strike, alignment, bullet/number/check lists, quotes, code blocks, links, tables with row/column/cell controls, image insertion/paste/drop and size controls, horizontal rules and undo/redo.

Images are data URLs only while editing; saving passes them through the central WebP conversion and Cloudinary upload service. Server sanitization strips scripts, event handlers, unsafe schemes and unwanted styles. Clean text/formatting is limited to 500 KB per document, with images stored separately. Preview uses a sandboxed frame. Draft and published versions are separate; publishing does not rewrite existing applicant snapshots. Concurrent editor saves require the current revision.

The current patched sanitizer is bundled into an ESM dependency during `build:dependencies` / `build:compile` / development startup. Nest copies the generated vendor asset to `dist/src/infra/vendor`; the source bundle is ignored by Git. This avoids the sanitizer's CommonJS-to-ESM parser incompatibility in Vercel while retaining current sanitization fixes. Existing test scripts prepare this dependency before compilation; no test suite was run for this task.

## Storage and review guarantees

- Migration: `apps/api/v2/prisma/migrations/0007_partner_onboarding/migration.sql`. It adds tables and a nullable user activation timestamp; it does not erase existing records. Applied to the configured `lif_test` database during implementation.
- Private files live in `partner_assets` as database bytes, with owner, purpose, field, MIME, byte count and SHA-256 metadata. Owner/admin authentication is required for downloads. Final PDF bytes are withheld from the applicant until approved.
- Per-file limit: 3,000,000 bytes to remain below Vercel’s JSON/base64 request/response cap. Images are validated and converted to WebP. Forms support multiple files when configured. Per-user storage is capped at 100 MB and 2,000 assets; identical retried uploads are reused.
- Application and confirmation changes serialize on a per-user database lock and require a matching version. Review decisions cannot silently overwrite another administrator’s work. Approved field values cannot be changed by resubmission.
- Policy, field definitions and confirmation content are snapshotted. Dynamic configuration changes affect new applications without changing prior acceptances.
- UserLog records submissions, reviews, uploads, activation generation/retrieval/unlock/verification and manual sharing. Existing central admin HTTP auditing also covers the new controllers.
- Activation hashes use a random salt with scrypt. Admin-readable code copies use AES-256-GCM with a key derived from the existing signing secret. Keep that secret stable while unconsumed codes need admin retrieval. No code/hash/ciphertext is exposed by ordinary workflow, list or auth responses.
- Driver self-registration cannot promote a new unapproved rider around this flow. Existing driver accounts retain their existing access.

## Email and manual WhatsApp

Gym’s SMTP implementation was inspected. `MAIL_USER` and `GOOGLE_APP_PASSWORD` were copied from Gym’s `.env` directly into the ignored local API V2 `.env`, without printing or committing their values. The Gmail transport uses TLS on port 587 and removes spaces from the app password, matching Gym.

Configure these on the deployed **API V2** project:

```dotenv
MAIL_USER=<Gym SMTP sender>
GOOGLE_APP_PASSWORD=<Gym Gmail application password>
MAIL_FROM_NAME=1More Partner Program
```

Email status is persisted as PENDING / SENDING / SENT / FAILED. Approval registers delivery with Vercel `waitUntil`; an admin can retry failures. SENT means accepted by SMTP, not proof of inbox receipt. Failed configuration or recipient rejection is visible to admin. An interrupted SMTP send can have an uncertain outcome; review before retrying to avoid duplicate mail.

“Share PDF / WhatsApp” opens the browser/device file share sheet when supported. Otherwise it downloads the PDF and opens WhatsApp with the applicant’s phone number and a message; the operator attaches the downloaded PDF manually. “Record as manually shared” records the operator’s action, not a WhatsApp delivery receipt. Neither sharing nor SMTP was exercised against real recipients during implementation.

## API inventory

Both the V2 URL and the server’s existing V1 compatibility prefix expose these V2 controllers. No API V1 source was changed.

| Method | Path below `/api/v2` | Purpose |
| --- | --- | --- |
| GET | `/partner-program/me` | Published/snapshotted documents, fields, review and activation state |
| POST | `/partner-program/applications` | Submit application or rejected-field corrections |
| POST | `/partner-program/confirmations` | Named confirmation acceptance |
| POST | `/partner-program/assets` | Private requirement upload |
| GET | `/partner-program/assets/:id` | Authorized private file download data |
| POST | `/partner-program/activate` | One-time driver activation |
| GET/PATCH | `/admin/partner-program/documents/:kind` | Draft/publish POLICY or CONFIRMATION |
| GET | `/admin/partner-program/applications` | Search, status filter, section and pagination |
| GET | `/admin/partner-program/applications/:id` | Full review details |
| PATCH | `/admin/partner-program/applications/:id/fields/:fieldId` | Approve/reject one answer |
| POST | `/admin/partner-program/applications/:id/approve` | Approve reviewed application |
| POST | `/admin/partner-program/applications/:id/confirmation-review` | Review confirmation and release final PDF |
| POST | `/admin/partner-program/assets` | Upload final PDF for a selected application |
| POST | `/admin/partner-program/applications/:id/email-retry` | Queue SMTP retry |
| POST | `/admin/partner-program/applications/:id/shared` | Record manual sharing |
| POST | `/admin/partner-program/applications/:id/activation-code` | Audited administrator code retrieval |
| POST | `/admin/partner-program/applications/:id/activation-unlock` | Reset failed attempts without replacing the code |

## Operator setup

1. Apply the migration and regenerate the Prisma client when installing the update. Restart the API so it uses the new client. The existing Vercel build still generates and pushes the schema.
2. Configure SMTP values on Vercel; local `.env` values are not uploaded there.
3. Publish Policy and Confirmation and configure Details/Documents before inviting applicants.
4. Review field corrections, approve the application, then review confirmation and upload the final PDF before final approval.
5. Refresh email status; share the PDF manually through the admin controls. Retrieve the activation code after the applicant’s fresh login and send it manually.

## Checks and limits

API/admin TypeScript compilation, Prisma validation, formatting, route metadata inventory and Flutter analysis are the implementation checks. No APK builds or automated test suites were run. Existing route-inventory expectations were updated for the added controllers. Live Google login, real-recipient SMTP delivery, OS share targets and device file viewers still require checks in the deployed environment. The driver UI is deliberately the requested blank placeholder.

The running local API locked Prisma's Windows engine DLL during generation. Generated client source/types were updated, and the installed engine was verified byte-identical to the generator engine before retaining it and synchronizing schema metadata. Restart the local API after this update; ordinary Prisma generation on a stopped process or Linux deployment replaces that file normally.

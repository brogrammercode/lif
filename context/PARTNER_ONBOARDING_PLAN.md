# Partner onboarding implementation

## Scope and decisions

- API changes are confined to `apps/api/v2`. User UI uses existing Flutter green cards, spacing and components; admin uses the shared amber design system in `context/WEB_DESIGN.md`.
- Home avatar opens Settings, with an account profile card, account/travel/safety/help sections and Partner Program.
- Partner onboarding is a persisted state machine: policy acceptance → submitted application → field review/corrections → application approval → confirmation submission/review → final PDF → fresh Google login → one-time activation → driver home placeholder.
- Admin Requirements tabs: Details, Documents, Policy, Confirmation. Applications secondary navigation: Applications and Confirmations tabs.
- Rich document editor supports formatting, headings, colors, alignment, lists, tables, links, inline images, undo/redo, draft saving, publishing and preview. Public documents use sanitized HTML. Images are previewed locally and uploaded on save through the central WebP pipeline.
- Each submission snapshots published policy, requirements and confirmation content. Subsequent admin edits cannot silently change what an applicant accepted.
- Each submitted field has a review status and a rejection reason. Approval requires every required answer to be approved; rejected answers can be corrected and resubmitted while approved answers remain intact.
- Applicants submit a named confirmation and explicit acceptance. Admin approval requires the final PDF provided by the administrator. The final PDF is available in-app, queued for SMTP email, and available for manual WhatsApp/media sharing from admin.
- Application documents and final PDFs are stored as private database assets, not public Cloudinary images. Access requires the owner or an active administrator. Individual uploads are bounded below Vercel's request cap; images use central WebP conversion.
- The first fresh Google login after final approval generates one activation code with no expiry. Admins can retrieve it for manual sending. A salted verification hash and an encrypted admin-readable copy are stored; both are erased after atomic consumption. Five incorrect attempts require an admin unlock of the same code. Only successful activation promotes a rider to driver; subsequent logins go directly to driver home.
- Email uses Gym's Gmail SMTP transport pattern and copied local MAIL_USER / GOOGLE_APP_PASSWORD credentials. WhatsApp is entirely manual via browser file sharing, with download + wa.me fallback and a separately recorded manual-share status. No WhatsApp Cloud API is used. No real messages are sent as part of development.

## Phases, tasks and subtasks

### 1. Data and API foundation

- [x] Add additive schema/migration: documents, applications, answers, confirmations, private assets, activation and delivery records.
- [x] Add document sanitization, publication/version checks and image cleanup on save failure.
- [x] Add authenticated workflow, uploads, validation and submission endpoints.
- [x] Add admin application/field/confirmation review endpoints with transactional state checks and audit entries.
- [x] Add final PDF approval, private downloads, notification and delivery queue/retry support.
- [x] Add first-login activation code generation, no expiry, encrypted admin retrieval, attempt limits/unlock, one-time consumption and driver promotion.

### 2. Admin workspace

- [x] Extend existing secondary navigation and tabs.
- [x] Add shared rich editor and document preview/publish forms.
- [x] Add searchable/paginated application and confirmation lists with review details.
- [x] Show field rejection reasons, document downloads, final PDF upload/preview, SMTP state/retries, manual WhatsApp sharing and activation-code retrieval/unlock.

### 3. User application

- [x] Replace avatar drawer action with Settings and profile card.
- [x] Add partner workflow repository, models and routed screens.
- [x] Render published policy and confirmation rich content.
- [x] Render dynamic categorized typed fields, file picking and local previews, validation and per-field review feedback.
- [x] Add submission/confirmation states, refresh behavior, private PDF download and sign-out/re-login action.
- [x] Route completed applicants to activation after fresh login and activated drivers to the driver-home placeholder.

### 4. Integration and completion

- [x] Format, compile/type-check API/admin, validate Prisma, and run Flutter analyze; resolve errors/warnings without APK builds.
- [x] Review ownership checks, stale-review handling, retries, file limits, published snapshots and navigation.
- [x] Document routes, provider settings, migration, operator steps and any deployment prerequisites.

## Delivery prerequisites

SMTP values were copied from Gym into the ignored local API V2 .env file without printing them. Configure MAIL_USER, GOOGLE_APP_PASSWORD and MAIL_FROM_NAME in the deployed API environment. Unconfigured email remains FAILED with a visible reason and an explicit admin retry; it never claims delivery. Manual WhatsApp sharing requires an operator and a browser/device share target or WhatsApp Web. The uploaded final PDF is the administrator's approved document; the system preserves and delivers those exact bytes.

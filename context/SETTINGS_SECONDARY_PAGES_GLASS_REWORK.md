# Settings secondary pages — liquid-glass rework

Updated: 31 October 2026

## Scope

This pass reworks the authenticated mobile Settings destinations without changing their API ownership or business behavior:

- Notifications
- Emergency contacts, including add, update, call and remove
- Help and support, including configured contact channels, request creation and request conversations
- Payment methods

The canonical visual authority remains `context/MOBILE_DESIGN.md`. These screens use the same Outfit typography, pastel ambient canvas, bounded blur, reflective glass rims, calm spacing and dark primary actions as Settings. They do not introduce bottom navigation.

## Completed implementation

### Shared composition

- [x] Added reusable Settings intro, section header, semantic status pill, empty card and destination-shaped list skeleton components.
- [x] Replaced full-page circular progress indicators with matching glass skeleton layouts.
- [x] Retained loaded records during recoverable same-screen refreshes and protected current data from stale asynchronous responses.
- [x] Added explicit initial error/retry, pull-to-refresh, empty, disabled and busy treatments.
- [x] Kept narrow screens and large text scrollable; controls can wrap rather than shrinking important labels.

### Notifications

- [x] Added a real unread summary and glass All/Unread filters using the existing bounded list.
- [x] Added readable type labels and semantic icons/colors for ride, account, payment, safety, promotion and system updates.
- [x] Preserved notification read persistence and existing ride, driver-account and support-request target navigation.
- [x] Kept notification title/body/time visible; no mock notification preference or push-delivery controls were invented.

### Emergency contacts

- [x] Added a purpose/safety introduction and actual contact count.
- [x] Replaced the sparse native dialog with a scrollable glass form for full name, E.164 phone and optional relationship.
- [x] Added client validation matching the API's `+` and 8–15 digit contract while retaining server validation.
- [x] Added a contact action sheet for phone call, edit and remove.
- [x] Added explicit destructive confirmation and retained the API's current-user ownership checks.
- [x] Clarified that saved contacts are not automatically called and do not replace emergency services.

### Help and support

- [x] Separated configured direct-support channels from persistent support requests.
- [x] Made hours, instructions, phone, emergency phone, manual WhatsApp and email legible without fabricating missing channels.
- [x] Added compact request cards with subject, short supporting reference, message count, last message, status, priority and update time.
- [x] Added a glass request form with subject, priority and message validation; the same idempotency key is retained while retrying that open form.
- [x] Reworked request details into a clear header plus aligned You/1More Support conversation bubbles and stable reply composer.
- [x] Resolved/closed requests explain that replying asks the team to review again, matching the API's current reopen-on-message behavior.
- [x] Kept request attachments, real-time delivery/read receipts and automatic emergency dispatch out of scope because the current contracts do not implement them.

### Payment methods

- [x] Explained the accepted launch policy: direct cash or driver UPI, zero commission/platform fee, and driver confirmation of receipt.
- [x] Distinguished globally saved methods from per-ride Direct UPI availability and future provider-managed card/wallet collection.
- [x] Prevented the client from offering another Cash setup when one is already returned.
- [x] Kept existing provider-backed method presentation safe: brand/last four, UPI handle or wallet provider only; provider tokens are never shown.
- [x] Added confirmation before Cash creation and method removal; existing ride/payment history is described as retained.
- [x] Did not treat opening a UPI app as proof of payment and did not add card/UPI credential collection.

## Verification

- [x] Dedicated widget coverage for notifications, emergency contact create/update, support list/conversation/reply, cash setup and small-screen/large-text layouts.
- [x] Existing Settings and Phase C regression tests.
- [ ] Real-device visual pass for keyboard resizing, telephone/mail/WhatsApp handoff and reduced-motion/high-contrast behavior.

No API schema, native configuration, package version, app version or release artifact is changed by this UI pass.

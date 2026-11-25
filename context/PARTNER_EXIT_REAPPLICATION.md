# Partner exit and reapplication

- [x] Completing an exit restores the Driver account to Rider and clears the driving activation marker. Staff accounts retain their staff role. Driver suspension, pending offer cancellation, PDF release, and the active trip safeguard remain part of exit completion.
- [x] Opening the app again uses the same login and Rider Home. An open Driver Home returns through the session gate when it detects the completed exit.
- [x] Rider Profile links to past driver rides and settlements. Each completed exit keeps its own settlement PDF and partner agreement, with owner and administrator access enforced by the API.
- [x] Become our Driving Partner opens the current policy and application requirements. Compatible previously approved scalar answers and prior contact details are editable. Uploads and the live selfie are fresh, and the new application goes through review, confirmation and one-time activation.
- [x] Keep one current application per account and retain older applications by ID. Scope application uploads and deletion to one application. Fresh approval restores the returning driver to offline status so they can choose when to go online, subject to the vehicle checks.
- [x] Add a migration for existing data. It assigns prior uploads to their original application and restores Rider access for already completed exits, including accounts whose exit preceded this release.
- [x] Verify Prisma validation, API compilation, Flutter analysis, and focused regressions for the exit transition, reapplication, fresh selfie, reactivation, and historical downloads.
- [x] Apply the reapplication migration to the configured test database. Verify the repaired Rider account retains its completed exit and settlement, and that the updated API loads a fresh application with editable prefill and a required selfie.
- [ ] Roll out the updated API and Flutter app. Apply the migration to the release database as part of that rollout.
- [ ] Verify the round trip with a seeded returning driver on a device, including selecting an eligible vehicle after reactivation.

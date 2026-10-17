# Admin expansion

Backend implementation is V2 only. Existing V1 changes belong to earlier work and will not be edited.

1. Replace profile-timestamp access conflicts with an access-specific version. Preserve self-removal/last-admin protections.
2. Add last login timestamps and centralized administrator request auditing, alongside existing transactional business audit records. Show activity and login information in Admin.
3. Deactivate users with confirmation, invalidate access/devices and preserve history. Block deactivation during an active ride. Protect self/last admin.
4. Inventory and permanently clean only strict, reserved-domain integration fixtures, preserving harshsharma55115@gmail.com and refusing to remove another person's related history.
5. Add App / User / Vehicle Models: brands and models, logos selected locally and uploaded on save, searchable moderation states, edits, active states and requester/reviewer metadata. Driver proposal endpoints always create REQUESTED records; approved catalogs support the future registration UI.
6. Add Partner program / Requirements / Details and Documents. One field entity, type-derived tabs, categories, ordering, required/active settings and validation. Manage categories before assigning fields.
7. Apply the V2 additive migration, generate Prisma client, check TypeScript/build/format/schema, update design/usage docs. Do not run or add tests for this feature request unless requested.

User confirmed deactivation and retained history for normal accounts. Cleanup is restricted to identified synthetic test fixtures. The future driver registration UI is not requested in this turn; its authenticated catalog/proposal APIs are included.

## Delivery

Implemented steps 1–7. Inventory found only the protected owner account and no remaining fixtures, so no account deletion was performed. Migrations 0005 and 0006 were deployed. See [ADMIN_EXPANSION_IMPLEMENTATION.md](./ADMIN_EXPANSION_IMPLEMENTATION.md) for routes, safeguards, UI behavior and check limits.

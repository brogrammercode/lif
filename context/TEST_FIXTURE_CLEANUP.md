# Test fixture cleanup inventory — 2026-10-17

Read-only inventory of the configured V2 database found:

- Total users: **1**.
- Strict integration fixture matches: **0** (`admin-integration-<UUID>-…@example.test` and `access-identity-<UUID>-…@example.test`).
- Preserved account: `harshsharma55115@gmail.com`, ID `1791301496552`, role ADMIN, status ACTIVE.
- Reported removal target `1792224260697`: not present.

No deletion was necessary or performed. Previous integration-suite teardown had removed its fixtures. Stale directory results are refreshed on returning to the admin tab, and removal of a missing account is idempotent. No production history or account was removed.

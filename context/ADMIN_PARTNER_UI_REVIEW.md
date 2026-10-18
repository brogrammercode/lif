# Admin Partner Program UI review

## Changes

- Applications and Confirmations use the existing CatalogPanel, ManagementToolbar, FilterSelect, TableLoading and ManagementPagination components. Search, table cells, status filters and pagination match Requirements and Vehicle Categories.
- Policy and Confirmation editors use shared panels, fields, badges and Toast feedback. Undefined panel/input/notice classes were removed. Failed loads show a retry state and block save/publish.
- Review cards use the shared catalog panel geometry, 24px spacing and 24px/16px desktop/mobile padding. Approval stays disabled until every required or provided answer is approved. Rejection reasons remain visible next to their fields.
- Final PDF selection uses the shared upload presentation, local preview, remove/replace actions and keyboard browsing. File signatures, names and sizes are validated; files without a browser MIME type are normalized after validation. Upload still occurs only after approval confirmation.
- The editor and sandboxed preview share document-content.css and workspace theme variables. Catalog table styles no longer force document tables to a large minimum width or uppercase their headers.
- Mobile formatting controls scroll horizontally. Toolbar controls use shared amber states and 8px corners. React key warnings were fixed; Undo/Redo reflect command availability.
- Enabling/disabling the editor no longer emits a document update or marks a clean draft as edited.
- Only the selected secondary navigation item has amber emphasis. The skip link becomes visible on keyboard focus.
- PDF sharing preload failures expose retry controls. Expired email send leases can be retried; approval errors remain visible in the confirmation dialog. Clipboard failures are handled inside the activation dialog.
- The application list and review component are separate files with accurate summary/detail types.

## Checks

- API V2: all 54 existing unit checks passed, including route/security metadata and media conversion checks.
- User Flutter app: flutter analyze reported no issues. No APK was built.
- Admin: production compilation and formatting passed. All 20 browser regression checks passed, covering the shared workspace and the new partner screens, including sign-in, refresh, cross-tab sign-out, edits and responsive layouts.
- New browser coverage: draft/publish/preview, failed-load recovery, field review and rejection reasons, approval eligibility, local PDF selection with delayed upload, and bounded layouts at 1440px and 390px.
- Browser scenarios use intercepted API responses. They do not create database accounts or send email/WhatsApp messages. Real provider delivery and physical device behavior were not exercised.

The design authority remains WEB_DESIGN.md and the shared components in apps/admin/v1/src/components.

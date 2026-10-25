# 1More Admin web design system

## Design authority and extraction sources

The user requested Gym Flutter's visual design, translated to a desktop admin workspace. This document is the reusable component specification for every component introduced in `apps/admin/v1`.

Read from `C:/F0526/Quest/gym`:

| Source | Extracted behavior |
| --- | --- |
| `apps/mobile/lib/core/theme/app_colors.dart` | Amber-brown brand, deep-brown emphasis, pale gray canvas, semantic colors. |
| `apps/mobile/lib/core/theme/app_typography.dart` | Space Grotesk; regular body, semibold headings/labels; no second font. |
| `apps/mobile/lib/core/theme/app_theme.dart` | Material 3 restraint, white zero-elevation cards, 12px card radius, 8px input/button radius, 1px gray borders, 54px main buttons. |
| `apps/mobile/lib/core/widgets/dailio_tab_strip.dart` | 44px horizontal tabs, amber active text and 2px underline; neutral inactive text; horizontal overflow. |
| `apps/mobile/lib/core/widgets/dailio_picker_field.dart` | White bounded fields, trailing chevron, clear selected state; 18px sheet corners, divided 48px options. |
| `apps/web/src/styles/globals.css` | Exact web counterparts for buttons, fields, cards, focus, status badges, dialogs, auth rings, loading spinner. |
| `apps/web/tailwind.config.ts` | `brand`, `brand.dark`, `brand.soft`, `canvas`, `ink`, `line`, and restrained shadow tokens. |
| `apps/web/src/modules/auth/AuthPage.tsx` | Dark Google sign-in page, large uppercase heading, copper orbit outlines, white rounded Google button. |
| `apps/web/src/components/layout/AppShell.tsx` | Simple brand header, circular icon controls, account identity and explicit sign-out. |

The desktop primary/secondary navigation, wide tables, stats grid, editor dialog, pagination, and hierarchy rows are adaptations of those primitives. Gym's mobile app does not contain a desktop two-sidebar layout; these adaptations are documented instead of claiming nonexistent source designs. Keep 1More branding and ride terminology.

## Foundations

### Configuration and review layout update — 25 October 2026

Use the same amber, Space Grotesk, white bordered surfaces and 12px card corners across the workspace. Configuration and review pages use a centered 1100px content column with a 24px gap between independent panels. Page headings do not add a second bottom margin inside this stack. Catalog pages retain their wider table layout.

- Shared `EditorSection` groups its title, step and supporting copy in one header. Standalone configuration sections use its `card` option; embedded form sections use one separator between groups rather than a line above every title. Helper copy is 12px/18px and uses the muted text token.
- Fare configuration uses independent category cards, a compact shared-settings revision strip, a separate save-action surface and a shared `CatalogPanel` for previews. Preview tiles distinguish a numeric estimate, an unconfigured fare and invalid draft values. Physical-family icons are compatibility cues, never pricing groups.
- Ride reviews use one `CatalogPanel` containing the status filter, compact refresh control, guidance, report entries and result pagination. Put empty/loading/error states inside that panel. Hide pagination when there are no results. Reports group route, reasons, timestamps, participants, expandable evidence and decision controls.
- Vehicle verification starts with a `CatalogPanel` containing the selected registration, its review status and a real field-approval progress indicator. Reuse `ApplicationFieldsReview` for details and documents; do not add another duplicate identity/status card.
- Accepted policies/confirmations and private attachments use the shared `Dialog` reader variant: 960px maximum width, bounded viewport height, fixed header/footer and one scrolling reading area. Keep download actions explicit. Preserve rich document content and sandboxing; no automatic download on preview. Closing any dialog returns keyboard focus to the opener when it is still mounted.
- The admin **Driver Account** tab and page are deferred. Users exposes **Personal** and **Vehicle Verification**. Existing `/users/:userId/driver-account` bookmarks redirect to that user's Personal page and do not fetch driver-finance/private-payout data. Backend and mobile account capabilities are outside this UI deferral.

See [the UI rework record](ADMIN_UI_CONSISTENCY_REWORK.md) for scope and verification.

### Colors

| Token | Value | Use |
| --- | --- | --- |
| brand | `#B45309` | Primary buttons, selected tabs/navigation, links and focus. |
| brand-dark | `#3D1F00` | Strong brand text, button hover, auth emphasis. |
| brand-soft | `#FFF1E6` | Selected rows, icon tiles, amber badges. |
| canvas | `#F0F2F5` | Application backdrop. |
| surface | `#FFFFFF` | Panels, dialogs, fields, navigation. |
| ink | `#1A1A1A` | Primary text. |
| muted | `#6B6B6B` | Secondary text and inactive tabs. |
| subtle | `#8A8A8A` | Placeholders and small supporting copy. |
| line | `#E5E7EB` | Input/card borders and table dividers. |
| success | `#22C55E` | Enabled status with a text label. |
| error | `#DC2626` | Errors and destructive actions. |
| warning | `#F59E0B` | Attention notices. |
| info | `#3B82F6` | Informational state. |
| auth-canvas | `#080C10` | Google login background. |

Use semantic labels/icons alongside status colors. White cards have a border rather than a strong shadow. Do not substitute 1More mobile's green for Gym's amber; the user explicitly chose Gym Flutter styling for admin.

### Typography

Space Grotesk weights 400, 500, 600, 700. Fallback: system sans-serif.

| Role | Size / line height | Weight |
| --- | --- | --- |
| Login headline | Responsive 40–64px / 1.02 | 600 |
| Page heading | 28px / 36px | 600 |
| Section/dialog title | 22px / 30px | 600 |
| Statistic value | 28px / 34px | 600 |
| Card title | 16px / 24px | 600 |
| Body/table data | 14px / 22px | 400 or 500 |
| Field/button label | 14px / 20px | 600 |
| Breadcrumb/help | 12px / 18px | 400 or 500 |
| Eyebrow/table header | 11px / 16px | 600, uppercase, 0.08em tracking |

### Spacing, geometry and motion

Use a 4px spacing grid: 4, 8, 12, 16, 20, 24, 32, 40, 48. Desktop content padding 32px; narrow screens 16px. Fields/buttons 8px corners, cards 12px, dialogs 18px, circular icon buttons 999px. Borders 1px. Focus ring 3px amber at 35% opacity with 2px offset. Hover/focus transitions 140–180ms. Honor reduced-motion preferences. Avoid layout movement when loading completes.

## Component inventory and specifications

### Brand

Use the existing One More logo (`apps/admin/v1/public/logo.png`) and **1More Admin** wordmark/copy. Reuse the logo in navigation and login; do not use letter monograms. Do not display Gym/Dailio name or assets. Brand link returns to the category page. The browser title, login heading, footer, sign-out copy, and admin error messages use 1More Admin consistently.

### Primary left navigation

Desktop rail 88px, white, right 1px border, full viewport height. Brand at top; primary items **App** and **Users**, icon tiles with labels beneath/alongside and 8px between items. Active item uses brand-soft with amber text and `aria-current`; inactive items use muted text. Account avatar and sign-out sit at the bottom. On narrow screens the items form an accessible horizontal navigation; keep routes addressable.

### Secondary navigation

Desktop width 260px (224px at the intermediate desktop breakpoint), white with right border. In App, show header **App**, small explanatory label, and one **User** navigation entry. In Users, show header **Users** and the searchable account directory described below. Selected state is a rounded 8px pale amber row with semibold label. Selecting items preserves the shell. On small screens the Users directory remains accessible above the details.

### Workspace header and breadcrumbs

White header with bottom border, minimum 72px. Breadcrumb **App / User** and current page identity. Show signed-in admin name/email without wrapping into content. Header actions are 40px round transparent icon buttons. Display logout as an actual action; confirm before ending the session. Login-required redirect retains only safe local destinations.

### Horizontal page tabs

Tab list directly below the workspace header, white, 44px tall. **Vehicle Categories** selected. Exact Gym tab treatment: 12px semibold/700 active amber, 2px bottom underline, gray 500 inactive text, 8px horizontal inner padding and 4px tab gap. Allow horizontal scroll. Use navigation links with current-page semantics; do not add decorative, nonfunctional tabs.

### Page heading and action row

Heading **Vehicle categories**, short explanatory copy about rider visibility and driver registration. Primary **Add category** button on the right; stack on narrow viewports. Button has plus icon and text. The description explains category/subcategory relationships in user terms, without exposing database names.

### Statistics tiles

Four white bordered 12px cards: total categories, enabled choices, subcategories, registered vehicles. Each contains a small amber icon tile, muted label and 28px value. All values derive from fetched records; skeletons appear while loading. Grid 4 columns desktop, 2 tablet, 1 narrow phone. No invented sample counts.

### Catalog toolbar

White card toolbar containing search input, status filter (All/Enabled/Disabled), and refresh button. Search is labeled accessibly, leading search icon, minimum height 44px, clear placeholder. Controls wrap; search expands into available space. Filtering updates actual rows and result count. Refresh provides loading feedback and retains filters.

### Category table and hierarchy

White bordered 12px panel, horizontal overflow within the panel rather than the page. Column header 11px uppercase muted text on a very light background. Data rows minimum 76px with 16px horizontal inset and 1px separators. Columns: category, vehicle family, capacity, base fare, per-km fare, per-minute fare, status, actions. Currency is INR formatted consistently with `Intl.NumberFormat`.

Category cell includes a 42px image/icon tile, name, description and subcategory label. Subcategories are indented with a light connector and parent name; root rows include child count. Missing/broken images show a vehicle-family icon on brand-soft. Long names wrap or ellipsize within a constrained cell. Actions use a labeled edit button; status changes happen in the editor with explicit explanation. Existing records are disabled rather than hard-deleted.

### Status badge

Compact rounded 8px badge, 10–11px semibold text, 2.5px/8px padding, subtle tinted background, status dot plus **Enabled**/**Disabled**. Distinguish a disabled parent from an individually enabled subcategory via explanatory text. Avoid icon-only status controls.

### Pagination

Local page size 10 for the initial catalog. Footer shows result range/count and Previous/Next buttons. Disable unavailable controls. Filtering resets the page. Stable ordering uses configured sort order, name, and ID. Dataset is a configuration catalog, not an unbounded activity feed.

### Primary, secondary, and icon buttons

Primary: amber fill, white semibold text, 8px radius, 44–54px height, darker hover. Secondary: white fill, gray border, dark text, amber hover border. Icon buttons: 40px square/circle, clear accessible label. Pending buttons include a small spinner and descriptive verb; disabled opacity 55%, retain disabled semantics. Prevent duplicate submits.

### Text and number fields

Visible 14px semibold labels; optional helper text 12px gray; white 1px-bordered fields, radius 8px, 12–16px inset. Focus border amber. Invalid fields use red border plus a text message connected with `aria-describedby`. Number fields use suitable decimal/integer input mode and limits. Prices accept at most two decimal places. Image fields use file selection instead of URL inputs.

### Image picker and local preview

The shared `ImageUpload` component is used for category and profile images. Use a white/light-gray drop area with a 1.5px dashed border, 12px corners, and 20px padding. Hover and drag-over use the amber border and pale amber background. A 96px preview tile displays the full image with `object-fit: contain`; transparent images show a subtle checkerboard. The copy offers drag-and-drop or click to browse, supported formats (JPEG/PNG/WebP), and a 5 MB limit. Show file name/size and **Ready to save** after selection. Keep buttons keyboard accessible and announce selection errors through the existing inline alert.

Selection decodes and previews the image locally with a blob URL, with no upload request. Expose **Remove image** and **Undo image change**. Submit reads the pending file into the entity request body; the server uploads to Cloudinary and saves the returned URL. Disable the picker while selecting/saving, prevent duplicate submits, and show **Uploading and saving…** during image saves. Errors retain the pending file and other values. Cancel, discard, replacement, and unmount release unused blob URLs. Below 640px, stack the preview and instructions. User header avatars and category choice previews use the same local selection before Save.

### Category parent and vehicle family pickers

Native accessible selects styled as Gym picker fields, with a trailing chevron. Parent choices contain **Top-level category** and eligible roots. A category cannot choose itself, a descendant, or a subcategory as its parent. Vehicle family choices represent physical compatibility (Bike, Scooter, Auto, Sedan, SUV). A subcategory is one selectable choice when its parent is enabled; a group with children is not itself a rider/driver choice.

### Enabled switch

Labeled binary control with 40x24px pill, 18px white thumb, amber enabled track, gray disabled track, keyboard toggle, `role=switch` and `aria-checked`. Helper copy explains that disabling a parent hides its subcategories and that existing ride history is retained. Save persists the status; no unconfirmed local status change is shown as saved.

### Category editor dialog

Modal backdrop dark at 40%, 18px rounded white surface, maximum width 720px, maximum height 90dvh and internal scroll. Header has title (**Add category**, **Edit category**, **Add subcategory**) and labeled close button. Two-column fields on desktop, single-column narrow. Sections: details/hierarchy, vehicle compatibility/capacity, pricing, visibility/order. Footer has Cancel and Save. Focus stays inside the modal, Escape closes when idle, focus returns to the opener, and pending save prevents closure. Show a clear conflict message if another admin edited the record.

### Confirmation dialog

Same modal primitive, smaller width. Sign-out has title, explanation, Cancel and Sign out. Disabling a category uses explanatory form helper and a saved change, retaining history; no silent permanent deletion path is offered.

### Inline alerts and toasts

Alerts have a border, tinted background, semantic icon, short title and concrete recovery text. Error text is safe API copy rather than raw exceptions. Success toast uses status live region, bottom right desktop/bottom center phone, dismiss action, and finite display duration. API failures retain entered form values. Auth failure keeps the login available to retry.

### Loading and skeleton states

Compact 20–28px thin spinner in brand color; center page restoration indicator. Catalog skeleton rows preserve row dimensions and do not show fake data. Loading buttons retain width. Respect reduced-motion settings. Use `aria-busy` on loading regions.

### Empty, no-results and error states

Centered restrained icon tile, 16px semibold title, 14px explanation and relevant action. Empty catalog offers Add category; filtered-empty offers Clear filters; fetch failure offers Retry. Do not present server failure as an empty catalog. Existing data can stay visible during refresh with a clear loading state.

### Authentication screen

Gym-auth dark canvas `#080C10`, thin amber elliptical orbital lines, the One More logo, large uppercase headline and muted white explanatory text. Desktop uses a 2-column composition (brand narrative left, bounded sign-in surface right); phone stacks. The Google Identity Services button is genuine and visible, white/rounded, with keyboard support. Only approved admins can enter. Show Google configuration/load failure as a recoverable state, a small busy indicator while verifying, and a safe access-denied message for unauthorized accounts. No demo login or fake credentials.

### Account avatar

36px circle, real authenticated user's image where available; fallback initials on pale amber, never another person's stock photo. Use name/email in menu. Images have a safe fallback on load failure.

### Error boundary and not-found screen

Workspace restoration failure automatically signs out and returns to the existing Google sign-in page. Do not show a blocking restoration error or Retry screen. Clear the authenticated view promptly while server logout cleanup runs; Google sign-in uses its existing pending/error states. Data-fetch failures inside an authenticated page retain their existing error and retry components.

Reuse the feedback panel and primary button. Route errors provide a return-to-catalog action. Unexpected rendering errors provide Reload; they do not show tokens, stack traces or raw server messages.

## Responsive, accessibility and interaction rules

### Users navigation and Personal tab

The primary rail now contains **App** and **Users**, using the same icon/label geometry, spacing, and amber selected treatment. Unselected items use muted text. Users opens a secondary directory with a labeled search field, refresh action, scrollable name/ID entries, and compact server pagination. Each entry shows the name in 12px semibold and the ID in 10px monospace, with full values available in titles. Selected users use the existing pale amber background. Loading, fetch errors with Retry, empty accounts, and no search results are distinct states. Below 1024px, this directory becomes a bounded panel above the main workspace and retains scroll/search/pagination access.

The first user detail tab is **Personal**, using the existing 44px tab strip. The content heading includes the user's real avatar (or initials), name, and ID. Reuse the white bordered 12px card, section steps, two-column field grid, existing `Field`, `Button`, `InlineError`, and `Toast`. Personal fields edit first/last name, international phone, and an image selected with the shared upload control. Account fields (email, ID, role, status, timestamps, coordinates) are read-only with a pale gray background. The grid stacks on phones. Footer actions are **Discard changes** and **Save changes**, disabled until edited; saving disables personal fields and shows progress. API errors preserve entered values; stale edits offer **Reload latest details**. Confirmation uses the shared success toast, and the directory name updates after save. No extra visual component system is introduced.

- At 1024px+: primary rail + secondary navigation + flexible main workspace.
- Below 1024px: secondary nav becomes a horizontal/context bar; main rail remains compact.
- Below 640px: mobile header/context navigation; content is full width with 16px insets; tables scroll locally, dialogs become almost full-width sheets.
- Every input has a label, every icon action has an accessible name, all actions work with keyboard. Use a skip-to-main link and visible focus.
- Modals use native dialog behavior or an equivalent complete focus-management implementation.
- Route state, enabled state, pending state and error state are expressed through text as well as color.
- Images are optional. Interactive content remains usable if images or fonts fail.
- Google and API requests have timeouts and retry controls; authenticated data is never replaced by mock fixtures.

### Admin navigation and access management

The primary rail contains **App**, **Users**, and **Admin**. Admin uses the existing shield icon and the same muted/amber selected states. Its secondary rail contains **Access**, and the horizontal tab strip contains **1More Admin**. Breadcrumbs read **Admin / Access**. Below 1024px the Access rail becomes a compact context panel above the workspace; below 640px the three primary items remain in the top row with compact padding.

The access page reuses the existing heading/action layout, with **Grant access** as its primary action. Three real statistics use the existing white bordered tiles: administrators, active accounts, and awaiting Google sign-in. Use three columns on desktop, two on tablet, and one on phones. The directory card reuses search, a native All/Active/Suspended select, Refresh, loading rows, errors, empty states and server pagination (20 per page). The table scrolls inside its card on narrow screens.

Administrator rows use the shared 36px `Avatar`, name/email/ID, a pale amber **You** label for the signed-in account, Active/Suspended `Badge`, Google linkage, and recorded grant metadata. Long email addresses wrap inside a bounded cell. Legacy grants show **Existing access** and **Granted before access tracking**. Never fabricate grant dates or actors. Actions use the existing ghost button; self-removal is disabled and labeled **Your access**.

Grant uses the small `Dialog`, a labeled Google account email `Field`, helper copy explaining immediate Google sign-in and no invitation email, and a gray bordered notice explaining full admin permissions. Removal uses the same dialog with the real account identity and a clear explanation that personal/ride data is retained and admin sessions end. Add the shared **danger** button variant for confirmed removal: red `#B91C1C`, white text, darker hover `#991B1B`, existing 8px radius and pending/disabled treatment. Ordinary primary actions stay amber.

Saving disables the form and dialog dismissal, prevents repeated submissions, and shows the standard spinner. Errors retain the email input. A stale removal refreshes the directory and disables confirmation until the administrator closes and reselects the account. Successful grants/removals close the dialog, reload the directory, and announce a truthful shared `Toast`. Requests are canceled on page departure. Every control has an accessible name; tables have column headings and an accessible caption, and loading/results use a status live region.

## Workspace expansion components

### Navigation and audit tab

Add **Partner program** as the fourth primary item with the existing layers icon. Its secondary item is **Requirements**, with horizontal **Details** and **Documents** tabs. Admin / Access gains **Audit log** beside **1More Admin**. App / User gains **Vehicle Models** beside **Vehicle Categories**. Preserve the 1More logo, Gym typography, amber active states and rail geometry. Long primary labels wrap on desktop; compact phone navigation scrolls horizontally. Context rails remain visible above the content on tablets/phones.

### Shared management search and pagination

`ManagementToolbar` owns a shared `ManagementSearch`, grouped `FilterSelect` controls and the secondary Refresh button, always in that order. Search timing remains feature-specific: server searches debounce for 300 ms and cancel stale requests; the local category filter updates immediately. Every filter uses the same bordered `field` styling and height. `ManagementPagination` displays the actual server range, total and previous/next controls. A zero-result response differs from a loading or failed response. Tables scroll within their cards and include accessible captions and column headings.

### Brand directory and model table

Use two shared white bordered catalog panels: a 240–300px brand directory and a flexible model table. Stack below 1280px. Brand choices scroll within a bounded 480px region (250px when stacked), keeping model controls reachable. Each row uses the existing 42px category image tile, with contain-fit for logos, name, review state/model count and labeled edit icon. Selected brand uses pale amber with `aria-pressed`; All brands clears the scope. The model card has independent search, Requested/Verified/Rejected filtering, pagination and Add model, enabled after a brand is selected.

Model rows display logo/name/brand, family/fuel, seats/years, review/requester metadata and Edit/Review. Missing or broken logos fall back to the vehicle icon. Disabled state is explicit. Pending requests never appear as verified choices.

### Brand and model editors

Reuse `Dialog`, `Field`, the two-column grid, `ImageUpload`, alerts and footer buttons. Brand fields: name, review status, country, HTTPS website, description, logo and enabled setting. Model fields: name, status, parent brand context, family, fuel, seats, optional year range, description, logo and enabled setting. Rejected status reveals a required reason. Both use local image preview and upload on submit; no image URL paste input is added. Show the real requester. Saving disables edits/dismissal, avoids duplicate submits and retains values on error; closing reloads current records after a conflict.

### Requirement categories manager

Open **Categories** from either Requirements tab. Reuse one modal surface with Add category and rows showing name, description, field count, order, status and Edit. Category editing replaces the manager modal. Fields are name, description, numeric order and active checkbox. Disabled categories remain editable with text status. An empty manager explains that a category is needed before adding fields. Return to the refreshed directory after save/cancel.

### Dynamic requirement field editor

One form and entity power both tabs. Short text / Long text / Number / Date / Yes-no appear in Details; File / Image / PDF appear in Documents. The heading has Categories and Add field; Add field requires an active category. Filters are search, category and active state. Rows show label/key, type, category, required/order/file rules, effective status and Edit. An inactive category is identified even if its field is enabled.

The dialog contains label, stable key, category, type, help text, conditional placeholder, order, Required and Active. On creation the key follows the label until manually edited; after creation it is read-only. NUMBER reveals minimum/maximum; text types reveal maximum characters. Documents reveal a 1–20 MB size control and multiple-files checkbox. Generic File reveals extension checkboxes; Image/PDF display fixed accepted formats. Controls have labels, hints and browser/server validation. Changing type moves the saved field to its corresponding tab. This screen defines requirements; it does not ask admins to upload partner documents.

### Checkboxes, extension choices and action groups

Boolean settings use the existing amber `Switch` in a shared `SettingRow`, matching category visibility. Native 16px checkboxes are reserved for multi-select extension choices, with amber accent and an 8px label gap inside a bordered 8px fieldset with a visible legend. Generic files require at least one extension. Action groups wrap on narrow screens. Reuse existing buttons, badges, fields and icons.

### Account deactivation and login metadata

Append the same white bordered 12px personal card below Personal, aligned to the same content width. Use the existing red danger button for deactivation. Explain that access/sessions end while personal/ride history remains. Self-deactivation is disabled. The small danger confirmation names the real account and requires its email or ID; confirmation stays disabled until it matches. Errors preserve input and offer Reload latest details. Active rides must be finished/canceled first. Success returns to the refreshed directory.

Personal displays read-only Last login and Last admin login; the admin directory displays Last admin login. Format real timestamps locally; unknown historical values say **Not recorded**.

### Administrator audit history

Admin Access also shows a **Login location** column beside Last admin login. Use the shared 12px cell title, 10px helper text and amber underlined map link. Browser-permitted location shows accuracy; IP lookup shows an explicitly approximate network location and ISP, with browser-reported IP origin identified. Missing historical data says Not recorded and explains that a new sign-in is needed. Keep the table's local horizontal scroll. The sign-in screen includes muted 11px copy explaining the native permission request and IP fallback, using its existing dark auth palette.

Use the existing heading/card, shared search/refresh, outcome filter and pagination. Columns are time, real administrator identity, method/route, readable outcome/status code, and monospace request ID. Unknown actors on session failures are labeled unauthenticated session requests. Pending entries say In progress. Tokens and request bodies are excluded. Loading, failure and empty history remain distinct. Identities/request IDs wrap; the table scrolls locally on phones.

## Reuse requirements

### Shared implementation contract

All workspace pages use the existing category layout as their reference. The shared components below implement it; new feature modules must consume these components instead of adding alternative heading, panel, toolbar, pagination, loading or editor styles.

| Component | Established design it owns | Consumers |
| --- | --- | --- |
| `PageHeading` | Eyebrow/context, 28px title, helper text and wrapping action row | Categories, models, requirements, admin access, audit, Personal |
| `CatalogPanel` | White surface, 12px border radius, 24px header, section title/count, actions, local table overflow | All management directories and category manager |
| `ManagementToolbar`, `ManagementSearch`, `FilterSelect` | Search → filters → refresh; bounded fields, common heights and responsive wrapping | All management directories |
| `ManagementPagination` | Shared range and previous/next layout; one-based display | All management directories, adapting category's existing zero-based state |
| `TableLoading` | Shared shimmer rows and accessible loading status | All management directories |
| `EditorSection`, `SettingRow` | Category editor's numbered dividers, 18px form grid gaps and visibility switches | Brand/model, requirement/category editors |
| `EntityImage` | Existing 42px category image tile, icon fallback, lazy image loading and logo contain-fit | Categories, brands and models |
| `Badge` | Existing enabled/disabled geometry; shared pending and error variants | Configuration state, moderation, access, audit outcomes |

Only the current tab uses amber text, heavier weight and an underline; inactive tabs use muted text with a transparent underline. Long tab/navigation labels scroll locally on narrow screens. Form errors, local upload previews, save behavior and validation stay with their existing feature logic. No separate `management-*` presentation system is used.

Implement shared `Button`, `Icon`, `Field`, `ImageUpload`, `Badge`, `Switch`, `Dialog`, `StateCard`, `Toast`, `Avatar`, and shell components. The shared `useImageUpload` hook owns pending files, validation, blob preview URLs, removal, undo, and submit-time serialization. Feature pages consume them rather than reproducing class strings and interaction logic. Global colors/measurements belong in Tailwind theme/CSS variables; module copy and API paths belong in module constants. This document must be updated when a new shared component or a user-approved visual decision is introduced.


## Partner onboarding components

- Reuse PageHeading, CatalogPanel, ManagementToolbar, FilterSelect, ManagementPagination, TableLoading, Button, Field, Badge, Dialog, StateCard and Toast. Lists use the same search, filters, table cells, pagination and retry states as Requirements and Vehicle Categories. Use the defined field class on inputs; do not introduce undefined panel/input/notice classes.
- RichDocumentEditor: white document surface, restrained gray formatting toolbar, 36px controls with 8px corners, amber active states, existing focus rings, 36px paper padding (20px on narrow screens). On phones the toolbar scrolls horizontally. Image previews stay local until save. Typography defaults to Space Grotesk and follows the author's chosen formatting. Selection controls show the current font settings; changing editability must not mark the draft as changed.
- DocumentPreview: sandboxed white paper frame, using the same document-content.css rules as the editor. Document tables explicitly reset catalog table minimum widths, capitalization, padding and hover treatment. Document colors and fonts use the workspace theme variables.
- Partner application review: CatalogPanel answer cards, 24px gaps, two columns on wide screens and one below 1280px; panel body padding matches the shared 24px/16px desktop/mobile insets. Use shared status badges and fields for visible rejection reasons. Long filenames wrap within the card. Application approval is available after every required or provided answer is approved.
- FileUpload: final PDFs reuse ImageUpload's dashed dropzone, preview tile, selection status and actions. Keyboard browsing and dropping respect the saving state. Show filename/size, local PDF preview and Remove PDF; upload after explicit confirmation. PDF signature and size are checked before selection. Manual share, download and SMTP retry are separate labeled actions with visible recovery paths.
- Activation-code dialog: shared small Dialog, centered 36px code, amber emphasis, copy action, explicit manual-delivery description. Code retrieval/unlock remains an administrator action.
- Editor routes are loaded on demand. Loading, errors, refresh and confirmation actions keep their existing shared components.
- Secondary navigation uses muted transparent inactive links and pale amber only for the active route. The keyboard skip link remains invisible until focused.

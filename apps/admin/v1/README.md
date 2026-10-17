# 1More Admin

Vercel deployment uses this folder as the Admin project's root. Its `vercel.json` serves the Vite build and SPA deep links and rewrites `/api/*` to `https://apionemore.vercel.app/api/*`. Production browser requests always use same-origin `/api/v2`, even if `VITE_API_BASE_URL` contains an old backend URL. That variable overrides the API base in development only. See [VERCEL_DEPLOYMENT.md](../../../context/VERCEL_DEPLOYMENT.md).

Vite + React + TypeScript + Tailwind admin workspace. Its module organization follows `Quest/gym/apps/web`; its visual system comes from Gym Flutter's Space Grotesk, amber/brown colors, gray canvas, bordered cards, fields, tabs, and feedback patterns. The complete component reference is [`context/WEB_DESIGN.md`](../../../context/WEB_DESIGN.md), with the delivery plan in [`context/ADMIN_IMPLEMENTATION_PLAN.md`](../../../context/ADMIN_IMPLEMENTATION_PLAN.md).

Partner Program includes rich Policy/Confirmation editors, Applications/Confirmations review, private final PDF upload/download, SMTP retries, manual WhatsApp/media sharing and activation-code controls. See [PARTNER_ONBOARDING_IMPLEMENTATION.md](../../../context/PARTNER_ONBOARDING_IMPLEMENTATION.md) and [the phased plan](../../../context/PARTNER_ONBOARDING_PLAN.md).

## Run locally

From `apps/api/v2`:

```powershell
npm install
npm run prisma:generate
npm run prisma:deploy
npm run admin:grant -- --email your-google-account@example.com
npm run dev
```

From `apps/admin/v1`:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open `http://localhost:5173`. The development server forwards `/api` to NestJS V2 at `http://127.0.0.1:4001`. If an ignored `.env` is already present, preserve it rather than copying over it. During implementation, the existing API's public Google client ID was copied to the ignored admin `.env`; no secret was copied.

For a local production preview, stop the development server, run `npm run build`, then `npm run preview`. Preview uses the same port, API proxy, and Google popup header as development.

### Google and administrator setup

1. Use a Google OAuth **Web application** client. Add `http://localhost:5173` and, if used, `http://127.0.0.1:5173` as authorized JavaScript origins in Google Cloud. Use the production admin origin when deploying. GIS uses its popup callback; no app redirect endpoint is required for this flow.
2. Set `VITE_GOOGLE_CLIENT_ID` in the admin `.env` and `GOOGLE_WEB_CLIENT_ID` in the API `.env` to that same public client ID. The API falls back to the existing `GOOGLE_CLIENT_ID` if the web-specific value is empty.
3. Set `ADMIN_WEB_ORIGIN` in the API to an exact comma-separated list of allowed admin origins. The local defaults are the two origins above. Restart the API and Vite after env changes.
4. Run `npm run admin:grant -- --email ...` from `apps/api/v2` for the real Google account that should administer 1More Admin. The command creates/promotes only the specified active account, records the action, and does not create a password. Never provision a made-up default admin in production.
5. Sign in through the Google button. A Google account that is not an active ADMIN is rejected. There is no public admin signup or demo bypass.

The server checks Google's signature, audience, token expiry and verified email, then binds the stable Google subject to the provisioned account. Once bound, an alternative Google subject cannot take over the account through the same email. Browser access tokens remain in memory; rotating refresh tokens are hashed in the database and carried in HttpOnly, SameSite=Strict cookies. Production cookies are Secure. Origin checks guard all browser session mutations. Web Locks serialize login, refresh, and logout between tabs; an in-tab queue also serializes them when Web Locks are unavailable. A shared promise deduplicates concurrent refreshes. Sign-out broadcasts to other tabs without storing credentials.

Migration `0003_admin_session_families` adds browser session families. Rotated refresh sessions retain their family and absolute expiry. Logout revokes the entire family, including a refresh racing with logout, and protected admin requests reject new browser access tokens belonging to a revoked family. Current role and account status are checked on every admin request. The mobile refresh endpoint rejects browser session tokens, rotates mobile tokens atomically, and rejects suspended accounts. Existing mobile access tokens retain their JWT expiry policy.

For production, serve the app and API under the same site, preferably proxying `/api` from the admin host to the API. Serve HTTPS, configure SPA fallback to `index.html`, preserve the cookie path, configure the exact admin origin, and send `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the Google popup can complete. Do not set Google secrets or database credentials in any `VITE_` variable.

If workspace restoration or token refresh fails, the panel automatically ends the local session and returns to Google sign-in. It broadcasts sign-out to other tabs and attempts server logout with a five-second timeout, serialized before another login. A noncredential sign-out marker prevents a remaining HttpOnly cookie from silently restoring access after reload when the API is offline; successful Google sign-in clears that marker. Access and refresh tokens are never stored in browser storage. Ordinary page-data failures retain their normal retry controls.

## Navigation and modules

```text
src/
  app/                         Routes and error boundary
  components/
    layout/                    Persistent primary/secondary navigation
    ui/                        Button, Field, ImageUpload, Switch, Badge, Dialog, Icon, Avatar
    feedback/                  Loading, errors, empty states, toast
  lib/                         API transport and in-memory session
  modules/
    auth/                      Google sign-in and browser session lifecycle
    admin-access/              Administrator directory, grants and removal
    users/                     User directory and editable personal details
    vehicle-categories/        Catalog, hierarchy, filters and editor
  styles/                      Gym-derived tokens and responsive components
  types/                       Shared API/domain types
```

Primary navigation contains **App**, **Users**, and **Admin**. **Admin → Access → 1More Admin** opens `/admin/access/1more-admin`. **App → User → Vehicle Categories** remains at `/app/user/vehicle-categories`. **Users** opens the searchable, paginated account directory at `/users`; each secondary navigation entry displays a user's name and ID. Selecting an entry opens **Personal** at `/users/:userId/personal`.

## Administrator access

Open **Admin → Access → 1More Admin** at `/admin/access/1more-admin`. Current active administrators can grant full workspace access using an exact Google account email. Existing users retain their account; an unknown email is provisioned so its owner can sign in with that verified Google account. No invitation email is sent. Repeating a grant does not duplicate access.

The directory supports name/email/ID search, account-status filters, refresh, and server pagination. It shows real avatars, Google linkage, grant date and granting administrator where recorded. Existing grants remain visible without inventing historical metadata. Suspended or deleted accounts cannot be granted access.

A new recipient receives a normal user record and ID immediately when access is granted. Their first Google sign-in in Admin links and completes that record. Signing into the user app before or after Admin keeps the same user ID and Google identity; existing user-app accounts are promoted in place. Saved names and avatars survive later sign-ins. Ambiguous email owners and conflicting Google subjects are rejected.

Removing access requires confirmation, restores the previous non-admin role, and invalidates browser admin session families. Personal data and ride history remain available. Administrators cannot remove their own access or the last active administrator. Stale removals reload the directory and require a fresh selection. All role changes and their audit entries commit together.

Migration `0004_admin_access` is required. Both API versions carry the same migration. The initial provisioning command remains available for the first administrator; subsequent grants can be managed from this page. See [ADMIN_ACCESS_IMPLEMENTATION.md](../../../context/ADMIN_ACCESS_IMPLEMENTATION.md) for endpoints and operational details.

## User personal details

The Personal form edits first name, last name, phone number in international format, and an optional uploaded profile image. Email, role, status, ID, creation/update timestamps, and last known coordinates are read-only. Sign-in credentials and permissions are not changed by this form. Deleted accounts are excluded; suspended accounts remain visible. All directory and detail endpoints require a current active administrator.

Saves validate on the API, reject duplicate phone numbers, and require `expected_updated_at` to prevent overwriting a newer edit. Profile updates and their audit record commit together. A conflict keeps entered values and offers **Reload latest details**; successful saves update the sidebar name and show confirmation. Switching accounts cancels pending client requests. On narrow screens the directory appears above the details so every account remains reachable.

## Categories and subcategories

Create/edit category names, descriptions, optional uploaded images, physical vehicle families, passenger capacity, base/per-km/per-minute fares in INR, enabled state, and display order. Codes are generated on the server. Search, enabled/disabled filters, refresh, pagination, loading, error, no-results, and empty states use real API data.

- A root with no children is selectable. Once it contains subcategories it becomes a group, and its enabled leaves become the selectable choices.
- The initial hierarchy is two levels: category and subcategory. Self-parenting, cycles, and a third level are rejected.
- Each vehicle holds one category foreign key, not an array. Drivers choose one available category/subcategory. Compatibility with the vehicle family and passenger capacity is enforced on the server.
- Disabling a parent hides all of its subcategories from new rider/driver choices, even if a child's own switch is enabled. Disabling a choice also prevents booking it from an old quote.
- A root with registered vehicles cannot become a group. Create a new group and compatible subcategories, then let drivers reclassify their vehicles before converting the old root. A family is locked after registrations or fare quotes use it. Capacity cannot be increased beyond existing vehicles' capacity.
- Categories with history are never hard-deleted through the UI. Changes and audit records commit together. Concurrent admin changes return a conflict rather than overwriting someone else's edit.
- New quotes read enabled leaves from the database instead of hardcoded fares. Each quote snapshots the name, image, capacity, parent name and calculated fare. Later edits do not rewrite old quotes.
- The initial migration seeds Bike, Scooter, Auto, Sedan and SUV with the previous fare rates and backfills existing registrations/quotes.

## Image selection and saving

Category images, user profile images, brand logos and model logos use the shared drag-and-drop/file picker. Choose one JPEG, PNG, or WebP image, up to 5 MB and 40 megapixels. Selection opens a local preview, with replace, remove, and undo controls. No Cloudinary request is made during selection, preview, or cancellation; object URLs are revoked on replacement and unmount.

On Save/Create, the form reads the selected file into an `image_upload: { file_name, data_url }` object in the same JSON request body as the entity fields. The API validates type/size/signature, uploads to Cloudinary with server-side authentication, then persists the returned HTTPS URL with the entity and audit record. Cloudinary calls happen outside database transactions. If persistence fails, the new asset is deleted on a best-effort basis; existing images are retained because historical ride quotes may still reference them. An unchanged image causes no upload; removing an image clears its stored URL on save. Form values and the pending file stay available after a failed save.

Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `apps/api/v2/.env`, then restart the API. These are server settings; no Cloudinary secret belongs in a `VITE_` variable. Image forms accept JSON bodies up to 8 MB for base64 overhead; other API endpoints retain their 1 MB limit. Upload saves allow 90 seconds, while ordinary admin requests keep their existing timeout. The integration follows Cloudinary's [signed upload API](https://cloudinary.com/documentation/authentication_signatures).

Before uploading, the API centrally converts every new image to WebP using Sharp. The browser still previews the original selection locally; conversion happens only after Save reaches the API. New stored assets use WebP, while existing image URLs remain unchanged.

### Client integration

Riders' existing Flutter vehicle carousel now displays configured category names, images and capacity from the quote snapshot. Long names truncate within the card; broken images fall back to a vehicle icon.

Driver accounts have **My vehicles** in the existing Flutter drawer. They can register a vehicle with one enabled leaf choice and reclassify an existing compatible vehicle. They cannot change category during an assigned or ongoing ride. Every update is owner scoped. Dispatch and offer acceptance check the selected ride category against the driver's active vehicle category, family, capacity and current verification/availability.

The first registered vehicle becomes the profile's selected vehicle; it remains under review and cannot accept rides until approved. Drivers can use **Use this vehicle** to select another approved vehicle. Switching vehicles or changing availability during an active trip is rejected. Matching checks both current category capacity and the seats advertised in the original quote. Concurrent acceptances cannot assign two rides to one driver. Cancellation cancels outstanding offers and restores the assigned driver's availability.

### API endpoints

All paths below are beneath `/api/v2` on the NestJS API; its `/api/v1` URL alias remains available.

| Method | Path                            | Access                                                         |
| ------ | ------------------------------- | -------------------------------------------------------------- |
| POST   | `/admin/auth/google`            | Allowed Origin, verified Google identity, provisioned ADMIN    |
| POST   | `/admin/auth/refresh`           | Allowed Origin and valid HttpOnly refresh cookie               |
| POST   | `/admin/auth/logout`            | Allowed Origin; revokes browser refresh session                |
| GET    | `/admin/auth/me`                | Access token and current active ADMIN                          |
| GET    | `/admin/users`                  | Current active ADMIN; query, page, page_size                    |
| GET    | `/admin/users/:id`              | Current active ADMIN; personal details                         |
| PATCH  | `/admin/users/:id`              | Current active ADMIN; personal fields and expected_updated_at   |
| GET    | `/admin/vehicle-categories`     | Current active ADMIN                                           |
| POST   | `/admin/vehicle-categories`     | Current active ADMIN; creates root/child                       |
| PATCH  | `/admin/vehicle-categories/:id` | Current active ADMIN; requires `expected_updated_at`           |
| GET    | `/vehicle-categories`           | Authenticated; enabled catalog with `is_selectable`            |
| POST   | `/driver/vehicles`              | Driver profile owner; `vehicle_category_id` selects one choice |
| PATCH  | `/driver/vehicles/:id/category` | Vehicle owner; body `{ vehicle_category_id }`                  |
| PATCH  | `/driver/vehicles/:id/active`   | Vehicle owner; approved compatible vehicle; no active trip     |

Legacy registration with `type` remains compatible while the corresponding seeded category is an enabled leaf. Newly built clients should always send `vehicle_category_id`.

## Checks

```powershell
npm run type-check
npm run build
npm run format:check
npm run test:e2e
```

Browser checks cover create/edit/subcategory controls, filtering, keyboard modal behavior, responsive containment, denied and successful Google callbacks, logout, retry after expired access, and absence of browser token storage. Google callbacks and API responses in these UI checks are fixtures confined to the test runner. The production application has no mock mode. Screenshots are generated under ignored `.artifacts/`.

Additional regressions cover request timeouts with cancellation, repeated unauthorized responses, sign-out across tabs, logout queued behind refresh, duplicate form submissions, stale-edit recovery, and successful saves whose follow-up refresh fails.

The admin validates API envelopes, sessions, and category records before storing/rendering them. Malformed responses remain recoverable; inactive accounts end the local session. Every protected API route checks current account status, role, and browser session-family revocation.

API integration checks use the real HTTP server and a test PostgreSQL database, with temporary fixture accounts and records cleaned up afterward:

```powershell
cd ../../api/v2
$env:LIF_RUN_DB_TESTS='1'
npm run test:integration
```

The checks refuse a database name without `test` and are skipped unless explicitly enabled. They exercise current-role authorization, role revocation, origin checks, concurrent refresh rotation, hierarchy/cycle rules, conflicting updates, disabled parents, driver ownership and compatibility, fare snapshots, category-matched offers, and active-trip reclassification prevention. They do not claim a live sign-in with a human Google account.

Run `npm run test:unit` from `apps/api/v2` for configuration/provider checks when verification is requested. Run `flutter analyze` from `apps/user/v1` for mobile static analysis; no APK build is needed.

The completed review and verification record is in [`context/ADMIN_REVIEW.md`](../../../context/ADMIN_REVIEW.md).

## Expanded management workspace

Admin Access now includes the location recorded at the last sign-in. Google sign-in asks for browser geolocation; declined/unavailable location falls back to an IP estimate with ISP details where available. Browser coordinates, IP estimates and unavailable results are labeled distinctly. Existing sessions need a fresh sign-in before a location snapshot appears. See [ADMIN_LOGIN_LOCATION.md](../../../context/ADMIN_LOGIN_LOCATION.md) for provider use, timeouts and trust limits.

- **Admin / Access / 1More Admin**: access removal uses the grant version rather than the profile timestamp. Last admin login is visible. **Audit log** records recognized admin requests, session activity and outcomes with search/filters/pagination.
- **Users / Personal**: last login timestamps and confirmed deactivation, with sessions/devices revoked and history retained. Self-deactivation and accounts with active rides are protected.
- **App / User / Vehicle Models**: create/edit brands and models, local logo previews, approve/reject driver requests, filter moderation states and enable verified catalog entries.
- **Partner program / Requirements / Details, Documents**: one dynamic field entity, shared editable categories, type-specific validation, required/active state and display order. These configure the fields collected by the user app's partner application form.

See [ADMIN_EXPANSION_IMPLEMENTATION.md](../../../context/ADMIN_EXPANSION_IMPLEMENTATION.md) for the complete V2 API contract and limits. Apply V2 migrations 0005/0006 and generate its Prisma client before running the updated server. Existing test results above predate this expansion; only compilation/build/format/schema checks were run for the new features.

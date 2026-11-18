# Profile destination UI migration — 17 November 2026

## Shared implementation

`SolidPage` in `lib/components/ui/solid_ui.dart` is the single content-page frame: black safe-area header, light status-bar icons, centered 16 px w500 title, back control, optional page actions, and a clipped white body with 24 px upper corners. Keyboard resizing and the destination's scroll controller remain owned by the screen. The body respects the bottom safe area.

`AppPage` delegates to this frame, so its existing callers receive the same structure. The legacy `glass` constructor argument remains source-compatible; `AppPage` now renders solid. `SolidScope` and the existing solid adapters render inherited form fields, menus, dialogs and sheets without glass. Explicit destination headings and secondary-page widgets use w500 and compact 12/14/16/20 px hierarchy.

The app's Navigator is also hosted inside `SolidScope` in `main.dart`. This matters for dialogs opened from a page's State context, which sits above its returned page widget: pushed routes and modal builders now inherit the same solid theme. `LiquidGlassPage` remains a compatibility entry point that delegates to `SolidPage`, avoiding a second app-bar implementation.

Profile passes no trailing action. Other pages retain their necessary add, refresh, filter or safety actions. Named routes, controller data, upload state and business transitions are preserved.

## Screen-by-screen implementation log

Each checked item records code migration, with automated/device verification tracked separately below.

| Done | Screen or subflow | Implementation |
| --- | --- | --- |
| [x] | Profile | Uses `SolidPage`; custom duplicate frame and overflow menu removed. |
| [x] | Personal / My Rides | Uses rider or driver history according to the active account mode. |
| [x] | Personal / My Wallet | New `WalletPage`, shared frame and Profile cards; sample balance stays in `SettingsController`. |
| [x] | Edit Profile | `AppPage` shared frame; existing validation/save preserved. |
| [x] | Change Phone Number | Same frame and focused phone editor; existing update endpoint. |
| [x] | Saved Places | Map page migrated to `SolidPage`; add/options controls moved to black header. Search, filters, pins and carousel retained. |
| [x] | Add Saved Place / map picker | Shared frame; duplicate floating title removed. Search, map picking and photo preview retained. |
| [x] | Saved Place details | `AppPage` shared frame; existing photos, visits, reviews and place actions. |
| [x] | Place directions | `AppPage` shared frame with existing directions content. |
| [x] | Add/edit place form | Existing modal/form inherits solid theme from the destination; validation/upload behavior preserved. |
| [x] | Rider ride history | `AppPage` shared frame; starts with Date/category, removes counts/status/search rows above it, and uses compact local-timestamp cards with a schematic route preview on the newest result. Pagination and relevant actions retained. |
| [x] | Driver trip history | Same frame; driver-specific records preserved. |
| [x] | Historical trip fallback/detail | Existing `SolidPage` now uses the shared frame. Active/completed ride journeys retain their dedicated map/stage composition. |
| [x] | About Partner Program | Information content now uses `SolidPage`. |
| [x] | Apply / application steps | Existing `AppPage` uses shared frame; step navigation, dirty-state guards and native upload handoff preserved. |
| [x] | Partner activation | Same shared frame; activation checks retained. |
| [x] | Emergency Contacts | Same shared frame; add/edit dialogs inherit solid theme. |
| [x] | Help Me / Support | Same shared frame; channels and request history retained. |
| [x] | Report a Complaint | Opens existing support request form; dialog inherits solid theme. |
| [x] | Support request detail/replies | Same shared frame; replies and attachments retained. |
| [x] | FAQ | Information content uses `SolidPage`. |
| [x] | Privacy Policy | Sample document uses `SolidPage`. |
| [x] | Terms of Service | Sample document uses `SolidPage`. |
| [x] | Installed version | Profile row retained. |
| [x] | Payment Methods | Existing `AppPage` uses shared frame. |
| [x] | Notifications | Existing `AppPage` uses shared frame. |
| [x] | Driver account, finances, documents, vehicles and catalog forms | Their `AppPage` callers use the shared frame automatically. |

The map-first home/live ride journeys, authentication/session recovery, native camera scanner and temporary media handoff remain specialized operational layouts. They are not given duplicate app bars. The ride-stage black strip/white sheet remains the design reference for these operational flows.

## Verification

- [x] Flutter analyzer passed after shell and destination migration.
- [x] Profile, secondary settings, and Saved Places regression run: 16 tests passed, including narrow/landscape large text, validated emergency contact edits and place selection/submission. The saved-place test helper emitted offscreen-tap warnings in its modal retry sequence; final tests passed. Device modal interaction remains listed below.
- [x] Final analysis after app-wide solid theme: no issues. Profile navigation (including role-specific My Rides and My Wallet), partner submission/recovery and driver demo run: all 23 tests passed.
- [ ] Real device: status bar restoration after back navigation, keyboard, map interaction and partner camera/file handoff.

## Data scope

Profile summary and Wallet remain sample UI data as explicitly requested on 14 November. This task introduces no wallet transfer/top-up endpoint or financial side effects. No API or schema change, version bump, build or push is included.

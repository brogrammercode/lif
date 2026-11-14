# Profile / Settings rework — 14 November 2026

## Design and content

Reference: `C:/Users/harsh/Downloads/image 208.png`. The Profile page uses the ride flow's `SolidScope`, black upper banner, white rounded body, compact neutral typography and flat bordered summary cards. No glass treatment is introduced.

- [x] Centered profile identity; tappable photo retains the existing upload/review flow.
- [x] Driver mode shows a circular vehicle-brand badge at the avatar's lower-right corner.
- [x] Rider cards: Wallet, Ride Milestone, Place Explored and Money Saved.
- [x] Driver cards: Total Earning, Ride Milestone, Longest Covered Distance and Pending.
- [x] Personal: Edit Profile, focused Change Phone Number, Saved Places.
- [x] Partner Program: information page and existing application flow.
- [x] Help & Support: Emergency Contacts, Help Me, new complaint form, FAQ.
- [x] About: Privacy Policy, Terms of Service and installed package version.
- [x] Matching loading skeleton and pull-to-refresh/error handling.

## Data decision

The user explicitly requested dummy values and filled content for now. All sample card values, vehicle branding, FAQ and document content live in `SettingsController`, never in page fixtures. Privacy Policy and Terms are labelled sample content within their documents. They are not final approved legal documents. The fourth driver card is labelled Pending because its purpose is undecided. The installed version is loaded independently with `package_info_plus`.

No new backend endpoint, schema or persisted business data is introduced. Existing photo upload, session/mode restoration, account sign-out and support request mechanisms remain in use. Account options retain secondary account actions.

## Main files

- `apps/user/v1/lib/features/settings/pages/settings_page.dart`
- `apps/user/v1/lib/features/settings/widgets/profile_overview.dart`
- `apps/user/v1/lib/features/settings/controllers/settings_controller.dart`
- `apps/user/v1/lib/features/profile/pages/profile_page.dart` (phone editor mode)
- `apps/user/v1/lib/features/support/pages/support_page.dart` (open request form option)

Device photo upload and final visual comparison remain device acceptance items. No release or push is included.

Verification: Flutter analysis passed; both role layouts passed widget checks at 320×700 and 1.6× text scaling, including scrolling to the installed version row. The grouped menu rows use a Material layer for visible ink feedback.

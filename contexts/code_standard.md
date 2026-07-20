# Feature Development Standard Workflow

This document outlines the sequential steps for creating, updating, or fixing any module or feature within the project.

## 1. Core Principles
- **Zero-Comment Policy**: All code must be 100% comment-free and self-documenting.
- **Strict Layering**: Follow the defined architecture for each app type.
- **Type Safety**: Maintain strict TypeScript/Dart typing throughout.
- **Centralized Constants**: Nothing throughout the app will be hardcoded, not a single thing. If globally used, it will be maintained inside the global constant folder, otherwise inside their feature constant / param file.
- **Dartz Integration**: Use dartz `Either` (e.g., `TaskResult` and `SyncResult`) for repository methods and Cubits to return success or failure explicitly.
- **Consistent Timestamps**: Always use `created_at` and `updated_at` (snake_case) throughout the entire codebase (both backend API and mobile models) instead of camelCase `createdAt` and `updatedAt`.
- **Auto-Generated IDs and Codes**: Wherever there is a document/entity creating, the `code` will be automatically generated (no need to provide a field in UI forms). The `id` will always be a current datetime `millisecondsSinceEpoch` (e.g. `DateTime.now().millisecondsSinceEpoch.toString()` or `Date.now().toString()`) for each and every entity creation.

---

## 2. API (Backend)
Follow these steps in order when implementing a new feature:

1.  **Define Types**: Create `[feature].type.ts` for data structures and interfaces.
2.  **Database Schema**: Update `schema.prisma` with relevant models and run `npx prisma generate`.
3.  **Repository**: Implement `[feature].repo.ts` using Prisma for all database operations.
4.  **Service (Business Logic)**: Implement `[feature].service.ts` to handle logic and interact with Repositories.
5.  **Security/Utilities**: Implement `src/infra/security/` utilities if specific hashing or token logic is needed.
6.  **User Logging**: Every repository method that modifies data (create, update, delete) MUST accept an `actorUid: string` parameter and wrap its execution in a `prisma.$transaction`. Inside the transaction, it MUST call a helper to create a `UserLog` record alongside the mutation to trace every single action down to the minute details.
7.  **Constants**: Populate `[feature].constant.ts` with all messages, error strings, and configuration values. Absolutely nothing (such as endpoints, payload keys, regexes, separators, or default labels) will be hardcoded in logical files; everything must be moved to constants. **Every variable name inside the constants file must be written in CAPITAL_SNAKE_CASE (e.g., `NOT_FOUND_ERROR = "..."`).**
7.  **Controller**: Implement `[feature].controller.ts` using the `asyncHandler` utility.
8.  **Middleware**: Implement `[feature].middleware.ts` for authentication or validation if required.
9.  **Route**: Create `[feature].route.ts` to map endpoints to controller methods.
10. **Register Route**: Attach the new route to the global router in `src/routes/index.ts`.

### 2.1 Database Polymorphic Relations
Models like `Address` and `BankDetail` do not have strict foreign-key relations defined via array fields on parent models. Instead, they use `entity_type` and `entity_id`.
- **Never** nest `.create()` inside the parent model for these polymorphic relations (e.g. `addresses: { create: [...] }`).
- **Always** create the parent entity first, then use a `prisma.$transaction` to perform sequential creates, injecting the newly created `parent.id` as the `entity_id` and passing the correct `AddressType` or `BankDetailType`.

### 2.2 Entity IDs
- **Every single entity** must have its `id` automatically generated as a string representing `millisecondsSinceEpoch`. This is handled dynamically by the Prisma middleware (`src/infra/database/client.ts`).
- **Never** explicitly pass an `id` field during entity creation in a Repository, as it will bypass the middleware.
- If an entity needs to map to an external system (e.g. Firebase Auth), create a separate column (like `uid`) instead of hijacking the primary `id` field.

### 2.3 Ownership Tracking
- For any entity that contains `created_by` or `updated_by` fields in the schema, these fields must be strictly populated with the `uid` of the current user (`actorUid`) performing the operation. This applies to both entity creation (populate `created_by`) and entity modification (populate `updated_by`) across all repositories.

---

## 3. MOBILE (Flutter)
Follow these steps in order when implementing a new feature:

1.  **Define Model**: Create the data models and serialization logic.
2.  **Data Provider/Repo**: Implement the repository to handle networking or local storage.
3.  **State Management**: Create the Cubit or Bloc to manage feature state and business logic.
4.  **UI Components**: Build reusable widgets specific to the feature.
5.  **Pages/Screens**: Implement the final UI layout using theme-based tokens and responsive scaling.
6.  **Routing**: Register the new screens in the application's router.

---

## 4. General Maintenance (Fix/Update)
1.  **Analyze**: Identify the specific layer (Repo, Service, Controller) where the change is needed.
2.  **Verify Standards**: Ensure the change doesn't introduce comments or break type safety.
3.  **Update Constants**: Add any new strings to the relevant `constant.ts` file.
4.  **Test**: Verify the fix across the entire feature stack (from Repo up to Route/UI).

## 5. Mobile Layout & Navigation
1.  **State-driven Layout**: When switching between primary tabs and secondary pages from a global layout (like `HomeLayoutPage`), **do not** use `Navigator.push`. Instead, maintain a state variable (`_currentRoute`) and replace the body of the layout dynamically.
2.  **Pull-to-Refresh**: Every scrollable screen that displays fetched data (e.g., list views, dashboards) must wrap its scrollable body in a `RefreshIndicator` and map its `onRefresh` callback to the corresponding Cubit reload method.

# Mobile Code Standard

This document is the coding standard for `apps/mobile`. It is based on the current Flutter codebase, the project context documents, and the backend shape that the mobile app consumes.

## 1. Repository Shape

The project is a monorepo:

```text
shop/
  contexts/
    code_standard.md
    ui_standard.md
    flow.md
    execution_rules.md
    project_info.md
  apps/
    mobile/
      lib/
      android/
      ios/
      pubspec.yaml
      analysis_options.yaml
    api/
      src/
      package.json
      prisma.config.ts
```

`apps/mobile` is the Flutter client. `apps/api` is the TypeScript backend. Mobile code must be written with the backend response contract in mind, but mobile feature code must not import or depend on backend files directly.

## 2. Mobile Folder Structure

Current mobile source structure:

```text
apps/mobile/lib/
  main.dart
  core/
    color.dart
    theme.dart
    routes.dart
    di.dart
  constants/
    api.dart
    assets.dart
    auth.dart
    gang.dart
    notification.dart
  components/
    ui/
      button.dart
      input.dart
    layout/
  services/
    api_client.dart
    local_storage.dart
  utils/
    error.dart
    try_catch.dart
  features/
    auth/
      cubit/
        auth_cubit.dart
        auth_state.dart
      models/
        user.dart
        user_activity.dart
      pages/
        login_page.dart
        onboarding_page.dart
        edit_profile_page.dart
      repo/
        auth_endpoints.dart
        auth_repo.dart
    notification/
      models/
        notification.dart
      cubit/
      pages/
      repo/
    setting/
      pages/
        setting_page.dart
      cubit/
```

Use this shape for every mobile feature (strictly flat, matching the backend DDD style, with one file per entity):

```text
features/[feature]/
  [entity_name].model.dart // e.g. branch.model.dart
  [feature].repo.dart
  [feature].cubit.dart
  [feature].state.dart
  [feature].page.dart
  [feature].constant.dart
```

Note: Sub-directories are generally discouraged now to keep the mobile and API repos fully synchronized in style. Only `components/ui` exists globally for reusable primitives such as buttons and inputs. Feature-only widgets must live inside the flat `features/[feature]/` directory. Shared services belong in `services`. Cross-feature helpers belong in `utils`. App-wide routing, theme, dependency setup, and colors belong in `core`. App-wide constants belong in `constants`.

## 3. Application Startup

`main.dart` is responsible for Flutter initialization and app bootstrapping.

Current flow:

1. `WidgetsFlutterBinding.ensureInitialized()` runs before app startup.
2. `runApp(const MyApp())` starts the app.
3. `MyApp` wraps `MaterialApp` in `ScreenUtilInit`.
4. `ScreenUtilInit` uses the current design size `Size(411.42857142857144, 843.4285714285714)`.
5. `MaterialApp` disables the debug banner, applies `AppTheme.lightTheme`, sets `initialRoute`, and uses `AppRoutes.routes`.

Startup standards:

- Keep `main.dart` small.
- Initialize app-level services before `runApp`.
- Keep visual configuration in `AppTheme`, route configuration in `AppRoutes`, and dependency wiring in `core/di.dart`.
- Do not put feature logic in `main.dart`.
- If Cubit providers become global, wrap `MaterialApp` with `MultiBlocProvider` from the app root.

## 4. Routing Standard

Routes are centralized in `core/routes.dart`.

Current pattern:

```dart
class AppRoutes {
  static const String login = '/login';

  static Map<String, WidgetBuilder> get routes => {
    login: (context) => const LoginPage(),
  };
}
```

Route standards:

- Every route path is a `static const String`.
- Every registered screen is added to `routes`.
- Route names use kebab-case paths, for example `/edit-profile`.
- Page classes use PascalCase and end with `Page`.
- Use `Navigator.pushNamed`, `Navigator.pushReplacementNamed`, and `Navigator.pop` unless a flow requires typed arguments.
- If a route accepts arguments, validate the type at the page boundary and fail gracefully with a user-safe fallback.
- Do not create anonymous route strings inside pages.

## 5. Theme, Color, and UI Tokens

`core/color.dart` owns app colors. `core/theme.dart` owns `ThemeData`.

Current colors:

- `AppColors.primaryIndigo`
- `AppColors.pureWhite`
- `AppColors.deepOnyx`
- `AppColors.softGrey`
- `AppColors.googleRed`
- `AppColors.facebookBlue`
- `AppColors.appleBlack`
- `AppColors.emailIndigo`
- `AppColors.statusGreen`
- `AppColors.textPrimary`
- `AppColors.textSecondary`
- `AppColors.textOnDark`

Current theme:

- Material 3 is enabled.
- `ColorScheme.fromSeed` uses `primaryIndigo`.
- App background is `pureWhite`.
- Typography uses `GoogleFonts.outfitTextTheme`.
- Main text sizes are `32.sp`, `24.sp`, `16.sp`, and `14.sp`.
- Elevated buttons default to full width, `56.h` height, `16.r` radius, and Outfit `16.sp` semi-bold text.

UI standards:

- Use `AppColors` instead of raw color values.
- Use `Theme.of(context).textTheme` for text whenever the target style already exists.
- Use `GoogleFonts.outfit` only when a local style is genuinely different from the theme.
- Use `flutter_screenutil` on dimensions:
  - Horizontal sizes and widths use `.w`.
  - Vertical sizes and heights use `.h`.
- Font sizes use `.sp`.
  - Radii use `.r`.
- The circular indicator should be 2 strokewidth and very small and center the page
- Use `AppDialog.showConfirmation` for destructive or important actions like sign out, request to join, withdraw, and create branch. It is a reusable generic component.
- Follow `contexts/ui_standard.md` for visual style.
- Do not introduce hardcoded spacing systems that conflict with the existing `24.w`, `40.h`, `16.r`, and `56.h` rhythm.
- For loading states: Widgets like buttons must use a thin circular indicator inside them. For the whole page or major widgets, use a shimmer loading effect. The shimmer widget must be the exact size of the upcoming widget.

## 6. Constants Standard

Constants are grouped by domain.

Current examples:

- `ApiConstants` owns base URL and timeouts.
- `AppAssets` owns image and icon paths.
- `AuthConstants` owns auth activity modules and activity types.
- `Permissions` owns permission strings.
- `NotificationConstants` owns notification modules and types.

Standards:

- Never duplicate route paths, endpoint paths, asset paths, permission strings, module names, or status values in feature code.
- Endpoint constants live beside their repository in `features/[feature]/repo/[feature]_endpoints.dart`.
- App-wide constants live in `constants`.
- Feature-specific constants live in `features/[feature]/constants/` on mobile, split into `[feature].constant.dart` (for user-facing copy, statuses, default role names, and workflow labels), `[feature].endpoints.dart` (for endpoint paths), and `[feature].params.dart` (for payload/query parameter keys). For the API, they live in `[feature].constant.ts`.
  - **Auth Feature Constant Splitting**: Specifically, for the authentication/user feature on mobile (`apps/user`), you must use `user.constant.dart`, `user.endpoints.dart`, and `user.params.dart` inside the `features/auth/constants/` directory instead of `auth.dart` or `auth.constant.dart`.
- Constants must stay module-scoped. Do not put business constants in auth constants, auth constants in global constants, or endpoint paths in page files.
- **Every variable inside a constants file must use CAPITAL_SNAKE_CASE (e.g., `static const String LOG_IN_OR_SIGN_UP = "..."`).**
- Backend enum values can stay uppercase when the server contract requires uppercase strings.
- **Strict No-Hardcoding Rule**: Absolutely no strings (e.g. error messages, validation texts, toast messages, status labels) should be hardcoded in UI Pages, Cubits, or Repositories. All human-readable strings must be maintained in the `constants` files.

## 6.1 Environment Configuration

Environment values must be centralized and typed through configuration wrappers.

Mobile standards:

- Load `.env` before dependency setup in `main.dart`.
- Mobile `.env` must be registered under `flutter.assets` in `pubspec.yaml`.
- Read mobile environment values through `core/config.dart`.
- API base URL, Google client ID, and Google server client ID must not be hardcoded in feature code.
- Constants such as `ApiConstants.baseUrl` may delegate to `AppConfig`, but repositories and pages must not read `dotenv` directly.

API standards:

- API environment values are parsed in `src/core/config.ts`.
- Prisma reads `DB_STRING` through `prisma.config.ts`.
- New required environment variables must be added to the Zod schema with explicit validation.
- Feature code must import `config` instead of reading `process.env` directly.

## 7. Models

Models live in `features/[feature]/models`.

Current model pattern:

- Immutable class with `final` fields.
- `const` constructor.
- `copyWith`.
- `factory Model.fromJson(Map<String, dynamic> json)`.
- `Map<String, dynamic> toJson()`.

Model standards:

- Model classes end with `Model`, for example `UserModel`.
- Use immutable `final` fields.
- Use `const` constructors when all fields are final.
- Use `copyWith` for state updates.
- Keep serialization inside the model.
- Parse arrays with explicit typing, for example `map<String>((x) => x.toString()).toList()`.
- Use default fallback values when the API field can be missing.
- Avoid putting UI labels, formatting, storage calls, HTTP calls, or Cubit logic inside models.
- Every mobile model field that mirrors a backend/database column must use the same snake_case name as the backend, for example `user_id`, `business_id`, `branch_id`, `role_id`, `shift_id`, `post_id`, `bank_details`, `requested_role_id`, and `reviewed_by_id`.
- Do not expose backend parity fields as lowerCamelCase aliases such as `userId`, `businessId`, `branchId`, `roleId`, `shiftId`, `postId`, `bankDetails`, `requestedRoleId`, or `reviewedById`.

Preferred new model style:

```dart
class UserModel {
  final String id;
  final String email;
  final String name;
  final String token;
  final String user_id;
  final String image;
  final String cover;
  final String bio;
  final String created_at;
  final String updated_at;

  const UserModel({
    required this.id,
    required this.email,
    required this.name,
    required this.token,
    required this.user_id,
    required this.image,
    required this.cover,
    required this.bio,
    required this.created_at,
    required this.updated_at,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['_id'] ?? json['id'] ?? '',
      email: json['email'] ?? '',
      name: json['name'] ?? '',
      token: json['token'] ?? '',
      user_id: json['user_id'] ?? '',
      image: json['image'] ?? '',
      cover: json['cover'] ?? '',
      bio: json['bio'] ?? '',
      created_at: json['created_at'] ?? '',
      updated_at: json['updated_at'] ?? '',
    );
  }
}
```

Every model must strictly expose snake_case backend fields, including `created_at` and `updated_at`. This enforces total database/backend API parity throughout the codebase, making serialization and deserialization extremely seamless. Do not use lowerCamelCase aliases for backend fields.

## 8. API Client

`services/api_client.dart` is the only place that creates and configures Dio.

Current behavior:

- Uses `ApiConstants.BASE_URL`.
- Uses connect and receive timeout constants.
- Sets JSON content type.
- Adds `LogInterceptor`.
- Adds `Authorization: Bearer <token>` from `LocalStorage`.
- Exposes `get`, `post`, `put`, and `delete`.
- Converts `DioException` into app exceptions.

API client standards:

- Feature repositories call `ApiClient`; pages and cubits do not call Dio directly.
- All requests go through `get`, `post`, `put`, or `delete`.
- Token injection stays in the request interceptor.
- Dio exceptions are mapped to domain exceptions in `_mapDioException`.
- `401` and `403` become `AuthException`.
- Timeout errors become `NetworkException`.
- Server responses become `ServerException`.
- Do not catch Dio errors in repositories unless the feature needs a special mapping.

Backend response note:

The backend success helper returns a wrapped response:

```json
{
  "status": "success",
  "message": "Success",
  "data": {}
}
```

Mobile repositories should unwrap `response.data['data']` when the endpoint returns this shape. If an endpoint returns a raw model, parse `response.data` directly. Do not guess silently. Confirm the endpoint contract and keep parsing consistent inside the repository.

## 9. Local Storage

`services/local_storage.dart` wraps `FlutterSecureStorage`.

Current behavior:

- `saveToken(String token)`
- `getToken()`
- `clearToken()`

Storage standards:

- Sensitive values use `FlutterSecureStorage`.
- Storage keys are private static constants.
- Repositories or auth/session services may use storage.
- UI pages must not read secure storage directly.
- If adding business, branch, employee, or permission context, add explicit typed methods such as `saveBusinessContext`, `getBusinessContext`, and `clearBusinessContext`.
- Do not scatter raw storage keys across the codebase.

## 10. Error and Result Handling

`utils/error.dart` defines app-level failures, exceptions, and operation status.

Current failure classes:

- `ServerFailure`
- `CacheFailure`
- `NetworkFailure`
- `AuthFailure`
- `ValidationFailure`

Current exception classes:

- `ServerException`
- `CacheException`
- `NetworkException`
- `AuthException`

`utils/try_catch.dart` defines:

```dart
typedef TaskResult<T> = Future<Either<Failure, T>>;
typedef SyncResult<T> = Either<Failure, T>;
```

Standards:

- Repository methods return `TaskResult<T>` for async work.
- Repository methods wrap work with `tryCatchAsync`.
- Synchronous risky parsing helpers can use `tryCatchSync`.
- Cubits consume `Either` with `fold`.
- Pages render state based on `OperationStatus`.
- Do not throw raw strings.
- Do not return nullable data and a separate error value when `TaskResult<T>` fits.
- Add new failure types only when the UI or flow needs different behavior.

## 11. Repository Layer

Repositories live in `features/[feature]/repo`.

Current auth pattern:

```dart
class AuthRepo {
  final ApiClient _apiClient;
  final LocalStorage _localStorage;

  AuthRepo({
    required ApiClient apiClient,
    required LocalStorage localStorage,
  })  : _apiClient = apiClient,
        _localStorage = localStorage;

  TaskResult<UserModel> loginWithGoogle(String idToken) async {
    return tryCatchAsync(() async {
      final response = await _apiClient.post(
        AuthEndpoints.googleLogin,
        data: {'idToken': idToken},
      );
      final user = UserModel.fromJson(response.data);
      await _localStorage.saveToken(user.token);
      return user;
    });
  }
}
```

Repository standards:

- Constructor dependencies are required and injected.
- Keep dependencies private and final.
- Use endpoint constants.
- Build request payloads in the repo or in a typed request model.
- Parse responses into models in the repo.
- Save or clear local data in the repo only when it is part of the operation contract.
- Return domain models, lists, or `void` wrapped in `TaskResult`.
- Do not import Flutter widgets into repositories.
- Do not navigate from repositories.
- Do not emit Cubit state from repositories.
- **Third-Party Encapsulation**: Any third-party integration logic (like Google Sign-In, Firebase Auth, or payment SDKs) must reside inside the Repository layer, not inside the Cubit layer. The Cubit should only call repository methods and react to success/failure.

Use these method names:

- `getCurrentUser`, `getById`, `getList`, `create`, `update`, `delete` for CRUD.
- `loginWithGoogle`, `logout`, `refreshSession` for auth/session actions.
- `sync`, `markAsRead`, `accept`, `reject`, `assign`, `complete` for workflow actions.

## 12. Cubit and State Layer

Cubits live in `features/[feature]/cubit`.

Current auth pattern:

- `AuthCubit extends Cubit<AuthState>`.
- Cubit receives `AuthRepo`.
- Methods emit loading state, await repository, then fold success or failure.
- State is immutable and updated with `copyWith`.
- Operation metadata uses `OperationInfo`.

Cubit standards:

- Cubit class ends with `Cubit`.
- State class ends with `State`.
- Cubits own feature interaction logic.
- Cubits do not perform direct HTTP calls.
- Cubits do not parse JSON.
- Cubits do not use `BuildContext`.
- Cubits do not navigate.
- Cubits emit loading before async operations when the UI needs progress.
- Cubits store one `OperationInfo` per independent operation, such as `loginInfo`, `logoutInfo`, `saveInfo`, or `deleteInfo`.
- Success updates the relevant data and operation status.
- Failure updates only the relevant operation status and error.
- **Toast Notifications**: Do not trigger toast notifications, snackbars, or alerts from the UI (Page/Widget layer). All notification and alert triggers must reside entirely in the Cubit layer (e.g. inside repository callbacks / results folding).
- **No Hardcoded Strings**: Do not hardcode failure messages or toast messages inside the Cubit. Retrieve all error and success messages from the appropriate constant file.

Standard Cubit method flow:

```dart
Future<void> saveProfile(ProfileInput input) async {
  emit(
    state.copyWith(
      saveInfo: const OperationInfo(status: OperationStatus.loading),
    ),
  );

  final result = await _profileRepo.saveProfile(input);

  result.fold(
    (failure) => emit(
      state.copyWith(
        saveInfo: OperationInfo(
          status: OperationStatus.error,
          error: failure,
        ),
      ),
    ),
    (profile) => emit(
      state.copyWith(
        profile: profile,
        saveInfo: const OperationInfo(status: OperationStatus.success),
      ),
    ),
  );
}
```

State standards:

- State classes are immutable.
- Use `const` constructors.
- Keep entity data separate from operation metadata.
- Implement `copyWith`.
- If equality is manual, update `operator ==` and `hashCode` whenever fields change.
- For nullable fields that need to be explicitly cleared, add a clear flag or a dedicated reset method. A simple `field ?? this.field` copyWith cannot clear nullable values.

## 13. Page and Widget Layer

Pages live in `features/[feature]/pages`.

Current page patterns:

- `LoginPage`, `OnboardingPage`, `EditProfilePage`, and `SettingPage` are `StatelessWidget`s.
- Pages use `Scaffold`.
- Auth/onboarding pages use `SafeArea`, `LayoutBuilder`, `SingleChildScrollView`, `ConstrainedBox`, `Padding`, `IntrinsicHeight`, `Column`, and `Spacer`.
- Form-like pages use `SingleChildScrollView`.
- App bars use `AppBar` with white background, zero elevation, no scrolled under elevation, centered title, and a back `IconButton`.
- Pages use `AppButton`, `AppInput`, `AppColors`, `AppRoutes`, and theme text styles.

Page standards:

- Page classes end with `Page`.
- Use `StatelessWidget` by default.
- Use `StatefulWidget` only for local controllers, focus nodes, animations, tab controllers, or lifecycle-sensitive UI state.
- Dispose every `TextEditingController`, `FocusNode`, `AnimationController`, and `ScrollController` created by a page.
- Use Cubit for feature state and business logic.
- Use local private widget methods for repeated layout blocks inside a single page.
- Promote repeated blocks used by multiple pages into `features/[feature]/components` or `components/ui`.
- Keep build methods readable by extracting sections when a screen grows.
- Do not call repositories from pages.
- Do not parse API responses in pages.
- Do not store auth tokens or business context in pages.
- **In-Widget Processing Indicators**: During any asynchronous or background processing, you must show a small, thin circular loading indicator directly inside the specific button or widget that triggered the action, rather than using full-screen overlays or blocked views.

Responsive layout standards:

- Wrap full-screen scrolling layouts in `SafeArea`.
- Use `LayoutBuilder` plus `ConstrainedBox(minHeight: constraints.maxHeight)` when a vertically centered screen also needs to scroll on small devices.
- Use `SingleChildScrollView` for forms and content that can overflow.
- Use `Spacer` only inside bounded columns.
- Use `SizedBox(height: value.h)` and `SizedBox(width: value.w)` for spacing.
- Keep horizontal page padding at `24.w` unless the design standard says otherwise.
- Avoid fixed pixel dimensions without ScreenUtil.

Navigation standards:

- Use route constants from `AppRoutes`.
- Use `pushReplacementNamed` for one-way onboarding transitions.
- Use `pop` for app-bar back behavior.
- Do not navigate from Cubits or repositories.

## 14. Shared UI Components

Current global components:

- `AppButton`
- `AppInput`
- `AppToggle`
- `AppBottomAction`

`AppButton` standards:

- Required `text` and `onPressed`.\n- Defaults to `AppColors.primaryGreen` background and white text.
- Supports optional `icon`.
- Supports full-width or content-width layout.
- Uses fixed `56.h` height.
- Uses `16.r` border radius.
- Uses centered text with ellipsis protection.

`AppBottomAction` standards:

- Located at `components/ui/bottom_action.dart`. Import: `package:mobile/components/ui/bottom_action.dart`.
- **Never** use a `Container` with a `Border(top: ...)` as a bottom button bar. Always use `AppBottomAction`.
- Wraps any `Widget` as its `child` (typically `AppButton`).
- Provides `24.w` horizontal + `24.h` bottom padding, upward shadow, and `16.r` clipped corners.
- Must be the last child in the page's root `Column`, after the `Expanded(SingleChildScrollView(...))`.

`AppInput` standards:

- Located at `components/ui/input.dart`. Import path: `package:mobile/components/ui/input.dart`.
- **Never** use raw `TextFormField` or `TextField` directly on any page or form. Always use `AppInput`.
- Required `hintText`.
- Optional: `controller`, `obscureText`, `keyboardType`, `prefixIcon`, `suffixIcon`, `onChanged`, `validator`, `maxLines`, `inputFormatters`, `enabled`, `readOnly`, `onTap`, `focusNode`.
- **Visual spec**: white (`AppColors.pureWhite`) background, `Border.all(color: Color(0xFFCCCCCC))` default border, `10.r` radius, `42.h` minimum height for single-line.
- **Focused state**: border transitions to `AppColors.primaryGreen`, width `1.5`, with `150ms` animated duration.
- **Text**: `14.sp`, `FontWeight.w700`, `AppColors.textPrimary`.
- **Hint**: `14.sp`, `FontWeight.w500`, `AppColors.textTertiary`.
- **Disabled state**: background becomes `AppColors.softGrey`.
- For multi-line inputs set `maxLines > 1`; height auto-expands.
- For read-only pickers (date, dropdown), set `readOnly: true` and `onTap` for the trigger. Add a `suffixIcon` to signal the tap affordance.
- Do not add extra wrappers or decoration around `AppInput` — the widget itself owns its border and background.

`AppToggle` standards:

- Located at `components/ui/toggle.dart`. Import path: `package:mobile/components/ui/toggle.dart`.
- **Never** use a raw `Switch` or a hand-rolled toggle row directly on any page or form. Always use `AppToggle`.
- Required: `label` (`String`), `value` (`bool`), `onChanged` (`ValueChanged<bool>`).
- **Visual spec**: exactly matches `AppInput` — `pureWhite` background, `Color(0xFFCCCCCC)` border, `10.r` radius, `42.h` height, `12.w` horizontal padding.
- Switch is `Transform.scale(scale: 0.8)` with `activeTrackColor: AppColors.primaryGreen`, white thumb both active and inactive.
- Label color switches from `textTertiary` (off) to `textPrimary` (on) to reinforce state.

Component standards:

- **Mandate Reusability**: Always check and utilize existing reusable widgets from `lib/core/widgets` (e.g., `ActionBottomSheet`, `ConfirmationDialog`) before constructing raw or generic Flutter elements (like `showModalBottomSheet` or `AlertDialog`) locally inside feature files.
- **Avoid Duplication**: If a generic layout pattern (like a bottom sheet menu or a confirmation modal) is used in multiple places, abstract it into a reusable component inside `lib/core/widgets` immediately instead of repeating the code.
- Global components must be generic and reusable.
- Feature-specific components must not be placed in `components/ui` or `core/widgets`.
- Components should receive values and callbacks through constructors.
- Components should not read repositories or services.
- Components may use `Theme.of(context)`, `AppColors`, and ScreenUtil.
- Keep text overflow safe in buttons, tiles, cards, and app bars.

## 15. Dependency Injection

`core/di.dart` is the standard location for shared dependency creation.

DI standards:

- Create shared service instances in `core/di.dart`.
- Keep constructor injection for repositories and cubits.
- Pages should receive Cubits through `BlocProvider` or route-level providers.
- Avoid creating a new `ApiClient` in multiple widgets.
- Avoid hidden global mutable state.
- New repositories, Cubits, and shared services must be registered in `setupDependencies`.
- Use `registerLazySingleton` for shared services such as `LocalStorage`, `ApiClient`, and external auth services.
- Use `registerFactory` for repositories and Cubits unless a feature has a clear need for a long-lived instance.
- Keep app root providers in `main.dart` limited to Cubits that are needed across startup, auth, routing, or multiple feature flows.

Recommended direction:

```dart
class AppDependencies {
  static final ApiClient apiClient = ApiClient();
  static final LocalStorage localStorage = LocalStorage();

  static AuthRepo authRepo() {
    return AuthRepo(
      apiClient: apiClient,
      localStorage: localStorage,
    );
  }
}
```

When this grows, move to a proper DI package only if the app complexity justifies it.

Current DI uses `GetIt` through `serviceLocator` and `AppDependencies`. New functionality must be exposed through `AppDependencies` only when pages or app root wiring need a clean construction entry point.

## 16. Feature Development Workflow

For a new mobile feature, implement in this flat order:

1. Add feature folder under `features/[feature]`.
2. Add models in `[feature].model.dart`.
3. Add endpoint constants in `[feature].endpoint.dart` (or bundled in `[feature].constant.dart`).
4. Add repository in `[feature].repo.dart`.
5. Add state in `[feature].state.dart`.
6. Add Cubit in `[feature].cubit.dart`.
7. Add feature UI/components directly in `[feature].page.dart` (or separate flat files if too large).
8. Register routes in `core/routes.dart`.
9. Wire dependencies in `core/di.dart` or route-level `BlocProvider`.
10. Verify UI against `contexts/ui_standard.md`.
11. Run analysis and tests.

## 17. Different Coding Situations

### Read-only screen

Use a page plus Cubit. The Cubit loads data through a repository. State contains the loaded entity or list plus a load operation.

Do:

- `loadInfo`
- `items`
- loading, success, empty, and error UI states

Do not:

- Fetch from inside `build`.
- Call Dio from the page.
- Store raw JSON in state.

### Form screen

Use `StatefulWidget` only when controllers or focus nodes are needed. Keep validation local if it is purely UI-level. Submit through Cubit.

Do:

- Create controllers in `State`.
- Dispose controllers.
- Convert controller values into a typed input or payload.
- Disable submit while the save operation is loading.

Do not:

- Save directly from the page to storage.
- Navigate before the Cubit reports success.
- Keep long business rules inside validators.

### Auth/session operation

Use `AuthRepo`, `LocalStorage`, and `AuthCubit`.

Do:

- Exchange external provider tokens in the repository.
- Save app token only after a successful login response.
- Clear token on logout.
- Emit a clean auth state after logout.

Do not:

- Store tokens in plain variables.
- Read tokens inside widgets.
- Parse Firebase or backend auth responses in pages.

### Returning authenticated user

Use a startup session gate page as the initial route.

Do:

- Verify the secure token through a protected backend endpoint such as `/auth/me`.
- Load business context through the business repository after the user session is verified.
- Save verified user and business context through `LocalStorage`.
- Redirect associated users directly to the dashboard.
- Redirect users with pending join requests to the pending request screen.
- Redirect users without business context or pending requests to onboarding.

Do not:

- Open the login page first when a valid token can be verified.
- Trust cached business context without refreshing permissions from the backend.
- Navigate from repositories or Cubits.

### Joining an existing business

Use the business feature end to end.

Do:

- Search businesses through `BusinessRepo.searchBusinesses`.
- Load branch options through `BusinessRepo.getBranches`.
- Submit join requests through a typed repository method.
- Store join request status strings in business constants.
- Keep approval endpoints protected on the backend.
- Check reviewer permissions server-side using `ALL` or `employee:write`.
- Create or assign the default `Employee` role during approval when no role is provided.
- Keep approval UI permission-gated from `BusinessContextModel.permissions`.

Do not:

- Let mobile decide whether approval is authorized.
- Create default roles, shifts, departments, or posts in mobile code.
- Hardcode request statuses or permission strings in pages.

### List screen

Use a list model in state and one operation for loading. Add separate operations for item-level actions when needed.

Do:

- Keep immutable list replacement in state.
- Use typed model lists.
- Show empty state when the list is empty after success.

Do not:

- Mutate the existing state list in place.
- Use `dynamic` lists in UI.

### Settings or menu screen

The current `SettingPage` uses private builder methods for section headers and setting tiles. This is acceptable for one screen.

Do:

- Use private methods such as `_buildSectionHeader`.
- Use route constants.
- Use `Switch`, `ListTile`, icons, and theme colors consistently.

Do not:

- Put route strings in tile callbacks.
- Duplicate the same tile design across multiple settings pages. Promote it to a component.

### Local-only UI component

Keep it in the page as a private method if it is used once. Move it to `features/[feature]/components` if another page needs it.

### Shared UI primitive

Place it in `components/ui` only when it is app-wide, theme-aligned, and not tied to a specific feature domain.

## 18. Naming Standard

Files:

- `snake_case.dart`
- `[feature]_repo.dart`
- `[feature]_endpoints.dart`
- `[feature]_cubit.dart`
- `[feature]_state.dart`
- `[name]_page.dart`
- `[name]_model.dart`

Classes:

- `PascalCase`
- `AuthRepo`
- `AuthCubit`
- `AuthState`
- `UserModel`
- `LoginPage`
- `AppButton`

Methods and variables:

- `lowerCamelCase`
- Backend parity fields inside mobile models use snake_case and are the only exception to lowerCamelCase variable naming.
- Private fields and helpers start with `_`.
- Async methods return `Future` or `TaskResult`.
- Boolean names should read naturally, for example `isLoading`, `isAvailable`, `hasPermission`, `canEdit`.

Constants:

- New Dart constants should prefer lowerCamelCase.
- Preserve uppercase string values when they are backend enum values.
- Existing all-caps constant classes can continue that pattern for consistency inside the same file.

## 19. Import Standard

Use package imports for app files:

```dart
import 'package:mobile/core/color.dart';
import 'package:mobile/features/auth/models/user.dart';
```

Standards:

- Flutter and Dart imports first.
- Third-party package imports next.
- App package imports last.
- Avoid relative imports between feature folders.
- Do not import page files into repositories, models, services, or utils.
- Do not create circular imports between Cubit and page files.

## 20. Comment Policy

The repository execution rules require comment-free code.

Standards:

- Do not add code comments.
- Use clear names and small methods instead of comments.
- Do not add `ignore_for_file` comments in new code unless there is no clean code alternative.
- If a lint must be suppressed, prefer changing the code so the suppression is unnecessary.
- Markdown documentation can explain architecture and standards.

## 21. Current Codebase Observations To Preserve

Preserve these established patterns:

- Feature-based organization under `features`.
- Shared primitives under `components/ui`.
- Central route constants in `AppRoutes`.
- Central color tokens in `AppColors`.
- Central theme in `AppTheme`.
- ScreenUtil for all visual sizing.
- Dio wrapped by `ApiClient`.
- Secure token storage wrapped by `LocalStorage`.
- Repository methods returning `TaskResult<T>`.
- Cubits using `OperationInfo` and `OperationStatus`.
- Models using `fromJson`, `toJson`, and `copyWith`.

Improve these areas when touching related code:

- Align auth endpoints with backend route names. Mobile currently lists `/auth/google`, while the backend auth route currently exposes `/auth/login` and `/auth/refresh`.
- Align repository response parsing with backend wrapped responses.
- Move dependency construction into `core/di.dart`.
- Prefer exact snake_case backend field names in mobile models.
- Avoid new analyzer ignore comments.
- Replace hardcoded page copy with constants when reused or business-critical.
- Register every route referenced by pages. Some route constants exist without registered builders.

## 22. Verification

Before finishing mobile work:

1. Run `flutter analyze` from `apps/mobile`.
2. Run targeted Flutter tests when tests exist.
3. Manually check route registration for any page that was added or renamed.
4. Confirm new API calls use endpoint constants.
5. Confirm no raw Dio calls exist outside `ApiClient`.
6. Confirm no page imports a repository directly unless it is only constructing a provider at the route boundary.
7. Confirm every controller or focus node is disposed.
8. Confirm dimensions use ScreenUtil.
9. Confirm UI follows `contexts/ui_standard.md`.
10. Confirm new code is comment-free.

11. Confirm every singular icon floating widget is perfectly circular (e.g., shape: CircleBorder()).

- **Image Uploading**: Don't direct upload the image on selection, show it on UI and upon submit only upload and include the URL inside the entity doc.

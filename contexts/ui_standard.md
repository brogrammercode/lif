# User App — UI Standard

> This document is the single source of truth for every visual and structural decision made across
> the User App (`apps/user`). A coding agent that reads this document must be able to build a
> brand-new page that is **pixel-accurate** and **fully consistent** with every existing screen
> without ever looking at source code.

---

## 0. Core Files to Import on Every Page

```dart
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
```

---

## 0.5 Navigation & Interactivity Rules

1. **Nested Layout Navigation**: When clicking a secondary or tertiary nav item inside `HomeLayoutPage`, **do not** use `Navigator.push`. Update the layout's internal `_currentRoute` state to render the page directly inside the layout's `body`. This keeps the global layout navigation persistent.
2. **Pull to Refresh**: All data-fetching pages (lists, dashboards, etc.) must have their scrollable body wrapped in a `RefreshIndicator` that returns the Cubit's fetch method (e.g., `context.read<CoreHrCubit>().listEmployees()`). The indicator should match the app's theme colors.

---

## 1. Design System — Foundations

### 1.1 ScreenUtil Design Reference

The entire app is built inside a `ScreenUtilInit` wrapper with:

```dart
designSize: const Size(411.42857142857144, 843.4285714285714)
minTextAdapt: true
splitScreenMode: true
```

**Rules:**
- Every pixel width/height value → `.w` or `.h`
- Every font size → `.sp`
- Every border radius → `.r`
- Never use raw `double` literals for layout measurements
- The circular indicator should be 2 strokewidth, very small, and centered on the page

---

### 1.2 Color Palette (`AppColors` — `core/color.dart`)

| Token | Hex | Usage |
|-------|-----|-------|
| `AppColors.primaryGreen` | `#0F8244` | CTAs, active states, veg icons, primary buttons, active indicators |
| `AppColors.pureWhite` | `#FFFFFF` | Card backgrounds, scaffold bg, icon fills |
| `AppColors.deepOnyx` | `#1C1C1C` | Dark banners, floating menu pills, close avatars |
| `AppColors.softGrey` | `#F4F4F4` | Section dividers, input fill backgrounds |
| `AppColors.borderGrey` | `#E8E8E8` | All card/container borders, list separators |
| `AppColors.textPrimary` | `#1C1C1C` | Headings, item names, primary labels |
| `AppColors.textSecondary` | `#666666` | Subtitles, captions, secondary descriptions |
| `AppColors.textTertiary` | `#999999` | Hints, disabled text, section labels (ALL CAPS) |
| `AppColors.gold` | `#C99B3B` | Gold membership icon, promo page dots |
| `AppColors.goldLight` | `#FFF9E6` | Gold-themed container backgrounds |
| `AppColors.goldDark` | `#4D3600` | Dark gold text |
| `AppColors.shadowColor` | `#0A000000` | Subtle card shadow — used everywhere |

**One-off colors used inline (not in `AppColors`):**
- Blue accent (offers/links): `Color(0xFF2563EB)`
- Red action (auth buttons, login CTA): `Color(0xFFEF4F5F)`
- Zomato-red (badges, promos): `Color(0xFFEF4F5F)`
- Gold text on dark: `Color(0xFFFBD786)`
- Light red background (warnings, JioSaavn): `Color(0xFFFFF5F5)`
- Light red border (warnings): `Color(0xFFFFD1D1)`
- Gold promo background start: `Color(0xFFFFF5D1)`
- Green tint background: `Color(0xFFE8F5E9)` (veg labels, ADD button bg, applied states)
- Near & Fast icon color: `AppColors.primaryGreen`

---

### 1.3 Typography (`GoogleFonts.outfit`)

The app uses **Outfit** from Google Fonts globally — set in `AppTheme.lightTheme`.

| Role | Size | Weight | Color | Usage |
|------|------|--------|-------|-------|
| Store / Item Name (hero) | `22.sp` | w900 | textPrimary | Store page header title |
| Section heading (card title) | `18.sp` | w900 | textPrimary | Menu categories, bottom sheet titles |
| Card name / List title | `16.sp` | w800 | textPrimary | Dish names, restaurant names (large cards) |
| Body primary | `15.sp` | w700–w800 | textPrimary | Cart item names, search input active text |
| Subtitle / small label | `14.sp` | w700–w800 | textPrimary | Setting tile labels, payment method names |
| Caption / delivery info | `12.sp` | w600 | textSecondary | Distance, timing, address subtext |
| Micro label / section header | `12.sp` | w800 | textTertiary | ALL-CAPS section labels (`RECOMMENDED FOR YOU`, `SAVED ADDRESSES`) |
| Tiny badge / overlay text | `9–10.sp` | w800–w900 | pureWhite | Rating badges, promo overlay chips |
| Hint text | `14–15.sp` | w400–w500 | textTertiary | TextField placeholder text |

**ALL-CAPS Section Headers** pattern (used consistently across every page):
```dart
Text(
  'SECTION TITLE',
  style: TextStyle(
    fontSize: 12.sp,
    fontWeight: FontWeight.w800,
    color: AppColors.textTertiary,
    letterSpacing: 0.8,
  ),
)
```

---

### 1.4 Spacing & Padding Rhythm

| Context | Value |
|---------|-------|
| Page horizontal padding | `16.w` |
| Card internal padding | `12.w–16.w` |
| Section vertical gap | `16.h–24.h` |
| Between list items | `12.h` |
| Between inline elements (icon + text) | `4.w–8.w` |
| Between major sections | `20.h–32.h` |
| Status bar offset | `MediaQuery.of(context).padding.top` |

---

### 1.5 Shadows

**Standard card shadow** — used on all floating cards, bottom navigation, search bars:
```dart
const BoxShadow(
  color: AppColors.shadowColor, // 0x0A000000
  blurRadius: 4,
  offset: Offset(0, 2),
)
```

**Elevated card shadow** — used on large restaurant cards, profile cards:
```dart
const BoxShadow(
  color: AppColors.shadowColor,
  blurRadius: 8,
  offset: Offset(0, 4),
)
```

**Deep shadow** — used on floating bottom navigation bar:
```dart
const BoxShadow(
  color: Colors.black12,
  blurRadius: 10,
  spreadRadius: 2,
  offset: Offset(0, 4),
)
```

---

## 2. Scaffold Structure

Every page follows this exact structure:

```dart
Scaffold(
  backgroundColor: AppColors.pureWhite,  // or Color(0xFFFAFAFA) for secondary pages
  body: Column(
    children: [
      SizedBox(height: MediaQuery.of(context).padding.top),
      _buildAppBar(context),
      Expanded(
        child: SingleChildScrollView(
          child: Column(children: [ ... ]),
        ),
      ),
    ],
  ),
)
```

**Background color rules:**
- `AppColors.pureWhite` → Login, Home, Search, Search Result, Store
- `Color(0xFFFAFAFA)` → Cart, Payment, Settings (secondary/detail pages)

**Never** use `Scaffold.appBar`. All app bars are manual widgets inside the body `Column`.

---

## 3. App Bar Patterns

### 3.1 Back Arrow Only (Settings, Cart, Payment)
```dart
Container(
  color: AppColors.pureWhite, // or Color(0xFFFAFAFA)
  padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
  alignment: Alignment.centerLeft,
  child: GestureDetector(
    onTap: () => Navigator.pop(context),
    child: Icon(Icons.arrow_back, color: AppColors.textPrimary, size: 24.w),
  ),
)
```

### 3.2 Back Arrow with Title + Actions (Store, Search)
```dart
Padding(
  padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8.h),
  child: Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      GestureDetector(
        onTap: () => Navigator.pop(context),
        child: Container(
          padding: EdgeInsets.all(8.w),
          decoration: const BoxDecoration(
            color: AppColors.pureWhite,
            shape: BoxShape.circle,
            boxShadow: [ BoxShadow(color: AppColors.shadowColor, blurRadius: 4, offset: Offset(0, 2)) ],
          ),
          child: Icon(Icons.chevron_left, color: AppColors.textPrimary, size: 24.w),
        ),
      ),
      // ... action buttons
    ],
  ),
)
```

### 3.3 Chevron Back with Inline Search Bar (Search, Search Result)
```dart
Padding(
  padding: EdgeInsets.symmetric(horizontal: 16.w),
  child: Row(
    children: [
      GestureDetector(
        onTap: () => Navigator.pop(context),
        child: Icon(Icons.chevron_left, color: AppColors.primaryGreen, size: 32.w),
      ),
      SizedBox(width: 8.w),
      Expanded(child: _searchInputContainer()),
    ],
  ),
)
```

**Note:** The back arrow is `AppColors.primaryGreen` and `32.w` on Search/SearchResult pages.

---

## 4. Common Reusable Widgets

### 4.1 Standard Form Input (`AppInput`)

The `AppInput` widget in `components/ui/input.dart` is the **only** input component used for all text fields throughout the app. **Do not use raw `TextFormField` or `TextField` directly on any page or form.**

**Visual spec:**
- Height: `42.h` (single-line), auto-height for `maxLines > 1`
- Background: `AppColors.pureWhite`
- Border: `Border.all(color: Color(0xFFCCCCCC))`, width `1`
- Border radius: `10.r`
- Focused border: `AppColors.primaryGreen`, width `1.5`, animated transition `150ms`
- Horizontal padding: `12.w`
- Text: `14.sp`, `FontWeight.w700`, `AppColors.textPrimary`
- Hint text: `14.sp`, `FontWeight.w500`, `AppColors.textTertiary`
- Inner `TextField` uses `InputBorder.none`, `isDense: true`

**Usage:**
```dart
import 'package:mobile/components/ui/input.dart';

// Simple
AppInput(hintText: 'Branch Name', controller: _nameController)

// With prefix icon
AppInput(
  hintText: 'Search...',
  prefixIcon: Icon(Icons.search, color: AppColors.textTertiary, size: 18.w),
  controller: _searchController,
)

// Multi-line
AppInput(hintText: 'Notes', controller: _notesController, maxLines: 4)

// Read-only (e.g. date picker trigger)
AppInput(
  hintText: 'Select Date',
  controller: _dateController,
  readOnly: true,
  onTap: () => _pickDate(context),
  suffixIcon: Icon(Icons.calendar_today, color: AppColors.textTertiary, size: 16.w),
)
```

**Available parameters:**
| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `hintText` | `String` | required | Placeholder text |
| `controller` | `TextEditingController?` | null | Field controller |
| `obscureText` | `bool` | false | Password masking |
| `keyboardType` | `TextInputType` | text | Keyboard variant |
| `prefixIcon` | `Widget?` | null | Leading icon inside field |
| `suffixIcon` | `Widget?` | null | Trailing icon inside field |
| `onChanged` | `ValueChanged<String>?` | null | Text change callback |
| `validator` | `String? Function(String?)?` | null | Validation function |
| `maxLines` | `int` | 1 | Textarea rows |
| `inputFormatters` | `List<TextInputFormatter>?` | null | Input constraints |
| `enabled` | `bool` | true | Enabled/disabled state |
| `readOnly` | `bool` | false | Read-only (triggers `onTap`) |
| `onTap` | `VoidCallback?` | null | Tap callback (use with readOnly) |
| `focusNode` | `FocusNode?` | null | External focus control |

### 4.1a Search Bar Container
The search bar on the Home/Search pages is a **specialized** pattern (not `AppInput`) — it has an embedded `TextField` directly inside a `Container`:
```dart
Container(\n  height: 42.h,\n  padding: EdgeInsets.symmetric(horizontal: 16.w),
  decoration: BoxDecoration(
    color: AppColors.pureWhite,
    borderRadius: BorderRadius.circular(12.r),
    border: Border.all(color: AppColors.borderGrey),
    boxShadow: const [
      BoxShadow(color: AppColors.shadowColor, blurRadius: 4, offset: Offset(0, 2)),
    ],
  ),
  child: Row(
    children: [
      Expanded(
        child: TextField(
          style: TextStyle(fontSize: 15.sp, color: AppColors.textPrimary),
          decoration: InputDecoration(
            hintText: '...',
            hintStyle: TextStyle(color: AppColors.textTertiary, fontSize: 15.sp),
            border: InputBorder.none,
            isDense: true,
            contentPadding: EdgeInsets.zero,
          ),
        ),
      ),
      Container(height: 20.h, width: 1.w, color: AppColors.borderGrey),
      SizedBox(width: 12.w),
      Icon(Icons.mic, color: AppColors.primaryGreen, size: 22.w),
    ],
  ),
)
```

### 4.2 Toggle Row (`AppToggle`)

The `AppToggle` widget in `components/ui/toggle.dart` is the **only** component used for boolean toggle fields across all forms. It **matches the `AppInput` visual spec exactly** — same height, border, background, and radius.

**Visual spec:**
- Height: `42.h`
- Background: `AppColors.pureWhite`
- Border: `Border.all(color: Color(0xFFCCCCCC))`, width `1`
- Border radius: `10.r`
- Horizontal padding: `12.w`
- Label text: `14.sp`, `FontWeight.w500`, `AppColors.textTertiary` (inactive) / `AppColors.textPrimary` (active)
- Switch: scaled `0.8`, `activeTrackColor: AppColors.primaryGreen`, white thumb

**Usage:**
```dart
import 'package:mobile/components/ui/toggle.dart';

AppToggle(
  label: BranchConstant.IS_HQ_LABEL,
  value: _isHq,
  onChanged: (val) => setState(() => _isHq = val),
)
```

### 4.3 Center-Docked Floating Bottom Action (`AppBottomAction`)

Every page that has a primary CTA button at the bottom must use `AppBottomAction`. This replaces the old pattern of a `Container` with a `borderGrey` top border.

**Import:** `package:mobile/components/ui/bottom_action.dart`

**Visual spec:**
- `24.w` horizontal padding (centers and narrows the button slightly from screen edges)
- `24.h` bottom padding (lifts it off the edge)
- Upward diffuse shadow: `black 8% opacity`, `blurRadius: 16`, `offset: (0, -4)`
- Button is clipped to `16.r` rounded corners via `ClipRRect`
- No background fill — floats over the scroll content

**Usage:**
```dart
import 'package:mobile/components/ui/bottom_action.dart';

// Inside the Column that contains Expanded(scroll) + bottom:
AppBottomAction(
  child: AppButton(
    text: 'Save',
    isLoading: isLoading,
    onPressed: _onSave,
  ),
),
```

**Page structure with AppBottomAction:**
```dart
Scaffold(
  body: SafeArea(
    child: Column(
      children: [
        _buildAppBar(context),
        _buildPageTitle(),
        Expanded(
          child: SingleChildScrollView(
            padding: EdgeInsets.symmetric(horizontal: 24.w, vertical: 8.h),
            child: Column(children: [ /* form fields */ ]),
          ),
        ),
        AppBottomAction(
          child: AppButton(text: 'Submit', onPressed: _onSubmit),
        ),
      ],
    ),
  ),
)
```

> [!IMPORTANT]
> Never use a `Container` with `Border(top: BorderSide(...))` as a bottom button bar. Always use `AppBottomAction`.

---

### 4.4 Filter Chip

Used on Home, Search Result, and Store pages. Identical implementation:
```dart
Container(
  margin: EdgeInsets.only(right: 8.w),
  padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8.h),
  decoration: BoxDecoration(
    color: AppColors.pureWhite,
    borderRadius: BorderRadius.circular(10.r),
    border: Border.all(color: AppColors.borderGrey),
  ),
  child: Row(
    children: [
      if (hasIcon) ...[
        Icon(iconData, size: 14.w, color: iconColor ?? AppColors.textSecondary),
        SizedBox(width: 4.w),
      ],
      Text(label, style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.w600, color: AppColors.textPrimary)),
      if (hasDropdown) ...[
        SizedBox(width: 4.w),
        Icon(Icons.keyboard_arrow_down, size: 14.w, color: AppColors.textSecondary),
      ],
    ],
  ),
)
```
- Wrap all chips in a `SingleChildScrollView(scrollDirection: Axis.horizontal)`.

### 4.3 Green Rating Badge (overlay on cards)
```dart
Container(
  padding: EdgeInsets.symmetric(horizontal: 6.w, vertical: 3.h),
  decoration: BoxDecoration(
    color: AppColors.primaryGreen,
    borderRadius: BorderRadius.circular(6.r),
  ),
  child: Row(
    children: [
      Text(rating.toString(), style: TextStyle(color: AppColors.pureWhite, fontSize: 9.sp, fontWeight: FontWeight.w900)),
      SizedBox(width: 2.w),
      Icon(Icons.star, color: AppColors.pureWhite, size: 9.w),
    ],
  ),
)
```

### 4.4 Veg/Non-Veg Indicator Dot
```dart
Container(
  width: 14.w,
  height: 14.w,
  decoration: BoxDecoration(
    border: Border.all(color: Colors.green, width: 1.5),
    color: AppColors.pureWhite,
    borderRadius: BorderRadius.circular(2.r),
  ),
  alignment: Alignment.center,
  child: Container(
    width: 6.w,
    height: 6.w,
    decoration: const BoxDecoration(color: Colors.green, shape: BoxShape.circle),
  ),
)
```

### 4.5 Green Quantity Stepper (Cart, Store Customisation)
```dart
Container(
  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
  decoration: BoxDecoration(
    border: Border.all(color: AppColors.primaryGreen),
    borderRadius: BorderRadius.circular(8.r),
    color: const Color(0xFFE8F5E9),
  ),
  child: Row(
    children: [
      GestureDetector(onTap: onDecrement, child: Icon(Icons.remove, color: AppColors.primaryGreen, size: 14.w)),
      SizedBox(width: 12.w),
      Text(count.toString(), style: TextStyle(fontSize: 13.sp, fontWeight: FontWeight.w900, color: AppColors.primaryGreen)),
      SizedBox(width: 12.w),
      GestureDetector(onTap: onIncrement, child: Icon(Icons.add, color: AppColors.primaryGreen, size: 14.w)),
    ],
  ),
)
```

### 4.6 Primary CTA Button (full-width green)
```dart
SizedBox(
  width: double.infinity,
  height: 48.h,
  child: ElevatedButton(
    onPressed: onPressed,
    style: ElevatedButton.styleFrom(
      backgroundColor: AppColors.primaryGreen,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10.r)),
      elevation: 0,
    ),
    child: Text(label, style: TextStyle(fontSize: 15.sp, fontWeight: FontWeight.w800, color: AppColors.pureWhite)),
  ),
)
```

### 4.7 Circular Icon Button with Shadow
```dart
Container(
  padding: EdgeInsets.all(8.w),
  decoration: const BoxDecoration(
    color: AppColors.pureWhite,
    shape: BoxShape.circle,
    boxShadow: [ BoxShadow(color: AppColors.shadowColor, blurRadius: 4, offset: Offset(0, 2)) ],
  ),
  child: Icon(Icons.bookmark_border, color: AppColors.textPrimary, size: 18.w),
)
```

### 4.8 Small Colored Label Badge (text-only, no image)
```dart
Container(
  padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
  decoration: BoxDecoration(
    color: const Color(0xFFE8F5E9),  // adjust per context
    borderRadius: BorderRadius.circular(6.r),
  ),
  child: Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(Icons.eco, color: AppColors.primaryGreen, size: 12.w),
      SizedBox(width: 4.w),
      Text('Pure Veg restaurant', style: TextStyle(fontSize: 9.sp, fontWeight: FontWeight.w700, color: AppColors.primaryGreen)),
    ],
  ),
)
```

### 4.9 Section Divider (grey line)
```dart
Container(height: 1.h, color: AppColors.borderGrey)
```

### 4.10 Section Block Separator (thick grey fill)
```dart
Container(height: 8.h, color: AppColors.softGrey)
```

### 4.11 Modal Bottom Sheet Close Button (floating dark circle)
Always positioned at `deviceHeight * 0.18` from top of the stack, centered:
```dart
Positioned(
  top: deviceHeight * 0.18,
  left: 0,
  right: 0,
  child: Center(
    child: GestureDetector(
      onTap: () => Navigator.pop(context),
      child: CircleAvatar(
        backgroundColor: AppColors.deepOnyx,
        radius: 20.r,
        child: Icon(Icons.close, color: AppColors.pureWhite, size: 20.w),
      ),
    ),
  ),
)
```

### 4.12 Page Dot Indicator (carousel dots)
```dart
Row(
  mainAxisAlignment: MainAxisAlignment.center,
  children: List.generate(totalCount, (index) {
    final isActive = activeIndex == index;
    return Container(
      width: 6.w,
      height: 6.w,
      margin: EdgeInsets.symmetric(horizontal: 3.w),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isActive ? AppColors.pureWhite : AppColors.pureWhite.withValues(alpha: 0.4),
        // Or: isActive ? AppColors.gold : AppColors.borderGrey  (for home page)
      ),
    );
  }),
)
```

### 4.13 Action Bottom Sheet Menu (Global Menu Pattern)
All `Icons.more_vert` buttons (or similar menu icons) across the application must trigger a standard bottom sheet instead of an inline dropdown. The bottom sheet must use the `ActionBottomSheet` widget located in `lib/core/widgets/action_bottom_sheet.dart`.

```dart
import 'package:mobile/core/widgets/action_bottom_sheet.dart';

// Example usage
ActionBottomSheet.show(
  context,
  title: 'Category Options',
  subtitle: 'Manage your category',
  actions: [
    BottomSheetAction(
      label: 'Add Category',
      icon: Icons.add_circle_outline,
      onTap: () {
        Navigator.pop(context);
        Navigator.pushNamed(context, '/create-category', arguments: branchId);
      },
    ),
  ],
);
```

---

## 5. Page-by-Page UI Breakdown

### 5.1 Login Page (`/login`)

**Structure:**
- `Scaffold(backgroundColor: AppColors.pureWhite)`
- `SingleChildScrollView → SizedBox(height: screenHeight) → Column`
- Top: `_buildTopCarousel()` — takes 45% of screen height
- Bottom: `Expanded` with inner `Column(mainAxisAlignment: spaceBetween)`

**Top Carousel:**
- `SizedBox(height: MediaQuery.of(context).size.height * 0.45)`
- `Stack`: PageView + gradient overlay + dot indicator
- Gradient overlay: `LinearGradient` black top `0.6 → transparent 0.5 → black 0.75`
- Text bottom-left: `26.sp`, `w900`, white, `letterSpacing: 0.5`
- Below text: either a Zomato-red rounded badge (`Color(0xFFEF4F5F)`, `6.r`) or a blue `%` circle
- Dot indicator: `Positioned(bottom: 16.h)` — white filled vs. `white.withValues(alpha: 0.4)`

**Bottom Panel (Expanded):**
- Section label `'Choose your account'`: `14.sp`, `w800`, textSecondary
- Profile selection card: white, `12.r` border `Color(0xFFE8E8E8)`, avatar `20.r` + name `14.sp w800` + phone `12.sp w500` + trailing `Icons.more_vert`
- Section label `'Log in or sign up'`: `12.sp`, `w700`, textTertiary
- Phone input field (see §4 for pattern)
- Remember me checkbox: custom `18.w` square, red when checked `Color(0xFFEF4F5F)`, `4.r` radius
- Continue button: `48.h`, red `Color(0xFFEF4F5F)`, `10.r`
- Social row: two `44.w` circles, white background, `Color(0xFFE8E8E8)` border, shadow
- Footer: centered `10.sp` grey text + underlined links `10.sp`, `w700`

---

### 5.2 Home Page (`/`)

**Structure:**
- `Scaffold(body: Stack)` — no backgroundColor override (uses theme white)
- `Positioned.fill → SingleChildScrollView` (main scroll area)
- `Positioned` floating tooltip (dismissible)
- `Positioned` floating bottom nav bar

**Header Section:**
- Full-width gradient container: `Color(0xFFFFF5D1)` → `AppColors.pureWhite` (stops: `0.3`, `1.0`)
- Location row: `Icons.location_on` (20.w, textPrimary) + location label `18.sp w900` + `Icons.keyboard_arrow_down`
- Subtitle address: `12.sp`, w500, textSecondary, truncated with ellipsis
- Top-right cluster: Gold badge pill + gift icon circle + avatar circle (36.w, tappable → `/setting`)

**Gold Badge Pill:**
```dart
Container(
  padding: EdgeInsets.symmetric(horizontal: 10.w, vertical: 4.h),
  decoration: BoxDecoration(
    color: AppColors.pureWhite,
    borderRadius: BorderRadius.circular(20.r),
    border: Border.all(color: const Color(0xFFF1C40F), width: 1.5),
    boxShadow: [BoxShadow(color: AppColors.shadowColor, blurRadius: 4, offset: Offset(0, 2))],
  ),
  child: Column(mainAxisSize: MainAxisSize.min, children: [
    Text('GOLD', style: TextStyle(fontSize: 8.sp, fontWeight: FontWeight.w900, color: Color(0xFFD4AC0D), letterSpacing: 0.5, height: 1.0)),
    Text('₹1', style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.w900, color: Color(0xFFD4AC0D), height: 1.1)),
  ]),
)
```

**Search Bar Row:**
- `48.h` container, `12.r` radius, shadow, `Icons.search` (green 22.w) + hint text + divider + `Icons.mic` (green 22.w)
- Right: VEG MODE toggle — `8.sp` ALL-CAPS label + `Switch` scaled via `FittedBox(fit: BoxFit.fill)` inside `SizedBox(36.w × 20.h)`
- Switch colors: `activeTrackColor: AppColors.primaryGreen`, `inactiveTrackColor: AppColors.softGrey`, white thumb

**Promo Banners (PageView):**
- `180.h` height, full-width
- Card: `16.w` horizontal margin, `16.r` radius, network image with `ColorFilter(Colors.black.withValues(alpha: 0.2), BlendMode.darken)`
- Overlay text: `26.sp w900` title + `16.sp w700` subtitle (both white, with shadow)
- CTA pill: white `24.r` rounded, `12.sp w900` dark text
- Dot row below: active = `AppColors.gold`, inactive = `AppColors.borderGrey`

**Category Horizontal Scroll:**
- Special Card: `72.w × 72.w`, `12.r`, blue gradient (`Color(0xFFE0F2FE)` → `Color(0xFFBAE6FD)`), `1.5` border `Color(0xFF0284C7)`, 3-line text stack
- Standard Category: `64.w` circle image, `12.sp` label, `3.h × 40.w` green underline if selected

**Sections (all `horizontal: 16.w` padding):**
- `RECOMMENDED FOR YOU` ALL-CAPS header → 3-column grid (`childAspectRatio: 0.62`)
- `EXPLORE MORE` ALL-CAPS header → 4-column grid (`childAspectRatio: 0.85`)
- `226 RESTAURANTS DELIVERING TO YOU` → vertical large card list

**Bottom Floating Navigation:**
```dart
Positioned(
  bottom: 16.h, left: 24.w, right: 24.w,
  child: Container(
    height: 58.h,
    decoration: BoxDecoration(
      color: AppColors.pureWhite,
      borderRadius: BorderRadius.circular(30.r),
      boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 10, spreadRadius: 2, offset: Offset(0, 4))],
    ),
    child: Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
      // Active tab: green capsule bg
      Container(
        padding: EdgeInsets.symmetric(horizontal: 14.w, vertical: 8.h),
        decoration: BoxDecoration(color: Color(0xFFE8F5E9), borderRadius: BorderRadius.circular(20.r)),
        child: Row(children: [
          Icon(Icons.delivery_dining, color: AppColors.primaryGreen, size: 20.w),
          SizedBox(width: 6.w),
          Text('Delivery', style: TextStyle(color: AppColors.primaryGreen, fontSize: 12.sp, fontWeight: FontWeight.w800)),
        ]),
      ),
      // Inactive tabs: no background, textSecondary icons/labels
    ]),
  ),
)
```

---

### 5.3 Search Page (`/search`)

**Structure:** `Scaffold(backgroundColor: pureWhite) → Column(fixed header + Expanded scroll)`

- Status bar offset + `10.h` top gap
- Search bar row (chevron-left green `32.w` + search container `48.h`)
- Scrollable body:
  - `'Think it, search it'` — italic, `Color(0xFFEC4899)`, `16.sp w700`
  - Horizontal suggestion chips: `20.r` border, white bg, pink sparkle icon `Icons.auto_awesome` (`14.w`)
  - `WHAT'S ON YOUR MIND?` ALL-CAPS section
  - 3-column circle food grid: shadowed circle images, `12.sp w700` labels

---

### 5.4 Search Result Page (`/search-result`)

**Structure:** Same fixed header + scroll as Search page

- Search bar with `Icons.close` (`18.w`, textTertiary) clear button
- Sub-category horizontal tabs: `56.w` circle images + label + `3.h × 36.w` green underline for selected
- Double-row filter chips (two independent horizontal scrolls, `8.h` gap between)
- `RECOMMENDED FOR YOU` → 3-column grid (`childAspectRatio: 0.62`)
- `ALL RESTAURANTS` → vertical large restaurant card list (`200.h` image, `16.r` card radius)

**Large Restaurant Card specifics:**
- `200.h` image (top `16.r` radius only)
- Top-left: dark overlay capsule with veg dot + dish spotlight text
- Top-right: white circle bookmark icon
- Top-right-2: `Ad` translucent badge if sponsored
- Bottom-right: 4 dot pagination indicators (white)
- Info section (`12.w` padding): name `16.sp w800` + green rating badge + time `12.sp w600` + divider + blue offer icon + offer text + optional Pure Veg green badge

---

### 5.5 Store Page (`/store`)

**Structure:** `Scaffold → Stack(scroll content + floating menu button + floating cart bar)`

**Top Nav:**
- Back circle button (shadow, `8.w` padding) + right cluster: Search pill + More circle button

**Store Detail Block:**
- Pure veg badge (eco icon) → store name `22.sp w900` + `Icons.info_outline` `18.w` → rating badge
- Location: `Icons.location_on_outlined` `14.w` + `distance • locality` `12.sp w600 textSecondary`
- Time: `Icons.access_time` `14.w` + `time • schedule` + `Icons.keyboard_arrow_down`
- Complaints tag: white bordered pill with `Icons.check_circle_outline` green
- Divider → offer row: blue `Icons.local_offer` + offer text + `total offers` text + `keyboard_arrow_down`

**Filter Row:** Single horizontal scroll (same filter chip pattern)

**Menu Section:**
- Category header: `18.sp w900` + `Icons.keyboard_arrow_up/down` toggle → expandable
- Dish list item: veg dot + name `16.sp w800` + green progress bar badge + price `15.sp w800` + description `11.sp` + icon actions (bookmark + share circles)
- Right column: `120.w × 120.w` image (`16.r`) + floating ADD button (`90.w × 36.h`) overlapping image bottom

**ADD Button on dish card:**
```dart
Positioned(
  bottom: -15.h,
  child: Container(
    width: 90.w, height: 36.h,
    decoration: BoxDecoration(
      color: const Color(0xFFE8F5E9),
      borderRadius: BorderRadius.circular(8.r),
      border: Border.all(color: AppColors.primaryGreen, width: 1.w),
      boxShadow: [BoxShadow(color: AppColors.shadowColor, blurRadius: 4, offset: Offset(0, 2))],
    ),
    child: ElevatedButton(
      style: ElevatedButton.styleFrom(backgroundColor: Color(0xFFE8F5E9), elevation: 0),
      child: Row(children: [
        Text('ADD', style: TextStyle(fontSize: 13.sp, fontWeight: FontWeight.w900, color: AppColors.primaryGreen)),
        SizedBox(width: 4.w),
        Icon(Icons.add, color: AppColors.primaryGreen, size: 14.w),
      ]),
    ),
  ),
)
```

**Floating Menu Pill:**
```dart
Positioned(
  bottom: cartVisible ? 130.h : 24.h,
  left: 0, right: 0,
  child: Center(
    child: Container(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 10.h),
      decoration: BoxDecoration(
        color: AppColors.deepOnyx,
        borderRadius: BorderRadius.circular(30.r),
        boxShadow: [BoxShadow(color: Colors.black38, blurRadius: 8, offset: Offset(0, 4))],
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.restaurant_menu, color: AppColors.pureWhite, size: 16.w),
        SizedBox(width: 8.w),
        Text('Menu', style: TextStyle(color: AppColors.pureWhite, fontSize: 13.sp, fontWeight: FontWeight.w800)),
      ]),
    ),
  ),
)
```

**Bottom Cart Bar (two-part):**
- Top segment: `LinearGradient(Color(0xFFE3F2FD) → Color(0xFFF1F8E9))`, blue offer promo, rounded top only
- Bottom segment: green `AppColors.primaryGreen`, dish thumbnail + item count + `View cart ›`

---

### 5.6 Cart Page (`/cart`)

**Background:** `Color(0xFFFAFAFA)`

**Header:**
- `Icons.arrow_back` + store name `15.sp w900` + delivery estimate + address tap row + `Icons.share_outlined`
- Address row: `'30-35 mins to Title'` `11.sp w800` + `'| fullAddress'` `11.sp w600 textSecondary ellipsis` + `keyboard_arrow_down`

**JioSaavn Promo Box:**
- Light red container: `Color(0xFFFFF5F5)` bg, `Color(0xFFFFD1D1)` border, `16.r`, `16.w` margin
- Teal circle logo + text + lock/unlock ADD button (unlocks at ₹99 threshold)
- ADD/ADDED toggle: pill button, green border when added, lock icon when locked

**Cart Items List:**
- White container, veg dot indicator + item name `14.sp w800` + size info `11.sp w600` + green `Edit >` link
- Right: green quantity stepper + price `13.sp w800`
- Footer: `Icons.add_circle_outline` green + `'Add more items'` `13.sp w800 green`

**Horizontal Options Strip:**
- White bg, horizontal scroll, chips with `Icons.*_outlined` + label `11.sp w700 textSecondary`

**Discount Chip (conditional):**
- White, `12.r`, border, blue percent icon circle + `FLAT ₹125 OFF` `12.sp w800` + blue progress text

**Suggestions Carousel:**
- `140.h` horizontal list, `110.w` cards with `12.r` border, top image `70.h` + green `+` circle overlay
- Below image: name `10.sp w800` + price `10.sp w900`

**Gold Banner:**
- `Color(0xFFFFFBEB)` bg, `Color(0xFFFEF3C7)` border, `16.r`, `16.w` margin
- Gold icon + save text `12.sp w800` + subtitle `10.sp w600` + green APPLY/APPLIED button `90.w × 36.h`

**Zomato Money Row:**
- White bordered `16.r` container: red circle wallet icon + text column + `chevron_right`

**Sticky Footer:**
- White container, top border `1.h borderGrey`
- Left: `PAY USING` `9.sp w900 textTertiary` label + payment name `13.sp w900` + `arrow_drop_up`
- Right: `Expanded` → green `ElevatedButton` `48.h`, `10.r`, showing total + `'Place Order ›'`

---

### 5.7 Payment Page (`/payment`)

**Background:** `Color(0xFFFAFAFA)`

**App Bar:** `Icons.arrow_back` + `'Bill total: ₹X.XX'` `16.sp w900`

**Payment Group Pattern:**
ALL-CAPS section header `11.sp w800 textTertiary letterSpacing: 0.8`, followed by:
```dart
Container(
  margin: EdgeInsets.symmetric(horizontal: 16.w),
  decoration: BoxDecoration(
    color: AppColors.pureWhite,
    borderRadius: BorderRadius.circular(16.r),
    border: Border.all(color: AppColors.borderGrey),
  ),
  child: Column(
    children: List.generate(methods.length, (index) {
      return Container(
        decoration: BoxDecoration(
          border: index < methods.length - 1
              ? Border(bottom: BorderSide(color: AppColors.borderGrey, width: 1.h))
              : null,
        ),
        child: ListTile(
          leading: _buildMethodIcon(method.iconType), // 40.w × 28.h colored badge
          title: Text(method.name, style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w800)),
          trailing: Icon(Icons.chevron_right, color: AppColors.textSecondary, size: 18.w),
          onTap: () => Navigator.pop(context, method),
        ),
      );
    }),
  ),
)
```

**Method Icon Badge (40.w × 28.h):**
Colored rectangular badge with short label text `9.sp w900`. Each payment type has its own distinct background + text color combination.

**Groups shown:** RECOMMENDED → CARDS → PAY BY ANY UPI APP → WALLETS → PAY LATER

---

### 5.8 Settings Page (`/setting`)

**Background:** `Color(0xFFFAFAFA)`

**App Bar:** Back arrow only, `Color(0xFFFAFAFA)` bg

**Profile Card:**
```dart
Container(
  decoration: BoxDecoration(
    color: AppColors.pureWhite,
    borderRadius: BorderRadius.circular(16.r),
    boxShadow: [BoxShadow(color: AppColors.shadowColor, blurRadius: 10, offset: Offset(0, 4))],
  ),
  child: Column(children: [
    // Top: avatar 30.r + name 18.sp w900 letterSpacing 0.5 + "Edit profile >" green link
    Padding(padding: EdgeInsets.all(16.w), child: Row(children: [...])),
    // Bottom: dark onyx banner with gold membership renewal
    Container(
      padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 14.h),
      decoration: BoxDecoration(
        color: AppColors.deepOnyx,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(16.r)),
      ),
      child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Row(children: [
          Container(
            padding: EdgeInsets.all(4.w),
            decoration: const BoxDecoration(color: Color(0xFFC99B3B), shape: BoxShape.circle),
            child: Icon(Icons.workspace_premium, color: AppColors.deepOnyx, size: 14.w),
          ),
          SizedBox(width: 10.w),
          Text('Renew your Gold Membership', style: TextStyle(color: Color(0xFFFBD786), fontSize: 13.sp, fontWeight: FontWeight.w800)),
        ]),
        Icon(Icons.chevron_right, color: Color(0xFFFBD786), size: 18.w),
      ]),
    ),
  ]),
)
```

**Quick Actions (2-column equal-width row):**
```dart
Row(children: [
  Expanded(child: Container(
    padding: EdgeInsets.all(12.w),
    decoration: BoxDecoration(
      color: AppColors.pureWhite, borderRadius: BorderRadius.circular(12.r),
      boxShadow: [BoxShadow(color: AppColors.shadowColor, blurRadius: 4, offset: Offset(0, 2))],
    ),
    child: Row(children: [
      Container(
        padding: EdgeInsets.all(6.w),
        decoration: const BoxDecoration(color: Color(0xFFF5F5F5), shape: BoxShape.circle),
        child: Icon(Icons.wallet, color: AppColors.textSecondary, size: 16.w),
      ),
      SizedBox(width: 10.w),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Zomato Money', style: TextStyle(fontSize: 11.sp, fontWeight: FontWeight.w800)),
        Text('₹0', style: TextStyle(fontSize: 12.sp, fontWeight: FontWeight.w900, color: AppColors.primaryGreen)),
      ]),
    ]),
  )),
  SizedBox(width: 12.w),
  Expanded(child: /* coupons card — same structure */ ...),
])
```

**Category Section Header (green left bar):**
```dart
Row(children: [
  Container(width: 3.w, height: 16.h, color: AppColors.primaryGreen),
  SizedBox(width: 8.w),
  Text(category.title, style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w900, color: AppColors.textPrimary)),
])
```

**Category Container:**
```dart
Container(
  decoration: BoxDecoration(
    color: AppColors.pureWhite,
    borderRadius: BorderRadius.circular(12.r),
    border: Border.all(color: AppColors.borderGrey),
  ),
  child: Column(
    children: List.generate(items.length, (index) {
      return Column(children: [
        _buildSettingTile(item),
        if (index < items.length - 1) Container(height: 1.h, color: AppColors.borderGrey),
      ]);
    }),
  ),
)
```

**Setting Tile:**
- `ListTile` with leading `Icon` (`20.w`, textSecondary or green for Veg Mode)
- Title: `13.sp w700 textPrimary`
- Trailing: `Switch` OR `Text + chevron_right` OR just `chevron_right`

**Switch styling (all switches in app):**
```dart
Switch(
  activeThumbColor: AppColors.pureWhite,
  activeTrackColor: AppColors.primaryGreen,
  inactiveThumbColor: AppColors.textTertiary,
  inactiveTrackColor: AppColors.borderGrey,
)
```

**Feeding India Banner (nested inside category container):**
```dart
Container(
  margin: EdgeInsets.all(12.w),
  padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 8.h),
  decoration: BoxDecoration(color: const Color(0xFFFFF5F5), borderRadius: BorderRadius.circular(8.r)),
  child: Row(children: [
    Icon(Icons.favorite, color: const Color(0xFFEF4444), size: 16.w),
    SizedBox(width: 8.w),
    Expanded(child: Text('1 meal served! You\'ve already won a smile.',
      style: TextStyle(fontSize: 11.sp, fontWeight: FontWeight.w700, color: Color(0xFFB91C1C)))),
  ]),
)
```

---

## 6. Modal Bottom Sheets

### 6.1 Standard Bottom Sheet Template
```dart
showModalBottomSheet(
  context: context,
  isScrollControlled: true,
  backgroundColor: Colors.transparent,
  builder: (context) {
    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        // Floating close button
        Positioned(
          top: deviceHeight * 0.18,
          left: 0, right: 0,
          child: Center(child: /* close CircleAvatar */),
        ),
        // Sheet content
        Container(
          height: deviceHeight * 0.72, // or 0.76 for taller sheets
          decoration: BoxDecoration(
            color: AppColors.pureWhite,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24.r)),
          ),
          child: Column(children: [ /* content */ ]),
        ),
      ],
    );
  },
)
```

**Height ratios used:**
- Address selection: `0.72`
- Customisation modal: `0.76`

### 6.2 Bottom Sheet ListTile Pattern
```dart
ListTile(
  leading: Icon(icon, color: AppColors.primaryGreen, size: 20.w),
  title: Text(label, style: TextStyle(fontSize: 14.sp, fontWeight: FontWeight.w800, color: AppColors.primaryGreen)),
  trailing: Icon(Icons.chevron_right, color: AppColors.textSecondary, size: 18.w),
  onTap: () {},
)
```

### 6.3 Menu Action Bottom Sheet (Standard)
When replacing `PopupMenuButton` or providing context menus, ALWAYS use this bottom sheet pattern:
- **Top handle**: A grey horizontal pill `40.w` by `4.h`.
- **Header**: Row with `<<` back/close button and a bold title (e.g., "Branch Actions").
- **Subtitle**: Contextual description below the title.
- **List Items**: Each menu item consists of a row containing text inside a light grey pill background on the left, and an action toggle/icon on the right.

```dart
void _showMenuBottomSheet(BuildContext context, String title, String subtitle, List<Widget> items) {
  showModalBottomSheet(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    builder: (context) {
      return Container(
        decoration: BoxDecoration(
          color: AppColors.pureWhite,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24.r)),
        ),
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).padding.bottom + 20.h),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(height: 12.h),
            Center(
              child: Container(
                width: 40.w,
                height: 4.h,
                decoration: BoxDecoration(
                  color: const Color(0xFFE0E0E0),
                  borderRadius: BorderRadius.circular(2.r),
                ),
              ),
            ),
            SizedBox(height: 24.h),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 20.w),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: () => Navigator.pop(context),
                    child: Icon(Icons.keyboard_double_arrow_left, color: AppColors.textPrimary, size: 24.w),
                  ),
                  SizedBox(width: 8.w),
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 18.sp,
                      fontWeight: FontWeight.w900,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            SizedBox(height: 16.h),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 20.w),
              child: Text(
                subtitle,
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.w500,
                  color: AppColors.textSecondary,
                ),
              ),
            ),
            SizedBox(height: 24.h),
            ...items.map((item) => Padding(
              padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 8.h),
              child: item,
            )),
          ],
        ),
      );
    },
  );
}
```
**Item Row Example:**
```dart
GestureDetector(
  onTap: () { ... },
  child: Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Container(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 8.h),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F5F5),
          borderRadius: BorderRadius.circular(20.r),
        ),
        child: Text(
          'Action Name',
          style: TextStyle(
            fontSize: 14.sp,
            fontWeight: FontWeight.w800,
            color: AppColors.textPrimary,
          ),
        ),
      ),
      Icon(Icons.chevron_right, color: AppColors.primaryGreen, size: 24.w),
    ],
  ),
)
```

### 6.4 Confirmation Dialogs
For critical actions (Sign out, Request to join, Withdraw, Create branch), ALWAYS use the reusable `AppDialog.showConfirmation` component from `lib/components/ui/dialog.dart`.
- Uses a bottom-aligned action row with "Cancel" and a primary action.
- Uses `AppColors.error` if `isDestructive: true`, otherwise uses `AppColors.primaryGreen`.
- Title should be bold and concise (`18.sp w700`).
- Message should be a descriptive string (`14.sp w400 textSecondary`).

```dart
final confirm = await AppDialog.showConfirmation(
  context: context,
  title: 'Sign out',
  message: 'Are you sure you want to sign out?',
  confirmText: 'Sign out',
  isDestructive: true,
);
if (confirm == true) {
  // execute action
}
```

---

## 7. Restaurant Card Types

### 7.1 Small Restaurant Card (3-column grid)
- `Expanded` image with `12.r` radius
- Top-left: dark `0.75` overlay promo badge `7.sp w800`
- Bottom-left: green rating badge
- Below image: name `11.sp w800` + delivery row (green bolt if fast, grey clock if slow, `9.sp`)

### 7.2 Large Restaurant Card (full-width vertical list)
- `200.h` image, top `16.r` radius only
- Bookmarks, Ad badge, pagination dots on image
- Info: name `16.sp w800` + rating badge column + `11.sp` time/distance + divider + offer row

---

## 8. Navigation Patterns

| Route | How navigated | Direction |
|-------|---------------|-----------|
| `/` | App start / login redirect | push |
| `/login` | Settings → Log out | pushNamedAndRemoveUntil |
| `/search` | Home search bar tap | pushNamed |
| `/search-result` | Search mind grid item tap | pushNamed |
| `/store` | Restaurant card tap | pushNamed |
| `/cart` | Store cart bar tap | pushNamed |
| `/payment` | Cart sticky footer PAY USING tap | pushNamed (async, returns PaymentMethod) |
| `/setting` | Home avatar tap | pushNamed |

**Always use** `Navigator.pushNamed`, `Navigator.pop`, or `Navigator.pushReplacementNamed`.

---

## 9. Structural Coding Rules

1. **No comments** — zero inline comments or block comments anywhere in `.dart` files.
2. **No `Scaffold.appBar`** — always build app bars manually inside `body`.
3. **All sizes use ScreenUtil** — `.w`, `.h`, `.sp`, `.r` on every layout value.
4. **Named helper methods** — break each UI section into `_buildXxx()` private methods.
5. **Dummy data lives in `_data_dummy/`** — every page has a corresponding `_data_dummy/page_name.dart` with all hardcoded data models and lists.
6. **No state in data files** — data files export only `const`/`final` lists and model classes.
7. **Single `StatefulWidget` per page** — extract sub-widgets as private `_buildXxx()` methods, not separate classes (except for complex modals).

---

## 10. Adding a New Page — Checklist

- [ ] Create `lib/features/<feature>/pages/<page_name>.dart`
- [ ] Create `lib/features/<feature>/_data_dummy/<page_name>.dart` with all hardcoded models
- [ ] Register route in `lib/core/routes.dart` (add `static const String` and map entry)
- [ ] Add navigation trigger from the appropriate existing page
- [ ] Use `Color(0xFFFAFAFA)` scaffold background if it's a secondary/detail page, `AppColors.pureWhite` for primary pages
- [ ] Import only `flutter/material.dart`, `flutter_screenutil/flutter_screenutil.dart`, and `user/core/color.dart`
- [ ] Follow all ScreenUtil sizing rules
- [ ] Match ALL-CAPS section headers at `12.sp w800 textTertiary letterSpacing: 0.8`
- [ ] Use `16.w` horizontal page padding
- [ ] Use `AppColors.shadowColor` for all shadows
- [ ] Use `AppColors.borderGrey` for all borders
- [ ] Never write comments

- [ ] Make sure every singular icon floating widget is circular (e.g., using shape: CircleBorder() or a circular container).

---

## 11. Web App UI Standard (POS Terminal Perspective)

This section defines the strict visual layout for the web app based on the POS Terminal design reference. The web app must match this EXACT 100% pixel-perfect layout using Tailwind CSS.

### 11.1 App Bar
- **Left Icon**: A back chevron `<` icon.
  - Container: Circular `w-10 h-10` (or `40px`), white background `bg-white`, very subtle shadow, placed on the left.
- **Title**: "POS Terminal"
  - Alignment: Placed directly next to the back button (flex row, items-center, gap-4).
  - Typography: `20px`, bold/black (`font-bold` or `font-black`), dark grey text (`textPrimary`).
- **Container**: Minimal top padding, white background. No bottom border.

### 11.2 Category Horizontal Scroll (Filter Tabs)
- A horizontally scrollable row of circular categories.
- **Item Container**: Flex column, centered items. Gap between items: ~16px.
- **Active Item ("All Items")**:
  - Icon Bubble: `w-14 h-14` (approx 56px), light grey background (`#F4F4F4`), containing a generic shape icon (triangle/squares).
  - Label: "All Items", `12px`, `font-bold`, dark text.
  - Active Indicator: A thick green underline directly below the text (`border-b-[3px] border-primary-green` or a `h-1` green container).
- **Inactive Items ("Sweets", "Fast Food", "Restaurant")**:
  - Icon Bubble: `w-14 h-14` circular image.
  - Label: `12px`, `font-medium` or `font-normal`, grey text (`textSecondary`).

### 11.3 Divider
- A full-width subtle horizontal divider (`h-[8px]` background block) separating the header/categories from the product list. Use `bg-soft-grey`.

### 11.4 Product Grid / List
- **Product Card**:
  - Image: Square aspect ratio (1:1), rounded corners (`rounded-2xl` or `16px`), width is full for the column.
  - Title: Placed below image, 2-line max, dark grey text (`textPrimary`), `12px`, `font-bold`, `leading-tight`. Example: "Double Panneer Roll - Double Panneer".
  - Price: Placed below title, green text (`text-primary-green`), `font-bold`, `12px`. Format: "₹ 105".
  - Layout: Grid with 2 columns (`grid-cols-2`) and gap `16px`.

### 11.5 Floating Bottom Navigation
- **Container**: Floating pill at bottom center, `rounded-full` (e.g. `rounded-[30px]`), white background, deep shadow (`shadow-deep`). It contains a row of 3 tabs, distributed evenly (`justify-evenly` or `gap-4`). Padding around the container is ~`8px`.
- **Active Tab ("Billing")**:
  - Background: Light green pill (`bg-[#E8F5E9]`), `rounded-full` (`rounded-3xl`).
  - Content: Flex row, `gap-2`, `px-4 py-2`.
  - Icon: Receipt icon, green (`text-primary-green`).
  - Text: "Billing", `12px`, `font-bold`, green (`text-primary-green`).
- **Inactive Tabs ("Orders", "More")**:
  - Background: None.
  - Content: Flex row, `gap-2`, `px-4 py-2`.
  - Icon: Orders/List icon and More (`...`) icon, grey (`text-text-secondary`).
  - Text: "Orders" / "More", `12px`, grey (`text-text-secondary`).

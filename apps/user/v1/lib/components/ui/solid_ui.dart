import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';

abstract final class RideTokens {
  static const canvas = Colors.white;
  static const ink = Color(0xFF101010);
  static const muted = Color(0xFF858585);
  static const accent = Color(0xFF4258ED);
  static const line = Color(0xFFEEEEEE);
}

/// Captured by dialogs and sheets, including legacy shared trip controls.
class SolidTheme extends InheritedTheme {
  const SolidTheme({super.key, required super.child});
  static bool of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SolidTheme>() != null;
  @override
  bool updateShouldNotify(SolidTheme oldWidget) => false;
  @override
  Widget wrap(BuildContext context, Widget child) => SolidTheme(child: child);
}

class SolidScope extends StatelessWidget {
  final Widget child;
  const SolidScope({super.key, required this.child});
  @override
  Widget build(BuildContext context) {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: const ColorScheme.light(
        primary: RideTokens.ink,
        secondary: RideTokens.accent,
        surface: Colors.white,
      ),
    );
    return SolidTheme(
      child: Theme(
        data: base.copyWith(
          scaffoldBackgroundColor: Colors.white,
          textTheme: base.textTheme
              .apply(bodyColor: RideTokens.ink, displayColor: RideTokens.ink)
              .copyWith(
                bodyMedium: const TextStyle(
                  fontSize: 14,
                  height: 1.35,
                  color: RideTokens.ink,
                ),
                bodySmall: const TextStyle(
                  fontSize: 12,
                  height: 1.35,
                  color: RideTokens.muted,
                ),
                titleMedium: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: RideTokens.ink,
                ),
              ),
          inputDecorationTheme: InputDecorationTheme(
            filled: true,
            fillColor: const Color(0xFFF5F5F5),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 12,
            ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            labelStyle: const TextStyle(fontSize: 13, color: RideTokens.muted),
          ),
          outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
              foregroundColor: RideTokens.ink,
              side: const BorderSide(color: RideTokens.line),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(foregroundColor: RideTokens.ink),
          ),
          dividerTheme: const DividerThemeData(
            color: RideTokens.line,
            thickness: 1,
          ),
          bottomSheetTheme: const BottomSheetThemeData(
            backgroundColor: Colors.transparent,
            surfaceTintColor: Colors.transparent,
          ),
        ),
        child: child,
      ),
    );
  }
}

class SolidSurface extends StatelessWidget {
  final Widget child;
  final Widget? upperChild;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double radius;
  final bool dark;
  final Color? tint;
  final double blackHeight;
  final bool? fullRadius;

  const SolidSurface({
    super.key,
    required this.child,
    this.upperChild,
    this.padding = const EdgeInsets.all(16),
    this.margin,
    this.radius = 14,
    this.dark = false,
    this.tint,
    this.blackHeight = 80,
    this.fullRadius = true,
  });

  @override
  Widget build(BuildContext context) {
    final body = Container(
      decoration: BoxDecoration(
        color: dark ? Colors.black : tint ?? Colors.white,
        borderRadius: fullRadius == true
            ? BorderRadius.circular(radius)
            : BorderRadius.only(
                topLeft: Radius.circular(radius),
                topRight: Radius.circular(radius),
              ),
        border: Border.all(color: dark ? Colors.black : RideTokens.line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        type: MaterialType.transparency,
        child: Padding(padding: padding, child: child),
      ),
    );
    if (upperChild == null) {
      return Padding(padding: margin ?? EdgeInsets.zero, child: body);
    }
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: Colors.black,
        borderRadius: fullRadius == true
            ? BorderRadius.circular(radius)
            : BorderRadius.only(
                topLeft: Radius.circular(radius),
                topRight: Radius.circular(radius),
              ),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: blackHeight,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: upperChild,
            ),
          ),
          Flexible(fit: FlexFit.loose, child: body),
        ],
      ),
    );
  }
}

class SolidIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool dark;
  const SolidIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
    this.dark = false,
  });
  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tooltip,
    onPressed: onPressed,
    style: IconButton.styleFrom(
      backgroundColor: dark ? Colors.black : Colors.white,
      foregroundColor: dark ? Colors.white : RideTokens.ink,
      minimumSize: const Size(44, 44),
      padding: const EdgeInsets.all(10),
    ),
    icon: Icon(icon, size: 20),
  );
}

class SolidButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final Widget? icon;
  final bool busy;
  const SolidButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.icon,
    this.busy = false,
  });
  @override
  Widget build(BuildContext context) => FilledButton(
    onPressed: busy ? null : onPressed,
    style: FilledButton.styleFrom(
      backgroundColor: Colors.black,
      foregroundColor: Colors.white,
      disabledBackgroundColor: const Color(0xFF5A5A5A),
      minimumSize: const Size(0, 48),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[icon!, const SizedBox(width: 8)],
        Flexible(
          child: Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          ),
        ),
        if (busy)
          const Padding(
            padding: EdgeInsets.only(left: 10),
            child: AppSkeleton(child: SkeletonBox(width: 24, height: 6)),
          ),
      ],
    ),
  );
}

class SolidSheet extends StatelessWidget {
  final Widget child;
  const SolidSheet({super.key, required this.child});
  @override
  Widget build(BuildContext context) => SolidScope(
    child: Material(
      color: Colors.white,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 36,
            height: 3,
            margin: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: const Color(0xFFCCCCCC),
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          Flexible(fit: FlexFit.loose, child: child),
        ],
      ),
    ),
  );
}

class SolidPage extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? action;
  const SolidPage({
    super.key,
    required this.title,
    required this.child,
    this.action,
  });
  @override
  Widget build(BuildContext context) => SolidScope(
    child: Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        title: Text(
          title,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        centerTitle: true,
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.white,
        actions: [?action],
      ),
      body: SafeArea(top: false, child: child),
    ),
  );
}

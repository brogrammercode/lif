import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/core/color.dart';

abstract final class GlassTokens {
  static const canvas = Color(0xFFE5ECFB);
  static const ink = Color(0xFF182133);
  static const muted = Color(0xFF586780);
  static const accent = Color(0xFF354E79);
  static const radius = 24.0;
  static const blur = 18.0;
  // The enclosing glass well supplies its rim. Filled/underline geometry keeps
  // floating labels inside the clip instead of cutting them along the top edge.
  static const inputBorder = UnderlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(20)),
    borderSide: BorderSide.none,
  );
}

/// Captured with Material's inherited themes when a dialog/sheet is opened.
class LiquidGlassTheme extends InheritedTheme {
  const LiquidGlassTheme({super.key, required super.child});
  static bool of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<LiquidGlassTheme>() != null;
  @override
  bool updateShouldNotify(LiquidGlassTheme oldWidget) => false;
  @override
  Widget wrap(BuildContext context, Widget child) =>
      LiquidGlassTheme(child: child);
}

class LiquidGlassScope extends StatelessWidget {
  final Widget child;
  const LiquidGlassScope({super.key, required this.child});
  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context);
    return LiquidGlassTheme(
      child: Theme(
        data: base.copyWith(
          scaffoldBackgroundColor: GlassTokens.canvas,
          dividerColor: Colors.white.withValues(alpha: 0.65),
          colorScheme: base.colorScheme.copyWith(
            primary: GlassTokens.accent,
            onSurface: GlassTokens.ink,
            surface: const Color(0xFFF1F5FF),
          ),
          inputDecorationTheme: const InputDecorationTheme(
            filled: true,
            fillColor: Color(0x45FFFFFF),
            border: GlassTokens.inputBorder,
            enabledBorder: GlassTokens.inputBorder,
            disabledBorder: GlassTokens.inputBorder,
            focusedBorder: UnderlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(20)),
              borderSide: BorderSide(color: Color(0xFF788DB9), width: 1.5),
            ),
            errorBorder: UnderlineInputBorder(
              borderRadius: BorderRadius.all(Radius.circular(20)),
              borderSide: BorderSide(color: AppColors.googleRed),
            ),
            contentPadding: EdgeInsets.symmetric(horizontal: 18, vertical: 17),
            labelStyle: TextStyle(color: GlassTokens.muted, fontSize: 14),
            hintStyle: TextStyle(color: GlassTokens.muted, fontSize: 14),
            helperStyle: TextStyle(color: GlassTokens.muted, height: 1.4),
          ),
          outlinedButtonTheme: OutlinedButtonThemeData(
            style: OutlinedButton.styleFrom(
              foregroundColor: GlassTokens.ink,
              backgroundColor: const Color(0x33FFFFFF),
              side: const BorderSide(color: Color(0xCBFFFFFF)),
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 15),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
          textButtonTheme: TextButtonThemeData(
            style: TextButton.styleFrom(foregroundColor: GlassTokens.accent),
          ),
          filledButtonTheme: FilledButtonThemeData(
            style: FilledButton.styleFrom(
              backgroundColor: GlassTokens.ink,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(24),
              ),
            ),
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

/// A code-drawn ambient scene: no bitmap/asset or continuously running animation.
class LiquidGlassBackdrop extends StatelessWidget {
  final Widget child;
  const LiquidGlassBackdrop({super.key, required this.child});
  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      const Positioned.fill(
        child: RepaintBoundary(child: CustomPaint(painter: _AmbientPainter())),
      ),
      BackdropGroup(child: child),
    ],
  );
}

class _AmbientPainter extends CustomPainter {
  const _AmbientPainter();
  @override
  void paint(Canvas canvas, Size size) {
    final bounds = Offset.zero & size;
    canvas.drawRect(
      bounds,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFD5E8FF), Color(0xFFE9E4F7), Color(0xFFDCE9FA)],
        ).createShader(bounds),
    );
    void glow(Offset center, double radius, Color color) => canvas.drawCircle(
      center,
      radius,
      Paint()
        ..shader = ui.Gradient.radial(center, radius, [
          color,
          color.withValues(alpha: 0),
        ]),
    );
    final width = size.width;
    glow(
      Offset(width * 0.02, size.height * 0.40),
      width * 0.78,
      const Color(0xD6FFF0D8),
    );
    glow(
      Offset(width, size.height * 0.12),
      width * 0.80,
      const Color(0xC7C6BDFF),
    );
    glow(
      Offset(width * 0.85, size.height * 0.82),
      width * 0.90,
      const Color(0xB3B3D8FF),
    );
    glow(
      Offset(width * 0.15, size.height * 0.86),
      width * 0.64,
      const Color(0x8FFFDDE8),
    );
    final wave = Path()
      ..moveTo(-width * .2, size.height * .61)
      ..cubicTo(
        width * .15,
        size.height * .40,
        width * .55,
        size.height * .78,
        width * 1.2,
        size.height * .51,
      );
    canvas.drawPath(
      wave,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 28
        ..shader = const LinearGradient(
          colors: [Color(0x00FFFFFF), Color(0x4DFFFFFF), Color(0x00FFFFFF)],
        ).createShader(bounds),
    );
  }

  @override
  bool shouldRepaint(_AmbientPainter oldDelegate) => false;
}

class _GlassLayer extends InheritedWidget {
  const _GlassLayer({required super.child});
  @override
  bool updateShouldNotify(_GlassLayer oldWidget) => false;
}

class LiquidGlassSurface extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double radius;
  final bool dark;
  final Color? tint;
  const LiquidGlassSurface({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
    this.margin,
    this.radius = GlassTokens.radius,
    this.dark = false,
    this.tint,
  });
  @override
  Widget build(BuildContext context) {
    final highContrast = MediaQuery.highContrastOf(context);
    final nested =
        context.dependOnInheritedWidgetOfExactType<_GlassLayer>() != null;
    final content = _GlassLayer(
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: highContrast
                ? [
                    dark ? GlassTokens.ink : const Color(0xFFF6F8FF),
                    dark ? GlassTokens.ink : const Color(0xFFF6F8FF),
                  ]
                : dark
                ? const [Color(0xE63C4559), Color(0xF20D1423)]
                : [
                    Colors.white.withValues(alpha: .48),
                    (tint ?? const Color(0xFFDCE7FF)).withValues(alpha: .16),
                    Colors.white.withValues(alpha: .22),
                  ],
          ),
        ),
        child: CustomPaint(
          foregroundPainter: _GlassRim(radius: radius, dark: dark),
          child: Material(
            type: MaterialType.transparency,
            child: Padding(padding: padding, child: child),
          ),
        ),
      ),
    );
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF4F608D).withValues(alpha: dark ? .16 : .07),
            blurRadius: 22,
            offset: const Offset(0, 8),
          ),
          BoxShadow(
            color: Colors.white.withValues(alpha: .45),
            blurRadius: 1,
            offset: const Offset(-1, -1),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: highContrast || nested
            ? content
            : BackdropFilter.grouped(
                filter: ui.ImageFilter.blur(
                  sigmaX: GlassTokens.blur,
                  sigmaY: GlassTokens.blur,
                ),
                child: content,
              ),
      ),
    );
  }
}

class _GlassRim extends CustomPainter {
  final double radius;
  final bool dark;
  const _GlassRim({required this.radius, required this.dark});
  @override
  void paint(Canvas canvas, Size size) {
    final bounds = (Offset.zero & size).deflate(.8);
    final rim = RRect.fromRectAndRadius(bounds, Radius.circular(radius));
    canvas.drawRRect(
      rim,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.35
        ..shader = LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: dark ? .65 : .98),
            const Color(0x26FFFFFF),
            const Color(0x728EA5D2),
            Colors.white.withValues(alpha: .80),
          ],
          stops: const [0, .45, .7, 1],
        ).createShader(bounds),
    );
    canvas.drawRRect(
      rim.deflate(2),
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = .65
        ..color = Colors.white.withValues(alpha: dark ? .1 : .32),
    );
  }

  @override
  bool shouldRepaint(_GlassRim oldDelegate) =>
      radius != oldDelegate.radius || dark != oldDelegate.dark;
}

class LiquidGlassIconButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  const LiquidGlassIconButton({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });
  @override
  Widget build(BuildContext context) => LiquidGlassSurface(
    radius: 99,
    padding: EdgeInsets.zero,
    child: IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      style: IconButton.styleFrom(
        foregroundColor: GlassTokens.ink,
        minimumSize: const Size(48, 48),
      ),
      icon: Icon(icon, size: 21),
    ),
  );
}

class LiquidGlassButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final Widget? icon;
  final bool busy;
  const LiquidGlassButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.icon,
    this.busy = false,
  });
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    enabled: onPressed != null && !busy,
    child: LiquidGlassSurface(
      dark: true,
      radius: 28,
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(28),
        onTap: busy ? null : onPressed,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (icon != null) ...[
                  IconTheme(
                    data: const IconThemeData(color: Colors.white, size: 20),
                    child: icon!,
                  ),
                  const SizedBox(width: 10),
                ],
                Flexible(
                  child: Text(
                    text,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                      color: Colors.white,
                    ),
                  ),
                ),
                if (busy) ...[
                  const SizedBox(width: 12),
                  const AppSkeleton(
                    label: 'Please wait',
                    child: SkeletonBox(width: 30, height: 8),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class LiquidGlassSheet extends StatelessWidget {
  final Widget child;
  const LiquidGlassSheet({super.key, required this.child});
  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: BackdropGroup(
      child: LiquidGlassSurface(
        padding: EdgeInsets.zero,
        radius: 30,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 38,
              height: 4,
              margin: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: GlassTokens.muted.withValues(alpha: .45),
                borderRadius: BorderRadius.circular(99),
              ),
            ),
            Flexible(fit: FlexFit.loose, child: child),
          ],
        ),
      ),
    ),
  );
}

class LiquidGlassDialog extends StatelessWidget {
  final Widget title;
  final Widget? content;
  final List<Widget> actions;
  const LiquidGlassDialog({
    super.key,
    required this.title,
    this.content,
    this.actions = const [],
  });
  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: Dialog(
      backgroundColor: Colors.transparent,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.all(20),
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: 440,
          maxHeight: MediaQuery.sizeOf(context).height * .82,
        ),
        child: BackdropGroup(
          child: LiquidGlassSurface(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                DefaultTextStyle.merge(
                  style: const TextStyle(
                    color: GlassTokens.ink,
                    fontSize: 21,
                    fontWeight: FontWeight.w600,
                  ),
                  child: title,
                ),
                if (content != null) ...[
                  const SizedBox(height: 18),
                  Flexible(
                    fit: FlexFit.loose,
                    child: SingleChildScrollView(child: content!),
                  ),
                ],
                if (actions.isNotEmpty) ...[
                  const SizedBox(height: 18),
                  OverflowBar(
                    alignment: MainAxisAlignment.end,
                    spacing: 8,
                    children: actions,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class LiquidGlassPage extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? action;
  final bool edgeToEdge;
  const LiquidGlassPage({
    super.key,
    required this.title,
    required this.child,
    this.action,
    this.edgeToEdge = false,
  });
  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: Scaffold(
      backgroundColor: GlassTokens.canvas,
      body: LiquidGlassBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
                child: Row(
                  children: [
                    LiquidGlassIconButton(
                      icon: Icons.chevron_left,
                      tooltip: 'Back',
                      onPressed: () => Navigator.maybePop(context),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: GlassTokens.ink,
                        ),
                      ),
                    ),
                    if (action != null) ...[
                      const SizedBox(width: 8),
                      LiquidGlassSurface(
                        radius: 99,
                        padding: EdgeInsets.zero,
                        child: action!,
                      ),
                    ],
                  ],
                ),
              ),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.symmetric(
                    horizontal: edgeToEdge ? 0 : 20,
                  ),
                  child: child,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class LiquidGlassFormSkeleton extends StatelessWidget {
  final bool document;
  const LiquidGlassFormSkeleton({super.key, this.document = false});
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    child: AppSkeleton(
      label: document ? 'Loading document' : 'Loading form',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          const SkeletonBox(width: 180, height: 25),
          const SizedBox(height: 12),
          const FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: .72,
            child: SkeletonBox(height: 13),
          ),
          const SizedBox(height: 24),
          for (var i = 0; i < (document ? 2 : 5); i++)
            LiquidGlassSurface(
              margin: const EdgeInsets.only(bottom: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: .55,
                    child: SkeletonBox(height: 13),
                  ),
                  const SizedBox(height: 14),
                  SkeletonBox(height: document ? 140 : 42),
                ],
              ),
            ),
        ],
      ),
    ),
  );
}

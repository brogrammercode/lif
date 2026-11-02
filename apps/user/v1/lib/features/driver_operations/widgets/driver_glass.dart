import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';

class DriverStatusPill extends StatelessWidget {
  final String label;
  final String? status;
  final IconData? icon;
  const DriverStatusPill({
    super.key,
    required this.label,
    this.status,
    this.icon,
  });

  Color get _color {
    final value = (status ?? label).toUpperCase();
    if (value.contains('REJECT') ||
        value.contains('SUSPEND') ||
        value.contains('FAILED') ||
        value.contains('OVERDUE')) {
      return AppColors.googleRed;
    }
    if (value.contains('APPROV') ||
        value.contains('ACTIVE') ||
        value.contains('AVAILABLE') ||
        value.contains('RECEIVED') ||
        value.contains('COMPLETE') ||
        value.contains('VERIFIED')) {
      return AppColors.primaryGreen;
    }
    if (value.contains('PENDING') ||
        value.contains('REQUEST') ||
        value.contains('REVIEW') ||
        value.contains('WAIT')) {
      return const Color(0xFF9A6700);
    }
    return GlassTokens.accent;
  }

  @override
  Widget build(BuildContext context) {
    final color = _color;
    return Semantics(
      label: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 7),
        decoration: BoxDecoration(
          color: color.withValues(alpha: .10),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: color.withValues(alpha: .28)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon ?? Icons.circle,
              size: icon == null ? 7 : 15,
              color: color,
            ),
            const SizedBox(width: 7),
            Flexible(
              child: Text(
                label.replaceAll('_', ' '),
                style: TextStyle(
                  color: color,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class DriverPageIntro extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;
  final Widget? trailing;
  const DriverPageIntro({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    this.trailing,
  });

  Widget _copy() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        title,
        style: const TextStyle(
          color: GlassTokens.ink,
          fontSize: 18,
          fontWeight: FontWeight.w600,
        ),
      ),
      const SizedBox(height: 5),
      Text(
        description,
        style: const TextStyle(
          color: GlassTokens.muted,
          fontSize: 13,
          height: 1.45,
        ),
      ),
    ],
  );

  Widget _icon() => LiquidGlassSurface(
    radius: 99,
    padding: const EdgeInsets.all(12),
    child: Icon(icon, size: 22, color: GlassTokens.accent),
  );

  @override
  Widget build(BuildContext context) => LiquidGlassSurface(
    child: LayoutBuilder(
      builder: (context, constraints) {
        final stack =
            constraints.maxWidth < 330 ||
            MediaQuery.textScalerOf(context).scale(1) >= 1.6;
        if (stack) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _icon(),
              const SizedBox(height: 12),
              _copy(),
              if (trailing != null) ...[const SizedBox(height: 12), trailing!],
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _icon(),
            const SizedBox(width: 14),
            Expanded(child: _copy()),
            if (trailing != null) ...[const SizedBox(width: 10), trailing!],
          ],
        );
      },
    ),
  );
}

class DriverLinkTile extends StatelessWidget {
  final IconData icon;
  final Widget? leading;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final Widget? trailing;
  const DriverLinkTile({
    super.key,
    required this.icon,
    this.leading,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) => LiquidGlassSurface(
    padding: EdgeInsets.zero,
    child: InkWell(
      borderRadius: BorderRadius.circular(24),
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 76),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              leading ??
                  LiquidGlassSurface(
                    radius: 99,
                    padding: const EdgeInsets.all(11),
                    child: Icon(icon, color: GlassTokens.accent, size: 20),
                  ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: GlassTokens.ink,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: GlassTokens.muted,
                        fontSize: 12.5,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              trailing ??
                  const Icon(
                    Icons.chevron_right_rounded,
                    color: GlassTokens.muted,
                  ),
            ],
          ),
        ),
      ),
    ),
  );
}

class DriverInfoRow extends StatelessWidget {
  final String label;
  final String value;
  final Widget? valueWidget;
  const DriverInfoRow({
    super.key,
    required this.label,
    required this.value,
    this.valueWidget,
  });

  Widget _value({TextAlign textAlign = TextAlign.end}) =>
      valueWidget ??
      Text(
        value,
        textAlign: textAlign,
        style: const TextStyle(
          color: GlassTokens.ink,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          height: 1.35,
        ),
      );

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final stack =
            constraints.maxWidth < 300 ||
            MediaQuery.textScalerOf(context).scale(1) >= 1.6;
        if (stack) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(color: GlassTokens.muted, fontSize: 13),
              ),
              const SizedBox(height: 4),
              _value(textAlign: TextAlign.start),
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 4,
              child: Text(
                label,
                style: const TextStyle(color: GlassTokens.muted, fontSize: 13),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(flex: 5, child: _value()),
          ],
        );
      },
    ),
  );
}

class DriverNotice extends StatelessWidget {
  final IconData icon;
  final String message;
  final bool error;
  final bool warning;
  final String? actionLabel;
  final VoidCallback? onAction;
  const DriverNotice({
    super.key,
    required this.icon,
    required this.message,
    this.error = false,
    this.warning = false,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final color = error
        ? AppColors.googleRed
        : warning
        ? const Color(0xFF9A6700)
        : GlassTokens.accent;
    return LiquidGlassSurface(
      tint: color.withValues(alpha: .18),
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 19),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message,
                  style: TextStyle(color: color, fontSize: 13, height: 1.4),
                ),
                if (actionLabel != null && onAction != null)
                  TextButton(
                    onPressed: onAction,
                    style: TextButton.styleFrom(
                      foregroundColor: color,
                      padding: const EdgeInsets.only(top: 6),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: Text(actionLabel!),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class DriverListSkeleton extends StatelessWidget {
  final int rows;
  final bool summary;
  const DriverListSkeleton({super.key, this.rows = 4, this.summary = true});

  List<Widget> get _children => [
    if (summary) ...[
      LiquidGlassSurface(
        child: Row(
          children: [
            const SkeletonBox(width: 48, height: 48, circle: true),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  SkeletonBox(width: 150, height: 17),
                  SizedBox(height: 9),
                  SkeletonBox(width: 220, height: 12),
                ],
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 18),
    ],
    for (var i = 0; i < rows; i++) ...[
      LiquidGlassSurface(
        child: Row(
          children: [
            const SkeletonBox(width: 44, height: 44, circle: true),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  SkeletonBox(width: 130, height: 14),
                  SizedBox(height: 8),
                  SkeletonBox(height: 11),
                ],
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 12),
    ],
  ];

  @override
  Widget build(BuildContext context) => AppSkeleton(
    label: 'Loading driver information',
    child: LayoutBuilder(
      builder: (context, constraints) => constraints.hasBoundedHeight
          ? ListView(
              physics: const NeverScrollableScrollPhysics(),
              children: _children,
            )
          : Column(mainAxisSize: MainAxisSize.min, children: _children),
    ),
  );
}

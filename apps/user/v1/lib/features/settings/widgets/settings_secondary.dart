import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';

class SettingsIntroCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  final Widget? footer;
  final Color? iconColor;
  const SettingsIntroCard({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
    this.footer,
    this.iconColor,
  });

  @override
  Widget build(BuildContext context) => AppCard(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            LiquidGlassSurface(
              radius: 99,
              padding: const EdgeInsets.all(12),
              child: Icon(
                icon,
                size: 22,
                color: iconColor ?? GlassTokens.accent,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: GlassTokens.ink,
                      fontSize: 17,
                      height: 1.25,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    body,
                    style: const TextStyle(
                      color: GlassTokens.muted,
                      fontSize: 13,
                      height: 1.45,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        if (footer != null) ...[const SizedBox(height: 18), footer!],
      ],
    ),
  );
}

class SettingsStatusPill extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;
  const SettingsStatusPill({
    super.key,
    required this.label,
    required this.color,
    this.icon,
  });

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: .10),
        borderRadius: BorderRadius.circular(99),
        border: Border.all(color: color.withValues(alpha: .24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: color),
            const SizedBox(width: 5),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: color,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class SettingsSectionHeader extends StatelessWidget {
  final String title;
  final String? helper;
  final Widget? trailing;
  const SettingsSectionHeader({
    super.key,
    required this.title,
    this.helper,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.end,
    children: [
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: GlassTokens.ink,
                fontSize: 17,
                fontWeight: FontWeight.w600,
              ),
            ),
            if (helper != null) ...[
              const SizedBox(height: 3),
              Text(
                helper!,
                style: const TextStyle(
                  color: GlassTokens.muted,
                  fontSize: 12,
                  height: 1.35,
                ),
              ),
            ],
          ],
        ),
      ),
      if (trailing != null) ...[const SizedBox(width: 12), trailing!],
    ],
  );
}

class SettingsEmptyCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  final Widget? action;
  const SettingsEmptyCard({
    super.key,
    required this.icon,
    required this.title,
    required this.body,
    this.action,
  });

  @override
  Widget build(BuildContext context) => AppCard(
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        children: [
          LiquidGlassSurface(
            radius: 99,
            padding: const EdgeInsets.all(14),
            child: Icon(icon, color: GlassTokens.accent, size: 25),
          ),
          const SizedBox(height: 14),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: GlassTokens.ink,
              fontSize: 16,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 5),
          Text(
            body,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: GlassTokens.muted,
              fontSize: 13,
              height: 1.45,
            ),
          ),
          if (action != null) ...[const SizedBox(height: 16), action!],
        ],
      ),
    ),
  );
}

class SettingsListSkeleton extends StatelessWidget {
  final int rows;
  final bool intro;
  const SettingsListSkeleton({super.key, this.rows = 4, this.intro = true});

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(20, 4, 20, 28),
    child: AppSkeleton(
      label: 'Loading settings',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (intro) ...[
            AppCard(
              child: Row(
                children: [
                  const SkeletonBox(width: 48, height: 48, circle: true),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        SkeletonBox(width: 150, height: 17),
                        SizedBox(height: 10),
                        SkeletonBox(height: 12),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
          ],
          const SkeletonBox(width: 135, height: 18),
          const SizedBox(height: 12),
          for (var index = 0; index < rows; index++) ...[
            AppCard(
              child: Row(
                children: [
                  const SkeletonBox(width: 44, height: 44, circle: true),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        SkeletonBox(width: 160, height: 15),
                        SizedBox(height: 9),
                        SkeletonBox(height: 11),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            if (index != rows - 1) const SizedBox(height: 12),
          ],
        ],
      ),
    ),
  );
}

String settingsDateTime(dynamic value) {
  final parsed = DateTime.tryParse('$value')?.toLocal();
  if (parsed == null) return 'Time unavailable';
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final date = DateTime(parsed.year, parsed.month, parsed.day);
  final day = date == today
      ? 'Today'
      : date == today.subtract(const Duration(days: 1))
      ? 'Yesterday'
      : '${parsed.day.toString().padLeft(2, '0')}/${parsed.month.toString().padLeft(2, '0')}/${parsed.year}';
  final hour = parsed.hour % 12 == 0 ? 12 : parsed.hour % 12;
  final minute = parsed.minute.toString().padLeft(2, '0');
  return '$day, $hour:$minute ${parsed.hour >= 12 ? 'PM' : 'AM'}';
}

String readableEnum(dynamic value) {
  final raw = '$value'.trim();
  if (raw.isEmpty) return '';
  return raw
      .toLowerCase()
      .split('_')
      .where((part) => part.isNotEmpty)
      .map((part) => '${part[0].toUpperCase()}${part.substring(1)}')
      .join(' ');
}

import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/features/auth/models/user.model.dart';

abstract final class SettingsStyle {
  static const background = GlassTokens.canvas;
  static const muted = GlassTokens.muted;
  static const icon = GlassTokens.ink;
  static const avatarSize = 116.0;
  static const tileHeight = 76.0;
  static const tileGap = 10.0;
}

class SettingsMenuTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool loading;
  final bool destructive;
  const SettingsMenuTile({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.loading = false,
    this.destructive = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = destructive ? AppColors.googleRed : SettingsStyle.icon;
    return LiquidGlassSurface(
      radius: 24,
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(21),
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: SettingsStyle.tileHeight,
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
            child: Row(
              children: [
                loading
                    ? const SkeletonBox(width: 42, height: 42, circle: true)
                    : SizedBox(
                        width: 42,
                        height: 42,
                        child: LiquidGlassSurface(
                          radius: 99,
                          padding: EdgeInsets.zero,
                          child: Icon(icon, size: 21, color: color),
                        ),
                      ),
                const SizedBox(width: 15),
                Expanded(
                  child: loading
                      ? Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            FractionallySizedBox(
                              widthFactor: 0.68,
                              child: SkeletonBox(
                                height:
                                    MediaQuery.textScalerOf(context).scale(14) *
                                    1.3,
                              ),
                            ),
                            const SizedBox(height: 4),
                            FractionallySizedBox(
                              widthFactor: 0.48,
                              child: SkeletonBox(
                                height:
                                    MediaQuery.textScalerOf(context).scale(12) *
                                    1.35,
                              ),
                            ),
                          ],
                        )
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              title,
                              style: TextStyle(
                                fontSize: 14,
                                height: 1.3,
                                fontWeight: FontWeight.w600,
                                color: destructive
                                    ? AppColors.googleRed
                                    : AppColors.textPrimary,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              subtitle,
                              style: const TextStyle(
                                fontSize: 12,
                                height: 1.35,
                                color: SettingsStyle.muted,
                              ),
                            ),
                          ],
                        ),
                ),
                const SizedBox(width: 8),
                if (loading)
                  const SkeletonBox(width: 7, height: 12)
                else
                  Icon(Icons.chevron_right, size: 20, color: color),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SettingsProfileHeader extends StatelessWidget {
  final UserModel? user;
  final VoidCallback? onEditPhoto;
  final bool loading;
  final bool savingPhoto;
  const SettingsProfileHeader({
    super.key,
    this.user,
    this.onEditPhoto,
    this.loading = false,
    this.savingPhoto = false,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 4, 12, 27),
    child: Column(
      children: [
        SizedBox(
          width: SettingsStyle.avatarSize + 10,
          height: SettingsStyle.avatarSize + 2,
          child: Stack(
            children: [
              Align(
                alignment: Alignment.topCenter,
                child: loading
                    ? const SkeletonBox(
                        width: SettingsStyle.avatarSize,
                        height: SettingsStyle.avatarSize,
                        circle: true,
                      )
                    : ClipOval(
                        child: (user?.avatarUrl?.trim().isNotEmpty ?? false)
                            ? Image.network(
                                user!.avatarUrl!,
                                width: SettingsStyle.avatarSize,
                                height: SettingsStyle.avatarSize,
                                fit: BoxFit.cover,
                                cacheWidth: 350,
                                errorBuilder: (_, error, stack) => _fallback(),
                                loadingBuilder: (context, child, progress) =>
                                    progress == null
                                    ? child
                                    : const AppSkeleton(
                                        label: 'Loading profile photo',
                                        child: SkeletonBox(
                                          width: SettingsStyle.avatarSize,
                                          height: SettingsStyle.avatarSize,
                                          circle: true,
                                        ),
                                      ),
                              )
                            : _fallback(),
                      ),
              ),
              if (loading)
                const Positioned(
                  right: 0,
                  bottom: 0,
                  child: SkeletonBox(width: 48, height: 48, circle: true),
                )
              else
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: SizedBox(
                    width: 48,
                    height: 48,
                    // This lens overlaps the avatar; give it a separate source
                    // rather than sharing the avatar's sibling backdrop key.
                    child: BackdropGroup(
                      child: LiquidGlassSurface(
                        radius: 99,
                        padding: EdgeInsets.zero,
                        child: IconButton(
                          tooltip: savingPhoto
                              ? 'Saving photo'
                              : 'Change profile photo',
                          onPressed: savingPhoto ? null : onEditPhoto,
                          style: IconButton.styleFrom(
                            backgroundColor: Colors.transparent,
                            foregroundColor: SettingsStyle.icon,
                            side: const BorderSide(
                              color: Colors.white,
                              width: 2,
                            ),
                          ),
                          icon: savingPhoto
                              ? const AppSkeleton(
                                  label: 'Saving profile photo',
                                  child: SkeletonBox(
                                    width: 19,
                                    height: 19,
                                    circle: true,
                                  ),
                                )
                              : const Icon(Icons.camera_alt_outlined, size: 20),
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        if (loading) ...[
          SkeletonBox(
            width: 190,
            height: MediaQuery.textScalerOf(context).scale(22) * 1.2,
          ),
          const SizedBox(height: 7),
          SkeletonBox(
            width: 145,
            height: MediaQuery.textScalerOf(context).scale(13) * 1.3,
          ),
        ] else ...[
          Text(
            user!.displayName.trim().isEmpty
                ? 'Your profile'
                : user!.displayName,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 22,
              height: 1.2,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 7),
          Text(
            user!.email ?? user!.phoneE164 ?? 'Your 1More account',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 13,
              height: 1.3,
              color: SettingsStyle.muted,
            ),
          ),
        ],
      ],
    ),
  );

  Widget _fallback() => SizedBox(
    width: SettingsStyle.avatarSize,
    height: SettingsStyle.avatarSize,
    child: const LiquidGlassSurface(
      radius: 99,
      padding: EdgeInsets.zero,
      child: Icon(Icons.person_outline, color: SettingsStyle.icon, size: 50),
    ),
  );
}

class SettingsSkeleton extends StatelessWidget {
  const SettingsSkeleton({super.key});

  @override
  Widget build(BuildContext context) => AppSkeleton(
    label: 'Loading your profile and settings',
    child: Column(
      children: [
        const SettingsProfileHeader(loading: true),
        for (var i = 0; i < 5; i++)
          const Padding(
            padding: EdgeInsets.only(bottom: SettingsStyle.tileGap),
            child: SettingsMenuTile(
              icon: Icons.person_outline,
              title: '',
              subtitle: '',
              loading: true,
            ),
          ),
      ],
    ),
  );
}

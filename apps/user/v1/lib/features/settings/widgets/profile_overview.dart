import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/auth/models/user.model.dart';

Color _profileIconColor(IconData icon) {
  if ([
    Icons.payments_outlined,
    Icons.savings_outlined,
    Icons.account_balance_wallet_outlined,
  ].contains(icon)) {
    return const Color(0xFF26835B);
  }
  if ([
    Icons.contacts_outlined,
    Icons.report_problem_outlined,
    Icons.logout_rounded,
  ].contains(icon)) {
    return const Color(0xFFD65A54);
  }
  if ([Icons.handshake_outlined, Icons.hourglass_empty].contains(icon)) {
    return const Color(0xFFB87B22);
  }
  if ([
    Icons.privacy_tip_outlined,
    Icons.description_outlined,
    Icons.quiz_outlined,
  ].contains(icon)) {
    return const Color(0xFF7965B3);
  }
  return RideTokens.accent;
}

class ProfileIdentity extends StatelessWidget {
  final UserModel user;
  final Map<String, dynamic>? brand;
  final VoidCallback onPhoto;
  final bool busy;
  const ProfileIdentity({
    super.key,
    required this.user,
    this.brand,
    required this.onPhoto,
    this.busy = false,
  });
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 22),
    child: Column(
      children: [
        SizedBox(
          width: 90,
          height: 90,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(
                child: Semantics(
                  button: true,
                  label: 'Change profile photo',
                  child: InkWell(
                    onTap: busy ? null : onPhoto,
                    customBorder: const CircleBorder(),
                    child: ClipOval(
                      child: user.avatarUrl?.isNotEmpty == true
                          ? Image.network(
                              user.avatarUrl!,
                              fit: BoxFit.cover,
                              cacheWidth: 270,
                              errorBuilder: (_, _, _) => _fallback(),
                            )
                          : _fallback(),
                    ),
                  ),
                ),
              ),
              if (brand != null)
                Positioned(
                  right: -3,
                  bottom: -3,
                  child: Container(
                    width: 34,
                    height: 34,
                    padding: const EdgeInsets.all(5),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: RideTokens.line),
                    ),
                    child: '${brand!['logo_url'] ?? ''}'.isEmpty
                        ? const Icon(Icons.directions_car_outlined, size: 20)
                        : Image.network(
                            '${brand!['logo_url']}',
                            fit: BoxFit.contain,
                            cacheWidth: 102,
                            errorBuilder: (_, _, _) => const Icon(
                              Icons.directions_car_outlined,
                              size: 20,
                            ),
                          ),
                  ),
                ),
              if (busy)
                const Positioned.fill(
                  child: SkeletonBox(height: 90, circle: true),
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Text(
          user.displayName.isEmpty ? 'Your profile' : user.displayName,
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 20,
            height: 1.2,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          user.email ?? user.phoneE164 ?? 'Your 1More account',
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 12,
            color: RideTokens.muted,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    ),
  );
  Widget _fallback() => const ColoredBox(
    color: Color(0xFFF8F8F8),
    child: Icon(Icons.person_outline, size: 42, color: RideTokens.accent),
  );
}

class ProfileStat extends StatelessWidget {
  final IconData icon;
  final String title, value;
  const ProfileStat({
    super.key,
    required this.icon,
    required this.title,
    required this.value,
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      border: Border.all(color: RideTokens.line),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: const BoxDecoration(
            color: Color(0xFFF8F8F8),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, size: 18, color: _profileIconColor(icon)),
        ),
        const SizedBox(height: 12),
        Text(
          value,
          style: const TextStyle(
            fontSize: 18,
            height: 1.2,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: const TextStyle(
            fontSize: 12,
            height: 1.3,
            color: RideTokens.muted,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    ),
  );
}

class ProfileSection extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const ProfileSection({
    super.key,
    required this.title,
    required this.children,
  });
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(top: 14),
    padding: const EdgeInsets.fromLTRB(14, 16, 14, 6),
    decoration: BoxDecoration(
      color: const Color(0xFFFAFAFA),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 7),
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 12,
              color: RideTokens.muted,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        ...children,
      ],
    ),
  );
}

class ProfileRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback? onTap;
  final bool busy;
  const ProfileRow({
    super.key,
    required this.icon,
    required this.title,
    this.onTap,
    this.busy = false,
  });
  @override
  Widget build(BuildContext context) => Material(
    type: MaterialType.transparency,
    child: ListTile(
      contentPadding: EdgeInsets.zero,
      minLeadingWidth: 20,
      horizontalTitleGap: 12,
      leading: Icon(icon, size: 20, color: _profileIconColor(icon)),
      title: Text(
        title,
        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
      trailing: busy
          ? const SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : onTap == null
          ? null
          : const Icon(Icons.chevron_right, size: 17, color: RideTokens.muted),
      onTap: busy ? null : onTap,
    ),
  );
}

class ProfileOverviewSkeleton extends StatelessWidget {
  const ProfileOverviewSkeleton({super.key});
  @override
  Widget build(BuildContext context) => AppSkeleton(
    label: 'Loading profile',
    child: Column(
      children: [
        const SizedBox(height: 22),
        const SkeletonBox(width: 90, height: 90, circle: true),
        const SizedBox(height: 14),
        const SkeletonBox(width: 150, height: 20),
        const SizedBox(height: 8),
        const SkeletonBox(width: 180, height: 12),
        const SizedBox(height: 24),
        for (var i = 0; i < 2; i++)
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Row(
              children: [
                Expanded(child: SkeletonBox(height: 132)),
                SizedBox(width: 8),
                Expanded(child: SkeletonBox(height: 132)),
              ],
            ),
          ),
        for (var i = 0; i < 4; i++)
          const Padding(
            padding: EdgeInsets.only(top: 14),
            child: SkeletonBox(height: 170),
          ),
      ],
    ),
  );
}

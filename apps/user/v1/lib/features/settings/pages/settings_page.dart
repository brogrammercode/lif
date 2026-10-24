import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/settings/widgets/app_mode_tile.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late Future<UserModel> _profile = AuthRepository().currentUser();

  Future<void> _signOut(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text(UserAppCopy.LOG_OUT),
        content: const Text(UserAppCopy.LOG_OUT_CONFIRMATION),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text(UserAppCopy.CANCEL),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text(UserAppCopy.LOG_OUT),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await AuthRepository().signOut();
    if (context.mounted) {
      Navigator.pushNamedAndRemoveUntil(context, AppRoutes.login, (_) => false);
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.SETTINGS,
    child: ListView(
      padding: EdgeInsets.only(bottom: 24.h),
      children: [
        SizedBox(height: 8.h),
        FutureBuilder<UserModel>(
          future: _profile,
          builder: (context, snapshot) {
            final user = snapshot.data;
            return Padding(
              padding: EdgeInsets.only(bottom: 22.h),
              child: InkWell(
                borderRadius: BorderRadius.circular(16.r),
                onTap: () async {
                  await Navigator.pushNamed(context, AppRoutes.profile);
                  if (mounted) {
                    setState(() {
                      _profile = AuthRepository().currentUser();
                    });
                  }
                },
                child: AppCard(
                  child: Row(
                    children: [
                      ClipOval(
                        child: user?.avatarUrl != null
                            ? Image.network(
                                user!.avatarUrl!,
                                width: 58.w,
                                height: 58.w,
                                fit: BoxFit.cover,
                                errorBuilder: (_, error, stack) => _avatar(),
                              )
                            : _avatar(),
                      ),
                      SizedBox(width: 14.w),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.displayName.isNotEmpty == true
                                  ? user!.displayName
                                  : snapshot.connectionState ==
                                        ConnectionState.waiting
                                  ? 'Loading your profile…'
                                  : 'Your profile',
                              style: TextStyle(
                                fontSize: 18.sp,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            SizedBox(height: 4.h),
                            Text(
                              user?.email ??
                                  'View and edit your account details',
                              style: TextStyle(
                                fontSize: 12.sp,
                                color: AppColors.textSecondary,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (user != null)
                              Text(
                                'ID ${user.id}',
                                style: TextStyle(
                                  fontSize: 11.sp,
                                  color: AppColors.textTertiary,
                                ),
                              ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.chevron_right,
                        color: AppColors.primaryGreen,
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
        FutureBuilder<UserModel>(
          future: _profile,
          builder: (context, snapshot) => snapshot.hasData
              ? AppModeTile(
                  key: ValueKey('mode-${snapshot.data!.id}'),
                  user: snapshot.data!,
                )
              : const SizedBox.shrink(),
        ),
        const AppSectionLabel('Partner with 1More'),
        SizedBox(height: 10.h),
        _tile(
          context,
          Icons.handshake_outlined,
          'Partner Program',
          AppRoutes.partnerProgram,
        ),
        SizedBox(height: 12.h),
        const AppSectionLabel('Your journeys'),
        SizedBox(height: 10.h),
        FutureBuilder<UserModel>(
          future: _profile,
          builder: (context, snapshot) => snapshot.hasData
              ? FutureBuilder<AppMode>(
                  future: AppModeRepository().preferred(snapshot.data!),
                  builder: (context, mode) => _tile(
                    context,
                    Icons.history,
                    mode.data == AppMode.driver
                        ? 'Driver trips'
                        : UserAppCopy.RIDES,
                    mode.data == AppMode.driver
                        ? AppRoutes.driverRides
                        : AppRoutes.rides,
                  ),
                )
              : _tile(
                  context,
                  Icons.history,
                  UserAppCopy.RIDES,
                  AppRoutes.rides,
                ),
        ),
        _tile(
          context,
          Icons.place_outlined,
          UserAppCopy.SAVED_PLACES,
          AppRoutes.savedPlaces,
        ),
        _tile(
          context,
          Icons.notifications_none,
          UserAppCopy.NOTIFICATIONS,
          AppRoutes.notifications,
        ),
        _tile(
          context,
          Icons.credit_card_outlined,
          UserAppCopy.PAYMENT_METHODS,
          AppRoutes.paymentMethods,
        ),
        _tile(
          context,
          Icons.health_and_safety_outlined,
          UserAppCopy.EMERGENCY_CONTACTS,
          AppRoutes.emergencyContacts,
        ),
        SizedBox(height: 12.h),
        const AppSectionLabel('Help and account'),
        SizedBox(height: 10.h),
        _tile(
          context,
          Icons.support_agent,
          UserAppCopy.SUPPORT,
          AppRoutes.support,
        ),
        SizedBox(height: 16.h),
        ListTile(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14.r),
          ),
          tileColor: AppColors.pureWhite,
          leading: const Icon(Icons.logout, color: AppColors.googleRed),
          title: const Text(
            UserAppCopy.LOG_OUT,
            style: TextStyle(
              color: AppColors.googleRed,
              fontWeight: FontWeight.w700,
            ),
          ),
          onTap: () => _signOut(context),
        ),
      ],
    ),
  );

  Widget _avatar() => Container(
    width: 58.w,
    height: 58.w,
    color: AppColors.primaryGreen.withValues(alpha: 0.1),
    child: Icon(
      Icons.person_outline,
      color: AppColors.primaryGreen,
      size: 30.w,
    ),
  );

  Widget _tile(
    BuildContext context,
    IconData icon,
    String title,
    String route,
  ) => Padding(
    padding: EdgeInsets.only(bottom: 10.h),
    child: ListTile(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14.r),
        side: const BorderSide(color: AppColors.borderGrey),
      ),
      tileColor: AppColors.pureWhite,
      leading: Icon(icon, color: AppColors.primaryGreen, size: 22.w),
      title: Text(
        title,
        style: TextStyle(
          fontSize: 14.sp,
          fontWeight: FontWeight.w700,
          color: AppColors.textPrimary,
        ),
      ),
      trailing: Icon(
        Icons.chevron_right,
        size: 20.w,
        color: AppColors.textTertiary,
      ),
      onTap: () => Navigator.pushNamed(context, route),
    ),
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/user_app/user_app.constant.dart';

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

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
        _tile(
          context,
          Icons.person_outline,
          UserAppCopy.PROFILE,
          AppRoutes.profile,
        ),
        _tile(context, Icons.history, UserAppCopy.RIDES, AppRoutes.rides),
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

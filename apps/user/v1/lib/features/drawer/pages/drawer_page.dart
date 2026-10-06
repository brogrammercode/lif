import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
import 'package:user/components/ui/app_logo.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class DrawerPage extends StatefulWidget {
  const DrawerPage({super.key});
  @override
  State<DrawerPage> createState() => _DrawerPageState();
}

class _DrawerPageState extends State<DrawerPage> {
  final UserAppRepository _repository = UserAppRepository();
  late Future<Map<String, dynamic>> _profile = _repository.profile();

  void _open(String route) {
    Navigator.pop(context);
    Navigator.pushNamed(context, route);
  }

  Future<void> _signOut() async {
    final confirm = await showDialog<bool>(
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
    if (confirm != true) return;
    await AuthRepository().signOut();
    if (mounted)
      Navigator.pushNamedAndRemoveUntil(context, AppRoutes.login, (_) => false);
  }

  @override
  Widget build(BuildContext context) => Drawer(
    backgroundColor: AppColors.pureWhite,
    child: SafeArea(
      child: Column(
        children: [
          Padding(
            padding: EdgeInsets.fromLTRB(20.w, 12.h, 20.w, 0),
            child: Align(
              alignment: Alignment.centerLeft,
              child: AppLogo(width: 120.w, height: 48.h),
            ),
          ),
          FutureBuilder<Map<String, dynamic>>(
            future: _profile,
            builder: (context, snapshot) {
              final user = snapshot.hasData
                  ? UserModel.fromJson(snapshot.data!)
                  : null;
              return InkWell(
                onTap: () => _open(AppRoutes.profile),
                child: Padding(
                  padding: EdgeInsets.all(20.w),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 30.r,
                        backgroundColor: AppColors.softGrey,
                        backgroundImage: user?.avatar_url == null
                            ? null
                            : NetworkImage(user!.avatar_url!),
                        child: user?.avatar_url == null
                            ? Icon(
                                Icons.person_outline,
                                color: AppColors.primaryGreen,
                                size: 28.w,
                              )
                            : null,
                      ),
                      SizedBox(width: 14.w),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user?.display_name.isNotEmpty == true
                                  ? user!.display_name
                                  : UserAppCopy.PROFILE,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 16.sp,
                                fontWeight: FontWeight.w900,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            SizedBox(height: 3.h),
                            Text(
                              user?.email ?? '',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12.sp,
                                color: AppColors.textSecondary,
                              ),
                            ),
                            SizedBox(height: 7.h),
                            Text(
                              'EDIT PROFILE',
                              style: TextStyle(
                                fontSize: 10.sp,
                                fontWeight: FontWeight.w900,
                                color: AppColors.primaryGreen,
                                letterSpacing: 0.6,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
          Divider(height: 1.h, color: AppColors.borderGrey),
          Expanded(
            child: ListView(
              padding: EdgeInsets.symmetric(vertical: 8.h),
              children: [
                _tile(Icons.history, UserAppCopy.RIDES, AppRoutes.rides),
                _tile(
                  Icons.bookmark_border,
                  UserAppCopy.SAVED_PLACES,
                  AppRoutes.savedPlaces,
                ),
                _tile(
                  Icons.notifications_none,
                  UserAppCopy.NOTIFICATIONS,
                  AppRoutes.notifications,
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(20.w, 18.h, 20.w, 8.h),
                  child: Text(
                    'ACCOUNT',
                    style: TextStyle(
                      fontSize: 11.sp,
                      fontWeight: FontWeight.w900,
                      color: AppColors.textTertiary,
                      letterSpacing: 0.8,
                    ),
                  ),
                ),
                _tile(
                  Icons.credit_card_outlined,
                  UserAppCopy.PAYMENT_METHODS,
                  AppRoutes.paymentMethods,
                ),
                _tile(
                  Icons.health_and_safety_outlined,
                  UserAppCopy.EMERGENCY_CONTACTS,
                  AppRoutes.emergencyContacts,
                ),
                _tile(
                  Icons.support_agent,
                  UserAppCopy.SUPPORT,
                  AppRoutes.support,
                ),
                _tile(
                  Icons.settings_outlined,
                  UserAppCopy.SETTINGS,
                  AppRoutes.settings,
                ),
              ],
            ),
          ),
          Divider(height: 1.h, color: AppColors.borderGrey),
          ListTile(
            leading: const Icon(Icons.logout, color: AppColors.googleRed),
            title: const Text(
              UserAppCopy.LOG_OUT,
              style: TextStyle(
                color: AppColors.googleRed,
                fontWeight: FontWeight.w700,
              ),
            ),
            onTap: _signOut,
          ),
          SizedBox(height: 8.h),
        ],
      ),
    ),
  );

  Widget _tile(IconData icon, String label, String route) => ListTile(
    leading: Icon(icon, color: AppColors.textPrimary, size: 21.w),
    title: Text(
      label,
      style: TextStyle(
        fontSize: 14.sp,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
    ),
    trailing: Icon(
      Icons.chevron_right,
      size: 18.w,
      color: AppColors.textTertiary,
    ),
    onTap: () => _open(route),
  );
}

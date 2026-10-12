import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});
  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  final UserAppRepository _repository = UserAppRepository();
  late Future<List<Map<String, dynamic>>> _notifications = _repository
      .notifications();
  Future<void> _reload() async {
    setState(() => _notifications = _repository.notifications());
    await _notifications;
  }

  Future<void> _markRead(Map<String, dynamic> item) async {
    if (item['read_at'] != null) return;
    try {
      await _repository.readNotification('${item['id']}');
      await _reload();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.NOTIFICATIONS,
    scrollable: true,
    child: FutureBuilder<List<Map<String, dynamic>>>(
      future: _notifications,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: _reload,
          );
        }
        if (!snapshot.hasData) {
          return const Center(
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryGreen,
            ),
          );
        }
        if (snapshot.data!.isEmpty) {
          return RefreshIndicator(
            onRefresh: _reload,
            color: AppColors.primaryGreen,
            child: ListView(
              children: [
                SizedBox(height: 140.h),
                const AppEmptyState(
                  icon: Icons.notifications_none,
                  title: UserAppCopy.EMPTY_NOTIFICATIONS,
                  subtitle: UserAppCopy.EMPTY_NOTIFICATIONS_DESCRIPTION,
                ),
              ],
            ),
          );
        }
        return RefreshIndicator(
          color: AppColors.primaryGreen,
          onRefresh: _reload,
          child: ListView.separated(
            padding: EdgeInsets.fromLTRB(16.w, 4.h, 16.w, 24.h),
            itemCount: snapshot.data!.length,
            separatorBuilder: (_, _) => SizedBox(height: 10.h),
            itemBuilder: (context, index) {
              final item = snapshot.data![index];
              final unread = item['read_at'] == null;
              return InkWell(
                onTap: () => _markRead(item),
                borderRadius: BorderRadius.circular(16.r),
                child: AppCard(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 42.w,
                        height: 42.w,
                        decoration: BoxDecoration(
                          color: unread
                              ? const Color(0xFFE8F5E9)
                              : AppColors.softGrey,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          _icon('${item['type']}'),
                          size: 20.w,
                          color: AppColors.primaryGreen,
                        ),
                      ),
                      SizedBox(width: 12.w),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${item['title'] ?? ''}',
                              style: TextStyle(
                                fontSize: 14.sp,
                                fontWeight: unread
                                    ? FontWeight.w900
                                    : FontWeight.w700,
                                color: AppColors.textPrimary,
                              ),
                            ),
                            SizedBox(height: 4.h),
                            Text(
                              '${item['body'] ?? ''}',
                              style: TextStyle(
                                fontSize: 12.sp,
                                color: AppColors.textSecondary,
                                height: 1.4,
                              ),
                            ),
                            SizedBox(height: 7.h),
                            Text(
                              _date(item['created_at']),
                              style: TextStyle(
                                fontSize: 10.sp,
                                color: AppColors.textTertiary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (unread)
                        Container(
                          width: 7.w,
                          height: 7.w,
                          decoration: const BoxDecoration(
                            color: AppColors.primaryGreen,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    ),
  );

  IconData _icon(String type) => type == 'PAYMENT_UPDATE'
      ? Icons.credit_card
      : type == 'SAFETY'
      ? Icons.health_and_safety_outlined
      : type == 'RIDE_UPDATE'
      ? Icons.directions_bike
      : Icons.notifications_none;
  String _date(dynamic value) {
    final parsed = DateTime.tryParse('$value');
    if (parsed == null) return '';
    return '${parsed.day}/${parsed.month}/${parsed.year}';
  }
}

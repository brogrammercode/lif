import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class RidesPage extends StatefulWidget {
  const RidesPage({super.key});
  @override
  State<RidesPage> createState() => _RidesPageState();
}

class _RidesPageState extends State<RidesPage> {
  final UserAppRepository _repository = UserAppRepository();
  late Future<List<Map<String, dynamic>>> _rides = _repository.rides();
  Future<void> _refresh() async {
    setState(() => _rides = _repository.rides());
    await _rides;
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: UserAppCopy.RIDES,
    scrollable: true,
    child: FutureBuilder<List<Map<String, dynamic>>>(
      future: _rides,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: _refresh,
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
        final rides = snapshot.data!;
        if (rides.isEmpty) {
          return RefreshIndicator(
            onRefresh: _refresh,
            color: AppColors.primaryGreen,
            child: ListView(
              children: [
                SizedBox(height: 140.h),
                const AppEmptyState(
                  icon: Icons.directions_bike_outlined,
                  title: UserAppCopy.EMPTY_RIDES,
                  subtitle: UserAppCopy.EMPTY_RIDES_DESCRIPTION,
                ),
              ],
            ),
          );
        }
        return RefreshIndicator(
          color: AppColors.primaryGreen,
          onRefresh: _refresh,
          child: ListView.separated(
            padding: EdgeInsets.fromLTRB(16.w, 4.h, 16.w, 24.h),
            itemCount: rides.length,
            separatorBuilder: (_, _) => SizedBox(height: 12.h),
            itemBuilder: (context, index) => _rideCard(context, rides[index]),
          ),
        );
      },
    ),
  );

  Widget _rideCard(BuildContext context, Map<String, dynamic> ride) {
    final status = '${ride['status'] ?? ''}'.replaceAll('_', ' ');
    final pickup = '${ride['pickup_address'] ?? ''}';
    final dropoff = '${ride['dropoff_address'] ?? ''}';
    return InkWell(
      onTap: () => Navigator.pushNamed(
        context,
        AppRoutes.rideDetail,
        arguments: ride['id'],
      ),
      borderRadius: BorderRadius.circular(16.r),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    status,
                    style: TextStyle(
                      fontSize: 13.sp,
                      fontWeight: FontWeight.w900,
                      color: AppColors.primaryGreen,
                    ),
                  ),
                ),
                Text(
                  _date(ride['created_at']),
                  style: TextStyle(
                    fontSize: 11.sp,
                    color: AppColors.textTertiary,
                  ),
                ),
              ],
            ),
            SizedBox(height: 14.h),
            _locationLine(Icons.circle, pickup),
            Padding(
              padding: EdgeInsets.only(left: 5.w),
              child: Container(
                width: 1.w,
                height: 18.h,
                color: AppColors.borderGrey,
              ),
            ),
            _locationLine(Icons.location_on, dropoff),
            SizedBox(height: 12.h),
            Row(
              children: [
                Text(
                  '₹${ride['final_fare'] ?? ride['estimated_fare'] ?? '—'}',
                  style: TextStyle(
                    fontSize: 16.sp,
                    fontWeight: FontWeight.w900,
                    color: AppColors.textPrimary,
                  ),
                ),
                const Spacer(),
                Icon(
                  Icons.chevron_right,
                  size: 20.w,
                  color: AppColors.textTertiary,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _locationLine(IconData icon, String label) => Row(
    children: [
      Icon(icon, size: 11.w, color: AppColors.primaryGreen),
      SizedBox(width: 10.w),
      Expanded(
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13.sp,
            fontWeight: FontWeight.w600,
            color: AppColors.textPrimary,
          ),
        ),
      ),
    ],
  );
  String _date(dynamic value) {
    final date = DateTime.tryParse('${value ?? ''}');
    if (date == null) return '';
    return '${date.day}/${date.month}/${date.year}';
  }
}

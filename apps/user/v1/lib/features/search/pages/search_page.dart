import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
import 'package:user/core/routes.dart';

class SearchPage extends StatelessWidget {
  const SearchPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFAFAFA),
      body: Column(
        children: [
          SizedBox(height: MediaQuery.of(context).padding.top),
          SizedBox(
            height: 286.h,
            child: Stack(
              children: [
                Positioned.fill(child: _buildMapBackground()),
                Positioned(
                  left: 16.w,
                  right: 16.w,
                  top: 12.h,
                  child: _buildHeader(context),
                ),
                Positioned(
                  right: 16.w,
                  bottom: 18.h,
                  child: _buildLocationButton(),
                ),
              ],
            ),
          ),
          Expanded(
            child: Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: AppColors.pureWhite,
                borderRadius: BorderRadius.vertical(top: Radius.circular(24.r)),
                boxShadow: const [
                  BoxShadow(
                    color: AppColors.shadowColor,
                    blurRadius: 8,
                    offset: Offset(0, -4),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(height: 12.h),
                  Center(
                    child: Container(
                      width: 40.w,
                      height: 4.h,
                      decoration: BoxDecoration(
                        color: AppColors.borderGrey,
                        borderRadius: BorderRadius.circular(2.r),
                      ),
                    ),
                  ),
                  SizedBox(height: 18.h),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16.w),
                    child: _buildLocationInputs(context),
                  ),
                  SizedBox(height: 20.h),
                  Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16.w),
                    child: Text(
                      'Choose a ride',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  SizedBox(height: 8.h),
                  Expanded(child: _buildRideOptions(context)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _buildIconButton(
          Icons.chevron_left_rounded,
          () => Navigator.pop(context),
        ),
        _buildIconButton(Icons.notifications_none_rounded, () {}),
      ],
    );
  }

  Widget _buildIconButton(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44.w,
        height: 44.w,
        decoration: const BoxDecoration(
          color: AppColors.pureWhite,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: AppColors.shadowColor,
              blurRadius: 8,
              offset: Offset(0, 4),
            ),
          ],
        ),
        alignment: Alignment.center,
        child: Icon(icon, color: AppColors.textPrimary, size: 24.w),
      ),
    );
  }

  Widget _buildLocationButton() {
    return Container(
      width: 46.w,
      height: 46.w,
      decoration: BoxDecoration(
        color: const Color(0xFF2563EB),
        borderRadius: BorderRadius.circular(14.r),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF2563EB).withValues(alpha: 0.28),
            blurRadius: 10,
            offset: const Offset(0, 5),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Icon(
        Icons.my_location_rounded,
        color: AppColors.pureWhite,
        size: 22.w,
      ),
    );
  }

  Widget _buildMapBackground() {
    return Container(
      color: const Color(0xFFF2F2F2),
      child: Stack(
        children: [
          Positioned(
            left: 24.w,
            top: 86.h,
            child: _buildMapLabel('San Francisco', 16.sp, Colors.black54),
          ),
          Positioned(
            right: 74.w,
            top: 66.h,
            child: _buildMapLabel('Maiden Lane', 12.sp, Colors.black38),
          ),
          Positioned(
            right: 120.w,
            top: 128.h,
            child: _buildMapLabel('NOB HILL', 10.sp, Colors.black38),
          ),
          Positioned(
            left: 42.w,
            bottom: 54.h,
            child: _buildMapLabel('UNION SQUARE', 10.sp, Colors.black38),
          ),
          Positioned(
            right: 126.w,
            bottom: 48.h,
            child: _buildMapLabel('Geary Street', 12.sp, Colors.black38),
          ),
          Positioned(
            left: 138.w,
            top: 108.h,
            child: CustomPaint(
              size: Size(142.w, 104.h),
              painter: RoutePainter(),
            ),
          ),
          Positioned(left: 128.w, top: 98.h, child: _buildPickupMarker()),
          Positioned(left: 268.w, top: 184.h, child: _buildDropoffMarker()),
        ],
      ),
    );
  }

  Widget _buildMapLabel(String label, double size, Color color) {
    return Text(
      label,
      style: TextStyle(
        fontSize: size,
        color: color,
        fontWeight: FontWeight.w600,
      ),
    );
  }

  Widget _buildPickupMarker() {
    return Container(
      width: 26.w,
      height: 26.w,
      decoration: BoxDecoration(
        color: const Color(0xFF2563EB).withValues(alpha: 0.18),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Container(
        width: 10.w,
        height: 10.w,
        decoration: const BoxDecoration(
          color: Color(0xFF2563EB),
          shape: BoxShape.circle,
        ),
      ),
    );
  }

  Widget _buildDropoffMarker() {
    return Stack(
      alignment: Alignment.center,
      children: [
        Icon(
          Icons.location_on_rounded,
          color: const Color(0xFF2563EB),
          size: 34.w,
        ),
        Positioned(
          top: 10.h,
          child: Container(
            width: 8.w,
            height: 8.w,
            decoration: const BoxDecoration(
              color: AppColors.pureWhite,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLocationInputs(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: AppColors.pureWhite,
        borderRadius: BorderRadius.circular(18.r),
        border: Border.all(color: AppColors.borderGrey),
        boxShadow: const [
          BoxShadow(
            color: AppColors.shadowColor,
            blurRadius: 8,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: EdgeInsets.only(top: 5.h),
            child: Column(
              children: [
                Container(
                  width: 9.w,
                  height: 9.w,
                  decoration: const BoxDecoration(
                    color: Color(0xFF2563EB),
                    shape: BoxShape.circle,
                  ),
                ),
                SizedBox(height: 6.h),
                SizedBox(
                  height: 30.h,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: List.generate(
                      4,
                      (index) => Container(
                        width: 2.w,
                        height: 4.h,
                        color: AppColors.borderGrey,
                      ),
                    ),
                  ),
                ),
                SizedBox(height: 4.h),
                Icon(
                  Icons.location_on_rounded,
                  color: AppColors.textTertiary,
                  size: 18.w,
                ),
              ],
            ),
          ),
          SizedBox(width: 14.w),
          Expanded(
            child: Column(
              children: [
                _buildLocationRow(
                  context,
                  'Pickup',
                  'San Francisco, California 94117',
                  Icons.add_rounded,
                ),
                Padding(
                  padding: EdgeInsets.symmetric(vertical: 12.h),
                  child: Container(height: 1.h, color: AppColors.borderGrey),
                ),
                _buildLocationRow(
                  context,
                  'Drop-off',
                  'Market Street',
                  Icons.swap_vert_rounded,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLocationRow(
    BuildContext context,
    String label,
    String address,
    IconData actionIcon,
  ) {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label.toUpperCase(),
                style: TextStyle(
                  fontSize: 10.sp,
                  color: AppColors.textTertiary,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8,
                ),
              ),
              SizedBox(height: 4.h),
              Text(
                address,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall,
              ),
            ],
          ),
        ),
        SizedBox(width: 8.w),
        Container(
          width: 28.w,
          height: 28.w,
          decoration: BoxDecoration(
            color: const Color(0xFFF2F6FF),
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.borderGrey),
          ),
          alignment: Alignment.center,
          child: Icon(actionIcon, color: const Color(0xFF2563EB), size: 18.w),
        ),
      ],
    );
  }

  Widget _buildRideOptions(BuildContext context) {
    final rides = [
      const _RideOption(
        'Tesla Model 3',
        '\$25.10',
        '2 min away',
        5,
        true,
        false,
      ),
      const _RideOption(
        'Tesla Cybertruck',
        '\$68.00',
        '5 min away',
        5,
        true,
        false,
      ),
      const _RideOption(
        'Tesla Model Y',
        '\$32.22',
        '4 min away',
        7,
        false,
        false,
      ),
      const _RideOption(
        'Jaguar I-PACE',
        '\$55.00',
        '10 min away',
        4,
        false,
        true,
      ),
    ];

    return ListView.separated(
      padding: EdgeInsets.fromLTRB(16.w, 0, 16.w, 24.h),
      itemCount: rides.length,
      separatorBuilder: (context, index) => SizedBox(height: 10.h),
      itemBuilder: (context, index) => _buildRideItem(context, rides[index]),
    );
  }

  Widget _buildRideItem(BuildContext context, _RideOption ride) {
    return Opacity(
      opacity: ride.isUnavailable ? 0.5 : 1,
      child: Material(
        color: AppColors.pureWhite,
        borderRadius: BorderRadius.circular(16.r),
        child: InkWell(
          borderRadius: BorderRadius.circular(16.r),
          onTap: ride.isUnavailable
              ? null
              : () => Navigator.pushNamed(context, AppRoutes.ride),
          child: Container(
            padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.h),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16.r),
              border: Border.all(
                color: ride.isRecommended
                    ? const Color(0xFF2563EB)
                    : AppColors.borderGrey,
                width: ride.isRecommended ? 1.5.w : 1.w,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 58.w,
                  height: 48.h,
                  decoration: BoxDecoration(
                    color: AppColors.softGrey,
                    borderRadius: BorderRadius.circular(12.r),
                  ),
                  alignment: Alignment.center,
                  child: Icon(
                    Icons.directions_car_rounded,
                    size: 32.w,
                    color: AppColors.textPrimary,
                  ),
                ),
                SizedBox(width: 12.w),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              ride.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.titleSmall,
                            ),
                          ),
                          if (ride.isRecommended) _buildFasterBadge(),
                        ],
                      ),
                      SizedBox(height: 6.h),
                      Row(
                        children: [
                          Text(
                            ride.time,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          SizedBox(width: 10.w),
                          Icon(
                            Icons.person_rounded,
                            size: 14.w,
                            color: AppColors.textSecondary,
                          ),
                          SizedBox(width: 3.w),
                          Text(
                            ride.seats.toString(),
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                SizedBox(width: 8.w),
                Text(
                  ride.price,
                  style: TextStyle(
                    fontSize: 16.sp,
                    fontWeight: FontWeight.w900,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFasterBadge() {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 4.h),
      decoration: BoxDecoration(
        color: const Color(0xFF2563EB),
        borderRadius: BorderRadius.circular(10.r),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.bolt_rounded, color: AppColors.pureWhite, size: 12.w),
          SizedBox(width: 3.w),
          Text(
            'Faster',
            style: TextStyle(
              fontSize: 10.sp,
              color: AppColors.pureWhite,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

class _RideOption {
  final String name;
  final String price;
  final String time;
  final int seats;
  final bool isRecommended;
  final bool isUnavailable;

  const _RideOption(
    this.name,
    this.price,
    this.time,
    this.seats,
    this.isRecommended,
    this.isUnavailable,
  );
}

class RoutePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF2563EB)
      ..strokeWidth = 4.w
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width * 0.28, 0)
      ..lineTo(size.width * 0.36, size.height)
      ..lineTo(size.width * 0.68, size.height * 0.9)
      ..lineTo(size.width, size.height * 0.62);

    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

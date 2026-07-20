import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
import 'package:user/core/routes.dart';

enum RideState { searching, heading, arriving, arrived }

class RidePage extends StatefulWidget {
  const RidePage({super.key});

  @override
  State<RidePage> createState() => _RidePageState();
}

class _RidePageState extends State<RidePage> {
  RideState _currentState = RideState.searching;

  @override
  Widget build(BuildContext context) {
    if (_currentState == RideState.arrived) {
      return _buildArrivedPage(context);
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF2F2F2),
      body: Column(
        children: [
          SizedBox(
            height: MediaQuery.of(context).size.height * 0.42,
            child: Stack(
              children: [
                Positioned.fill(child: _buildMapBackground()),
                SafeArea(
                  child: Padding(
                    padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 10.h),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _buildIconButton(
                          Icons.chevron_left_rounded,
                          () => Navigator.pop(context),
                        ),
                        _buildIconButton(Icons.notifications_none_rounded, () {}),
                      ],
                    ),
                  ),
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
            child: _buildRideSheet(context),
          ),
        ],
      ),
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
      color: _currentState == RideState.searching
          ? const Color(0xFFEAF1FF)
          : const Color(0xFFF2F2F2),
      child: Stack(
        children: [
          Positioned(
            left: 24.w,
            top: 132.h,
            child: Text(
              'San Francisco',
              style: TextStyle(
                fontSize: 18.sp,
                color: Colors.black54,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Positioned(
            right: 64.w,
            top: 96.h,
            child: Text(
              'Maiden Lane',
              style: TextStyle(
                fontSize: 12.sp,
                color: Colors.black38,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Positioned(
            left: 42.w,
            top: 248.h,
            child: Text(
              'Union Square',
              style: TextStyle(
                fontSize: 12.sp,
                color: Colors.black38,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Positioned(
            left: 128.w,
            top: 150.h,
            child: CustomPaint(
              size: Size(170.w, 150.h),
              painter: RoutePainter(
                progress: _currentState == RideState.searching
                    ? 0.18
                    : _currentState == RideState.heading
                        ? 0.52
                        : 0.82,
              ),
            ),
          ),
          Positioned(
            left: 118.w,
            top: 140.h,
            child: _buildPickupMarker(),
          ),
          Positioned(
            left: 274.w,
            top: 242.h,
            child: _buildDropoffMarker(),
          ),
          Positioned(
            left: _currentState == RideState.searching ? 88.w : 192.w,
            top: _currentState == RideState.arriving ? 236.h : 190.h,
            child: _buildCarMarker(),
          ),
          if (_currentState == RideState.searching)
            Center(
              child: Container(
                width: 250.w,
                height: 250.w,
                decoration: BoxDecoration(
                  color: const Color(0xFF2563EB).withValues(alpha: 0.06),
                  shape: BoxShape.circle,
                ),
                alignment: Alignment.center,
                child: Container(
                  width: 150.w,
                  height: 150.w,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2563EB).withValues(alpha: 0.08),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            ),
        ],
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
        Icon(Icons.location_on_rounded, color: const Color(0xFF2563EB), size: 34.w),
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

  Widget _buildCarMarker() {
    return Container(
      width: 44.w,
      height: 44.w,
      decoration: const BoxDecoration(
        color: AppColors.deepOnyx,
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
      child: Icon(
        Icons.directions_car_rounded,
        color: AppColors.pureWhite,
        size: 24.w,
      ),
    );
  }

  Widget _buildRideSheet(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.pureWhite,
        borderRadius: BorderRadius.vertical(top: Radius.circular(28.r)),
        boxShadow: const [
          BoxShadow(
            color: AppColors.shadowColor,
            blurRadius: 10,
            offset: Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          children: [
            SizedBox(height: 12.h),
            Container(
              width: 42.w,
              height: 4.h,
              decoration: BoxDecoration(
                color: AppColors.borderGrey,
                borderRadius: BorderRadius.circular(2.r),
              ),
            ),
            Flexible(
              child: SingleChildScrollView(
                padding: EdgeInsets.fromLTRB(20.w, 20.h, 20.w, 20.h),
                child: _buildSheetContent(context),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSheetContent(BuildContext context) {
    switch (_currentState) {
      case RideState.searching:
        return _buildSearchingContent();
      case RideState.heading:
        return _buildHeadingContent();
      case RideState.arriving:
        return _buildArrivingContent();
      case RideState.arrived:
        return const SizedBox.shrink();
    }
  }

  Widget _buildSearchingContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSheetHeader(
          icon: Icons.search_rounded,
          title: 'Finding you a nearby driver',
          subtitle: 'We are connecting you with the nearest available driver.',
        ),
        SizedBox(height: 22.h),
        _buildProgressBar(0.75, '75%'),
        SizedBox(height: 24.h),
        _buildPrimaryButton(
          label: 'Driver found',
          onTap: () => setState(() => _currentState = RideState.heading),
        ),
        SizedBox(height: 12.h),
        _buildCancelButton(),
      ],
    );
  }

  Widget _buildHeadingContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildTripHeader('Heading to pickup', '5 mins'),
        SizedBox(height: 16.h),
        _buildProgressBar(0.36, '1.8 km'),
        SizedBox(height: 22.h),
        _buildDriverCard(showCallButton: true),
        SizedBox(height: 20.h),
        Row(
          children: [
            Expanded(child: _buildTripStat('Speed', '42 km/h')),
            SizedBox(width: 12.w),
            Expanded(child: _buildTripStat('Remainder', '1.8 km')),
            SizedBox(width: 12.w),
            Expanded(child: _buildTripStat('Fare', '\$12.20')),
          ],
        ),
        SizedBox(height: 22.h),
        _buildPrimaryButton(
          label: 'Arriving now',
          onTap: () => setState(() => _currentState = RideState.arriving),
        ),
        SizedBox(height: 12.h),
        _buildCancelButton(),
      ],
    );
  }

  Widget _buildArrivingContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildTripHeader('Arriving in 3 mins', '12:39'),
        SizedBox(height: 18.h),
        _buildDriverCard(showCallButton: false),
        SizedBox(height: 22.h),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Status',
              style: TextStyle(
                fontSize: 16.sp,
                fontWeight: FontWeight.w900,
                color: AppColors.textPrimary,
              ),
            ),
            Text(
              'See Detail >',
              style: TextStyle(
                fontSize: 13.sp,
                fontWeight: FontWeight.w800,
                color: const Color(0xFF2563EB),
              ),
            ),
          ],
        ),
        SizedBox(height: 14.h),
        _buildStatusTimeline(
          'Driver is on the way',
          'Arriving at your pickup point',
          '12:39 PM',
          true,
        ),
        _buildStatusTimeline(
          'Passenger pickup',
          'Heading to destination',
          '12:45 PM',
          false,
        ),
        _buildStatusTimeline(
          'Trip completed',
          'Thank you for riding with us',
          '12:55 PM',
          false,
          isLast: true,
        ),
        SizedBox(height: 20.h),
        Row(
          children: [
            Expanded(
              child: Container(
                height: 48.h,
                padding: EdgeInsets.symmetric(horizontal: 14.w),
                decoration: BoxDecoration(
                  color: AppColors.softGrey,
                  borderRadius: BorderRadius.circular(14.r),
                  border: Border.all(color: AppColors.borderGrey),
                ),
                alignment: Alignment.centerLeft,
                child: Text(
                  'Chat with your driver',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13.sp,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            SizedBox(width: 12.w),
            _buildSquareAction(Icons.chat_bubble_outline_rounded),
          ],
        ),
        SizedBox(height: 20.h),
        _buildPrimaryButton(
          label: 'Complete trip',
          onTap: () => setState(() => _currentState = RideState.arrived),
        ),
      ],
    );
  }

  Widget _buildSheetHeader({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 52.w,
          height: 52.w,
          decoration: const BoxDecoration(
            color: Color(0xFF2563EB),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Icon(icon, color: AppColors.pureWhite, size: 26.w),
        ),
        SizedBox(width: 14.w),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 18.sp,
                  fontWeight: FontWeight.w900,
                  color: AppColors.textPrimary,
                ),
              ),
              SizedBox(height: 6.h),
              Text(
                subtitle,
                style: TextStyle(
                  fontSize: 13.sp,
                  fontWeight: FontWeight.w600,
                  color: AppColors.textSecondary,
                  height: 1.3,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTripHeader(String title, String value) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 18.sp,
              fontWeight: FontWeight.w900,
              color: AppColors.textPrimary,
            ),
          ),
        ),
        SizedBox(width: 12.w),
        Text(
          value,
          style: TextStyle(
            fontSize: 15.sp,
            fontWeight: FontWeight.w900,
            color: const Color(0xFF2563EB),
          ),
        ),
      ],
    );
  }

  Widget _buildProgressBar(double progress, String label) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(5.r),
          child: LinearProgressIndicator(
            minHeight: 8.h,
            value: progress,
            backgroundColor: AppColors.borderGrey,
            valueColor: const AlwaysStoppedAnimation<Color>(Color(0xFF2563EB)),
          ),
        ),
        SizedBox(height: 8.h),
        Text(
          label,
          style: TextStyle(
            color: const Color(0xFF2563EB),
            fontSize: 12.sp,
            fontWeight: FontWeight.w900,
          ),
        ),
      ],
    );
  }

  Widget _buildDriverCard({required bool showCallButton}) {
    return Container(
      padding: EdgeInsets.all(14.w),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: AppColors.borderGrey),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 22.r,
            backgroundColor: AppColors.borderGrey,
            child: Icon(Icons.person_rounded, color: AppColors.textSecondary, size: 24.w),
          ),
          SizedBox(width: 12.w),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        'Jack Suli',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 15.sp,
                          fontWeight: FontWeight.w900,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    SizedBox(width: 8.w),
                    Icon(Icons.star_rounded, size: 15.w, color: Colors.orange),
                    SizedBox(width: 2.w),
                    Text(
                      '5.0',
                      style: TextStyle(
                        fontSize: 12.sp,
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                SizedBox(height: 5.h),
                Text(
                  'Tesla Model 3 - White - 9XYZ456',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.sp,
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          if (showCallButton) ...[
            SizedBox(width: 10.w),
            _buildSquareAction(Icons.call_outlined),
          ],
        ],
      ),
    );
  }

  Widget _buildSquareAction(IconData icon) {
    return Container(
      width: 44.w,
      height: 44.w,
      decoration: BoxDecoration(
        color: AppColors.softGrey,
        borderRadius: BorderRadius.circular(12.r),
      ),
      alignment: Alignment.center,
      child: Icon(icon, color: AppColors.textPrimary, size: 20.w),
    );
  }

  Widget _buildTripStat(String label, String value) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 12.w, vertical: 12.h),
      decoration: BoxDecoration(
        color: AppColors.softGrey,
        borderRadius: BorderRadius.circular(14.r),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11.sp,
              color: AppColors.textSecondary,
              fontWeight: FontWeight.w700,
            ),
          ),
          SizedBox(height: 4.h),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: FontWeight.w900,
              color: AppColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusTimeline(
    String title,
    String subtitle,
    String time,
    bool isActive, {
    bool isLast = false,
  }) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Icon(
              Icons.location_on_rounded,
              size: 20.w,
              color: isActive ? const Color(0xFF2563EB) : AppColors.textTertiary,
            ),
            if (!isLast)
              Container(
                width: 2.w,
                height: 34.h,
                color: AppColors.borderGrey,
              ),
          ],
        ),
        SizedBox(width: 12.w),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.w800,
                  color: isActive ? AppColors.textPrimary : AppColors.textSecondary,
                ),
              ),
              SizedBox(height: 4.h),
              Text(
                subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 12.sp,
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              SizedBox(height: 13.h),
            ],
          ),
        ),
        SizedBox(width: 8.w),
        Text(
          time,
          style: TextStyle(
            fontSize: 11.sp,
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }

  Widget _buildPrimaryButton({
    required String label,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        height: 50.h,
        decoration: BoxDecoration(
          color: const Color(0xFF2563EB),
          borderRadius: BorderRadius.circular(14.r),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            fontSize: 15.sp,
            fontWeight: FontWeight.w900,
            color: AppColors.pureWhite,
          ),
        ),
      ),
    );
  }

  Widget _buildCancelButton() {
    return GestureDetector(
      onTap: () => Navigator.pop(context),
      child: Container(
        width: double.infinity,
        height: 48.h,
        decoration: BoxDecoration(
          border: Border.all(color: const Color(0xFFFFD1D1)),
          borderRadius: BorderRadius.circular(14.r),
          color: const Color(0xFFFFF5F5),
        ),
        alignment: Alignment.center,
        child: Text(
          'Cancel Ride',
          style: TextStyle(
            fontSize: 15.sp,
            fontWeight: FontWeight.w800,
            color: Colors.red,
          ),
        ),
      ),
    );
  }

  Widget _buildArrivedPage(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.pureWhite,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 18.h),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Row(
                children: [
                  _buildIconButton(
                    Icons.chevron_left_rounded,
                    () => Navigator.pop(context),
                  ),
                  Expanded(
                    child: Center(
                      child: Text(
                        "You've arrived",
                        style: TextStyle(
                          fontSize: 18.sp,
                          fontWeight: FontWeight.w900,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                  ),
                  SizedBox(width: 44.w),
                ],
              ),
              SizedBox(height: 34.h),
              Container(
                width: 112.w,
                height: 112.w,
                decoration: BoxDecoration(
                  color: AppColors.softGrey,
                  borderRadius: BorderRadius.circular(24.r),
                ),
                alignment: Alignment.center,
                child: Icon(
                  Icons.directions_car_rounded,
                  size: 64.w,
                  color: AppColors.textPrimary,
                ),
              ),
              SizedBox(height: 16.h),
              Text(
                'Jack Suli',
                style: TextStyle(
                  fontSize: 22.sp,
                  fontWeight: FontWeight.w900,
                  color: AppColors.textPrimary,
                ),
              ),
              SizedBox(height: 5.h),
              Text(
                'Tesla Model 3 - 9XYZ456',
                style: TextStyle(
                  fontSize: 13.sp,
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
              SizedBox(height: 28.h),
              _buildReceiptCard(),
              SizedBox(height: 28.h),
              Text(
                'How was your trip?',
                style: TextStyle(
                  fontSize: 18.sp,
                  fontWeight: FontWeight.w900,
                  color: AppColors.textPrimary,
                ),
              ),
              SizedBox(height: 8.h),
              Text(
                'Rate your experience with your driver and trip comfort',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13.sp,
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                  height: 1.35,
                ),
              ),
              SizedBox(height: 16.h),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  5,
                  (index) => Padding(
                    padding: EdgeInsets.symmetric(horizontal: 3.w),
                    child: Icon(
                      Icons.star_rounded,
                      color: index < 4
                          ? const Color(0xFF2563EB)
                          : AppColors.borderGrey,
                      size: 38.w,
                    ),
                  ),
                ),
              ),
              SizedBox(height: 30.h),
              Row(
                children: [
                  Expanded(
                    child: _buildSecondaryAction(
                      'Back to home',
                      () => Navigator.pushNamedAndRemoveUntil(
                        context,
                        AppRoutes.home,
                        (route) => false,
                      ),
                    ),
                  ),
                  SizedBox(width: 12.w),
                  Expanded(
                    child: _buildDownloadAction(),
                  ),
                ],
              ),
              SizedBox(height: 20.h),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReceiptCard() {
    return Container(
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: const Color(0xFFFAFAFA),
        borderRadius: BorderRadius.circular(18.r),
        border: Border.all(color: AppColors.borderGrey),
      ),
      child: Column(
        children: [
          _buildLocationRow('Pickup point', 'Union Square, CA'),
          SizedBox(height: 14.h),
          _buildLocationRow('Drop-off point', 'Market Street, CA'),
          Padding(
            padding: EdgeInsets.symmetric(vertical: 16.h),
            child: Container(height: 1.h, color: AppColors.borderGrey),
          ),
          _buildReceiptRow('Trip fare', '\$20.00'),
          SizedBox(height: 12.h),
          _buildReceiptRow('Booking fee', '\$2.00'),
          SizedBox(height: 12.h),
          _buildReceiptRow('Discount applied', '-\$5.00', isDiscount: true),
          Padding(
            padding: EdgeInsets.symmetric(vertical: 16.h),
            child: Container(height: 1.h, color: AppColors.borderGrey),
          ),
          _buildReceiptRow('Total payment', '\$17.00', isTotal: true),
        ],
      ),
    );
  }

  Widget _buildLocationRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13.sp,
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
        SizedBox(width: 14.w),
        Expanded(
          child: Text(
            value,
            textAlign: TextAlign.right,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13.sp,
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildReceiptRow(
    String label,
    String value, {
    bool isDiscount = false,
    bool isTotal = false,
  }) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: isTotal ? 16.sp : 14.sp,
            fontWeight: isTotal ? FontWeight.w900 : FontWeight.w700,
            color: isTotal ? AppColors.textPrimary : AppColors.textSecondary,
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: isTotal ? 16.sp : 14.sp,
            fontWeight: isTotal ? FontWeight.w900 : FontWeight.w800,
            color: isDiscount ? Colors.green : AppColors.textPrimary,
          ),
        ),
      ],
    );
  }

  Widget _buildSecondaryAction(String label, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 50.h,
        decoration: BoxDecoration(
          color: AppColors.softGrey,
          borderRadius: BorderRadius.circular(14.r),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 14.sp,
            fontWeight: FontWeight.w800,
            color: AppColors.textPrimary,
          ),
        ),
      ),
    );
  }

  Widget _buildDownloadAction() {
    return Container(
      height: 50.h,
      decoration: BoxDecoration(
        color: const Color(0xFF2563EB),
        borderRadius: BorderRadius.circular(14.r),
      ),
      alignment: Alignment.center,
      child: Text(
        'Download receipt',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontSize: 14.sp,
          fontWeight: FontWeight.w900,
          color: AppColors.pureWhite,
        ),
      ),
    );
  }
}

class RoutePainter extends CustomPainter {
  final double progress;

  const RoutePainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final basePaint = Paint()
      ..color = AppColors.borderGrey
      ..strokeWidth = 5.w
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final activePaint = Paint()
      ..color = const Color(0xFF2563EB)
      ..strokeWidth = 5.w
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width * 0.32, 0)
      ..lineTo(size.width * 0.42, size.height * 0.9)
      ..lineTo(size.width * 0.7, size.height * 0.84)
      ..lineTo(size.width, size.height * 0.62);

    canvas.drawPath(path, basePaint);

    final metrics = path.computeMetrics().toList();
    for (final metric in metrics) {
      canvas.drawPath(
        metric.extractPath(0, metric.length * progress.clamp(0, 1)),
        activePaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant RoutePainter oldDelegate) {
    return oldDelegate.progress != progress;
  }
}

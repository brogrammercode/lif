import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF9F9F9),
      body: Stack(
        children: [
          SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 10.h),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildTopBar(),
                  SizedBox(height: 24.h),
                  _buildLocation(),
                  SizedBox(height: 20.h),
                  _buildMapCard(),
                  SizedBox(height: 20.h),
                  _buildSearchBar(context),
                  SizedBox(height: 24.h),
                  _buildServices(),
                  SizedBox(height: 24.h),
                  Text(
                    'Waiting...',
                    style: TextStyle(
                      fontSize: 18.sp,
                      fontWeight: FontWeight.w700,
                      color: Colors.black,
                    ),
                  ),
                  SizedBox(height: 16.h),
                  _buildWaitingCard(),
                  SizedBox(height: 24.h),
                  _buildActivityHeader(),
                  SizedBox(height: 16.h),
                  _buildActivityItem(),
                  SizedBox(height: 100.h),
                ],
              ),
            ),
          ),
          _buildBottomNav(),
        ],
      ),
    );
  }

  Widget _buildTopBar() {
    return Row(
      children: [
        _buildIconContainer(Icons.menu_rounded),
        SizedBox(width: 16.w),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Morning',
              style: TextStyle(
                fontSize: 12.sp,
                color: Colors.grey.shade600,
                fontWeight: FontWeight.w700,
              ),
            ),
            Text(
              'Olivia Rod!',
              style: TextStyle(
                fontSize: 22.sp,
                fontWeight: FontWeight.w700,
                color: Colors.black,
              ),
            ),
          ],
        ),
        const Spacer(),
        _buildIconContainer(Icons.notifications_none_rounded),
      ],
    );
  }

  Widget _buildLocation() {
    return Row(
      children: [
        Container(
          width: 44.w,
          height: 44.w,
          decoration: const BoxDecoration(
            color: Color(0xFF2C64E3),
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: Text(
            'OR',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 16.sp,
            ),
          ),
        ),
        SizedBox(width: 12.w),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Address selected',
                style: TextStyle(
                  fontSize: 12.sp,
                  color: Colors.grey.shade600,
                  fontWeight: FontWeight.w700,
                ),
              ),
              Text(
                'San Francisco, California 94117',
                style: TextStyle(
                  fontSize: 14.sp,
                  fontWeight: FontWeight.w700,
                  color: Colors.black,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
        SizedBox(width: 12.w),
        _buildIconContainer(Icons.location_on_rounded),
      ],
    );
  }

  Widget _buildMapCard() {
    return Container(
      width: double.infinity,
      height: 160.h,
      decoration: BoxDecoration(
        color: const Color(0xFFE5E5E5),
        borderRadius: BorderRadius.circular(24.r),
      ),
      child: Stack(
        children: [
          Positioned(
            left: 40.w,
            top: 40.h,
            child: Text(
              'San Francisco',
              style: TextStyle(
                color: Colors.black54,
                fontSize: 18.sp,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Positioned(
            right: 80.w,
            bottom: 40.h,
            child: Text(
              'Geary Street',
              style: TextStyle(
                color: Colors.black38,
                fontSize: 12.sp,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          Positioned(
            left: 110.w,
            top: 45.h,
            child: Container(
              width: 16.w,
              height: 16.w,
              decoration: BoxDecoration(
                color: const Color(0xFF2C64E3).withValues(alpha: 0.3),
                shape: BoxShape.circle,
              ),
              alignment: Alignment.center,
              child: Container(
                width: 8.w,
                height: 8.w,
                decoration: const BoxDecoration(
                  color: Color(0xFF2C64E3),
                  shape: BoxShape.circle,
                ),
              ),
            ),
          ),
          Positioned(left: 150.w, top: 20.h, child: _buildCarMarker(0)),
          Positioned(right: 60.w, top: 50.h, child: _buildCarMarker(45)),
          Positioned(left: 80.w, bottom: 40.h, child: _buildCarMarker(90)),
          Positioned(right: 120.w, bottom: 20.h, child: _buildCarMarker(-45)),
          Positioned(right: 40.w, bottom: 70.h, child: _buildCarMarker(10)),
        ],
      ),
    );
  }

  Widget _buildCarMarker(double angle) {
    return Transform.rotate(
      angle: angle * 3.14159 / 180,
      child: Container(
        width: 14.w,
        height: 24.h,
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(4.r),
        ),
        child: Column(
          children: [
            Container(
              height: 6.h,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.vertical(top: Radius.circular(4.r)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSearchBar(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/search'),
      child: Container(
        padding: EdgeInsets.symmetric(horizontal: 16.w, vertical: 12.h),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16.r),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.03),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          children: [
            Icon(Icons.search_rounded, color: Colors.grey.shade500, size: 22.w),
            SizedBox(width: 12.w),
            Text(
              'Search',
              style: TextStyle(
                fontSize: 16.sp,
                color: Colors.grey.shade500,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            Icon(Icons.qr_code_scanner_rounded, color: Colors.black, size: 22.w),
          ],
        ),
      ),
    );
  }

  Widget _buildServices() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        _buildServiceItem('Car', Icons.directions_car_rounded),
        _buildServiceItem('Ride', Icons.electric_scooter_rounded),
        _buildServiceItem('Rent', Icons.car_rental_rounded),
        _buildServiceItem('Send', Icons.inventory_2_rounded),
        _buildServiceItem('Menu', Icons.grid_view_rounded),
      ],
    );
  }

  Widget _buildServiceItem(String title, IconData icon) {
    return Column(
      children: [
        Container(
          width: 64.w,
          height: 64.w,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16.r),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Icon(icon, size: 32.w, color: Colors.grey.shade800),
        ),
        SizedBox(height: 8.h),
        Text(
          title,
          style: TextStyle(
            fontSize: 12.sp,
            fontWeight: FontWeight.w700,
            color: Colors.black87,
          ),
        ),
      ],
    );
  }

  Widget _buildWaitingCard() {
    return Container(
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24.r),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '9XYZ456',
                    style: TextStyle(
                      fontSize: 20.sp,
                      fontWeight: FontWeight.w700,
                      color: Colors.black,
                    ),
                  ),
                  SizedBox(height: 4.h),
                  Text(
                    'Tesla Model 3 - 2 min away',
                    style: TextStyle(
                      fontSize: 13.sp,
                      color: Colors.grey.shade600,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              const Spacer(),
              Icon(Icons.directions_car_rounded, size: 50.w, color: Colors.black54),
            ],
          ),
          SizedBox(height: 16.h),
          Row(
            children: List.generate(
              40,
              (index) => Expanded(
                child: Container(
                  height: 1.h,
                  color: index.isEven ? Colors.grey.shade300 : Colors.transparent,
                ),
              ),
            ),
          ),
          SizedBox(height: 16.h),
          Row(
            children: [
              Container(
                width: 40.w,
                height: 40.w,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  color: Color(0xFFE5E5E5),
                ),
                alignment: Alignment.center,
                child: Icon(Icons.person_rounded, color: Colors.grey.shade600),
              ),
              SizedBox(width: 12.w),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Jack Suli',
                    style: TextStyle(
                      fontSize: 15.sp,
                      fontWeight: FontWeight.w700,
                      color: Colors.black,
                    ),
                  ),
                  SizedBox(height: 4.h),
                  Row(
                    children: [
                      Icon(Icons.star_rounded, size: 14.w, color: Colors.grey.shade500),
                      SizedBox(width: 2.w),
                      Text(
                        '5.0',
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: Colors.grey.shade600,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      SizedBox(width: 8.w),
                      Icon(Icons.check_circle_rounded, size: 12.w, color: Colors.grey.shade500),
                      SizedBox(width: 2.w),
                      Text(
                        '4.8',
                        style: TextStyle(
                          fontSize: 12.sp,
                          color: Colors.grey.shade600,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const Spacer(),
              _buildActionButton(Icons.chat_bubble_outline_rounded),
              SizedBox(width: 8.w),
              _buildActionButton(Icons.call_outlined),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildActionButton(IconData icon) {
    return Container(
      width: 44.w,
      height: 44.w,
      decoration: BoxDecoration(
        color: const Color(0xFFF2F2F2),
        borderRadius: BorderRadius.circular(12.r),
      ),
      alignment: Alignment.center,
      child: Icon(icon, color: Colors.black87, size: 20.w),
    );
  }

  Widget _buildActivityHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          'Activity History',
          style: TextStyle(
            fontSize: 18.sp,
            fontWeight: FontWeight.w700,
            color: Colors.black,
          ),
        ),
        Row(
          children: [
            Text(
              'See Detail',
              style: TextStyle(
                fontSize: 13.sp,
                fontWeight: FontWeight.w700,
                color: const Color(0xFF2C64E3),
              ),
            ),
            SizedBox(width: 4.w),
            Icon(Icons.arrow_forward_rounded, color: const Color(0xFF2C64E3), size: 16.w),
          ],
        ),
      ],
    );
  }

  Widget _buildActivityItem() {
    return Row(
      children: [
        Container(
          width: 48.w,
          height: 48.w,
          decoration: BoxDecoration(
            color: const Color(0xFFF2F2F2),
            borderRadius: BorderRadius.circular(12.r),
          ),
          alignment: Alignment.center,
          child: Icon(Icons.directions_car_rounded, size: 24.w, color: Colors.black54),
        ),
        SizedBox(width: 12.w),
        Expanded(
          child: Text(
            'Mission District, Califor...',
            style: TextStyle(
              fontSize: 14.sp,
              fontWeight: FontWeight.w700,
              color: Colors.black87,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        SizedBox(width: 8.w),
        Text(
          '\$68.00',
          style: TextStyle(
            fontSize: 15.sp,
            fontWeight: FontWeight.w700,
            color: Colors.black,
          ),
        ),
      ],
    );
  }

  Widget _buildIconContainer(IconData icon) {
    return Container(
      width: 44.w,
      height: 44.w,
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Icon(icon, color: Colors.black87, size: 20.w),
    );
  }

  Widget _buildBottomNav() {
    return Positioned(
      bottom: 20.h,
      left: 20.w,
      right: 20.w,
      child: Container(
        height: 64.h,
        padding: EdgeInsets.symmetric(horizontal: 8.w),
        decoration: BoxDecoration(
          color: const Color(0xFF2C2C2E),
          borderRadius: BorderRadius.circular(32.r),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.2),
              blurRadius: 20,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Container(
              padding: EdgeInsets.symmetric(horizontal: 20.w, vertical: 12.h),
              decoration: BoxDecoration(
                color: const Color(0xFF2C64E3),
                borderRadius: BorderRadius.circular(24.r),
              ),
              child: Row(
                children: [
                  Icon(Icons.home_filled, color: Colors.white, size: 20.w),
                  SizedBox(width: 8.w),
                  Text(
                    'Home',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 14.sp,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            _buildNavIcon(Icons.swap_horiz_rounded),
            _buildNavIcon(Icons.access_time_rounded),
            _buildNavIcon(Icons.favorite_border_rounded),
            _buildNavIcon(Icons.person_outline_rounded),
          ],
        ),
      ),
    );
  }

  Widget _buildNavIcon(IconData icon) {
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: 16.w),
      child: Icon(icon, color: Colors.grey.shade400, size: 24.w),
    );
  }
}

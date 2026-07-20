import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/_data_dummy/login_page.dart';
import 'package:user/features/auth/constants/user.constant.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.pureWhite,
      body: Column(
        children: [
          SizedBox(height: MediaQuery.of(context).padding.top),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return SingleChildScrollView(
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: constraints.maxHeight,
                    ),
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: 24.w),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          SizedBox(height: 28.h),
                          _buildBrandHeader(),
                          SizedBox(height: 40.h),
                          _buildHeroPanel(),
                          SizedBox(height: 32.h),
                          _buildTitleBlock(context),
                          SizedBox(height: 24.h),
                          _buildFeatureStrip(),
                          SizedBox(height: 56.h),
                          _buildGoogleButton(context),
                          SizedBox(height: 14.h),
                          _buildTermsText(),
                          SizedBox(height: 24.h),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBrandHeader() {
    return Row(
      children: [
        Container(
          width: 44.w,
          height: 44.w,
          decoration: const BoxDecoration(
            color: AppColors.primaryGreen,
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
            size: 22.w,
          ),
        ),
        SizedBox(width: 10.w),
        Text(
          UserConstants.BRAND_NAME,
          style: TextStyle(
            fontSize: 22.sp,
            fontWeight: FontWeight.w900,
            color: AppColors.textPrimary,
          ),
        ),
      ],
    );
  }

  Widget _buildHeroPanel() {
    return Container(
      width: double.infinity,
      padding: EdgeInsets.all(16.w),
      decoration: BoxDecoration(
        color: AppColors.softGrey,
        borderRadius: BorderRadius.circular(16.r),
        border: Border.all(color: AppColors.borderGrey, width: 1.w),
      ),
      child: AspectRatio(
        aspectRatio: 1.18,
        child: Stack(
          children: [
            Positioned(
               left: 14.w,
               top: 18.h,
               child: _buildFoodTile(
                 icon: Icons.electric_scooter_rounded,
                 color: AppColors.googleRed,
                 size: 106.w,
               ),
            ),
            Positioned(
              right: 12.w,
              top: 4.h,
              child: _buildFoodTile(
                icon: Icons.local_taxi_rounded,
                color: AppColors.gold,
                size: 132.w,
              ),
            ),
            Positioned(
              left: 90.w,
              bottom: 20.h,
              child: _buildFoodTile(
                icon: Icons.directions_car_rounded,
                color: AppColors.primaryGreen,
                size: 144.w,
              ),
            ),
            Positioned(
              right: 16.w,
              bottom: 10.h,
              child: _buildSmallBadge(Icons.map_rounded),
            ),
            Positioned(
              left: 18.w,
              bottom: 12.h,
              child: _buildSmallBadge(Icons.two_wheeler_rounded),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFoodTile({
    required IconData icon,
    required Color color,
    required double size,
  }) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppColors.pureWhite,
        borderRadius: BorderRadius.circular(16.r),
        boxShadow: const [
          BoxShadow(
            color: AppColors.shadowColor,
            blurRadius: 8,
            offset: Offset(0, 4),
          ),
        ],
      ),
      alignment: Alignment.center,
      child: Container(
        width: size * 0.62,
        height: size * 0.62,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          shape: BoxShape.circle,
        ),
        alignment: Alignment.center,
        child: Icon(icon, color: color, size: size * 0.34),
      ),
    );
  }

  Widget _buildSmallBadge(IconData icon) {
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
      child: Icon(icon, color: AppColors.pureWhite, size: 20.w),
    );
  }

  Widget _buildTitleBlock(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          UserConstants.LOGIN_SECTION_LABEL,
          style: TextStyle(
            fontSize: 12.sp,
            color: AppColors.textTertiary,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.8,
          ),
        ),
        SizedBox(height: 10.h),
        Text(
          UserConstants.LOGIN_TITLE,
          style: Theme.of(
            context,
          ).textTheme.displayLarge?.copyWith(
            height: 1.06,
            fontWeight: FontWeight.w900,
          ),
        ),
        SizedBox(height: 12.h),
        Text(
          UserConstants.LOGIN_SUBTITLE,
          style: TextStyle(
            fontSize: 14.sp,
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w500,
            height: 1.35,
          ),
        ),
      ],
    );
  }

  Widget _buildFeatureStrip() {
    return Row(
      children: List.generate(loginFeatureItems.length, (index) {
        final item = loginFeatureItems[index];

        return Expanded(
          child: Padding(
            padding: EdgeInsets.only(
              left: index == 0 ? 0.w : 4.w,
              right: index == loginFeatureItems.length - 1 ? 0.w : 4.w,
            ),
            child: Container(
              height: 78.h,
              padding: EdgeInsets.symmetric(horizontal: 8.w, vertical: 10.h),
              decoration: BoxDecoration(
                color: AppColors.pureWhite,
                borderRadius: BorderRadius.circular(12.r),
                border: Border.all(color: AppColors.borderGrey, width: 1.w),
                boxShadow: const [
                  BoxShadow(
                    color: AppColors.shadowColor,
                    blurRadius: 4,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(item.icon, color: AppColors.primaryGreen, size: 20.w),
                  SizedBox(height: 8.h),
                  Text(
                    item.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 11.sp,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildGoogleButton(BuildContext context) {
    return AppButton(
      text: UserConstants.GOOGLE_AUTH_BUTTON,
      backgroundColor: AppColors.pureWhite,
      foregroundColor: AppColors.textPrimary,
      borderColor: AppColors.borderGrey,
      icon: _buildGoogleMark(),
      onPressed: () {
        Navigator.pushReplacementNamed(context, AppRoutes.home);
      },
    );
  }

  Widget _buildGoogleMark() {
    return SizedBox(
      width: 22.w,
      height: 22.w,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(
            UserConstants.GOOGLE_MARK,
            style: TextStyle(
              fontSize: 20.sp,
              color: AppColors.googleBlue,
            ),
          ),
          Positioned(
            right: 0.w,
            bottom: 2.h,
            child: Container(
              width: 8.w,
              height: 4.h,
              color: AppColors.googleGreen,
            ),
          ),
          Positioned(
            left: 1.w,
            bottom: 3.h,
            child: Container(
              width: 5.w,
              height: 5.w,
              decoration: const BoxDecoration(
                color: AppColors.googleYellow,
                shape: BoxShape.circle,
              ),
            ),
          ),
          Positioned(
            top: 2.h,
            left: 1.w,
            child: Container(
              width: 6.w,
              height: 6.w,
              decoration: const BoxDecoration(
                color: AppColors.googleRed,
                shape: BoxShape.circle,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTermsText() {
    return Center(
      child: Text(
        UserConstants.TERMS_TEXT,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: 11.sp,
          color: AppColors.textTertiary,
          fontWeight: FontWeight.w500,
          height: 1.35,
        ),
      ),
    );
  }
}

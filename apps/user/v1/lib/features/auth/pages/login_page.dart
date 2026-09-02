import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/constants/user.constant.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.light,
        statusBarBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: AppColors.deepOnyx,
        body: Stack(
          children: [
            const Positioned.fill(child: _LoginBackground()),
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.04),
                      Colors.black.withValues(alpha: 0.00),
                      Colors.black.withValues(alpha: 0.16),
                    ],
                    stops: const [0.0, 0.48, 1.0],
                  ),
                ),
              ),
            ),
            LayoutBuilder(
              builder: (context, constraints) {
                final screenHeight = constraints.maxHeight;
                final safePadding = MediaQuery.paddingOf(context);

                return Stack(
                  children: [
                    Positioned(
                      top: safePadding.top + 16.h,
                      right: 14.w,
                      child: _buildSkipButton(context),
                    ),
                    Positioned(
                      top: screenHeight * 0.485,
                      left: 0,
                      right: 0,
                      child: _buildSportMatesBadge(),
                    ),
                    Positioned(
                      top: screenHeight * 0.54,
                      left: 22.w,
                      right: 22.w,
                      child: _buildHeadline(),
                    ),
                    Positioned(
                      top: screenHeight * 0.785,
                      left: 22.w,
                      right: 22.w,
                      child: _buildSubtitle(),
                    ),
                    Positioned(
                      top: screenHeight * 0.875,
                      left: 0,
                      right: 0,
                      child: _buildPageIndicator(),
                    ),
                    Positioned(
                      left: 16.w,
                      right: 16.w,
                      bottom: safePadding.bottom + 15.h,
                      child: _buildContinueButton(context),
                    ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSkipButton(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => Navigator.pushReplacementNamed(context, AppRoutes.home),
      child: Padding(
        padding: EdgeInsets.all(8.w),
        child: Text(
          'Skip',
          style: TextStyle(
            color: AppColors.pureWhite.withValues(alpha: 0.86),
            fontSize: 12.sp,
            fontWeight: FontWeight.w500,
            height: 1,
            shadows: const [
              Shadow(
                color: Color(0x66000000),
                blurRadius: 4,
                offset: Offset(0, 1),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSportMatesBadge() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 34.w,
          height: 18.w,
          child: Stack(
            clipBehavior: Clip.none,
            children: const [
              _MateAvatar(
                offset: 0,
                colors: [Color(0xFFD54B4B), Color(0xFF4BB4D5)],
              ),
              _MateAvatar(
                offset: 10,
                colors: [Color(0xFFF7D7B8), Color(0xFF2C6B4F)],
              ),
              _MateAvatar(
                offset: 20,
                colors: [Color(0xFFEBF0F2), Color(0xFFC77A4D)],
              ),
            ],
          ),
        ),
        SizedBox(width: 6.w),
        Text(
          UserConstants.LOGIN_SECTION_LABEL,
          style: TextStyle(
            color: AppColors.pureWhite,
            fontSize: 10.sp,
            fontWeight: FontWeight.w700,
            height: 1,
            shadows: const [
              Shadow(
                color: Color(0x99000000),
                blurRadius: 4,
                offset: Offset(0, 1),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildHeadline() {
    return Text(
      UserConstants.LOGIN_TITLE,
      textAlign: TextAlign.center,
      style: TextStyle(
        color: AppColors.pureWhite,
        fontSize: 43.sp,
        fontWeight: FontWeight.w900,
        height: 1.13,
        letterSpacing: 0,
        shadows: const [
          Shadow(color: Color(0x73000000), blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
    );
  }

  Widget _buildSubtitle() {
    return Text(
      UserConstants.LOGIN_SUBTITLE,
      textAlign: TextAlign.center,
      style: TextStyle(
        color: AppColors.pureWhite.withValues(alpha: 0.88),
        fontSize: 13.sp,
        fontWeight: FontWeight.w500,
        height: 1.35,
        letterSpacing: 0,
        shadows: const [
          Shadow(color: Color(0x73000000), blurRadius: 5, offset: Offset(0, 1)),
        ],
      ),
    );
  }

  Widget _buildPageIndicator() {
    return Center(
      child: Container(
        width: 18.w,
        height: 5.h,
        decoration: BoxDecoration(
          color: AppColors.pureWhite,
          borderRadius: BorderRadius.circular(999.r),
          boxShadow: const [
            BoxShadow(
              color: Color(0x33000000),
              blurRadius: 4,
              offset: Offset(0, 1),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContinueButton(BuildContext context) {
    return SizedBox(
      height: 50.h,
      child: ElevatedButton(
        onPressed: () =>
            Navigator.pushReplacementNamed(context, AppRoutes.home),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.pureWhite,
          foregroundColor: AppColors.textPrimary,
          elevation: 0,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(999.r),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildGoogleMark(),
            SizedBox(width: 10.w),
            Flexible(
              child: Text(
                UserConstants.GOOGLE_AUTH_BUTTON,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 15.sp,
                  fontWeight: FontWeight.w500,
                  height: 1,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGoogleMark() {
    return SizedBox(
      width: 20.w,
      height: 20.w,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(
            UserConstants.GOOGLE_MARK,
            style: TextStyle(
              color: AppColors.googleBlue,
              fontSize: 18.sp,
              fontWeight: FontWeight.w800,
              height: 1,
            ),
          ),
          Positioned(
            right: 0.w,
            bottom: 3.h,
            child: Container(
              width: 7.w,
              height: 3.h,
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
              width: 5.w,
              height: 5.w,
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
}

class _LoginBackground extends StatelessWidget {
  const _LoginBackground();

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      UserConstants.LOGIN_BACKGROUND_ASSET,
      fit: BoxFit.cover,
      alignment: Alignment.topCenter,
      filterQuality: FilterQuality.high,
    );
  }
}

class _MateAvatar extends StatelessWidget {
  final double offset;
  final List<Color> colors;

  const _MateAvatar({required this.offset, required this.colors});

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: offset.w,
      top: 0,
      child: Container(
        width: 18.w,
        height: 18.w,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.pureWhite, width: 1.2.w),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: colors,
          ),
        ),
      ),
    );
  }
}

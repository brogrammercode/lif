import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';

class AppButton extends StatelessWidget {
  final String text;
  final VoidCallback? onPressed;
  final Widget? icon;
  final bool isLoading;
  final bool isFullWidth;
  final Color backgroundColor;
  final Color foregroundColor;
  final Color borderColor;

  const AppButton({
    super.key,
    required this.text,
    required this.onPressed,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = true,
    this.backgroundColor = AppColors.primaryGreen,
    this.foregroundColor = AppColors.pureWhite,
    this.borderColor = AppColors.primaryGreen,
  });

  @override
  Widget build(BuildContext context) {
    final button = SizedBox(
      width: isFullWidth ? double.infinity : null,
      height: 56.h,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: backgroundColor,
          foregroundColor: foregroundColor,
          disabledBackgroundColor: backgroundColor,
          disabledForegroundColor: foregroundColor,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16.r),
            side: BorderSide(color: borderColor, width: 1.w),
          ),
        ),
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 150),
          child: isLoading ? _buildLoader() : _buildContent(),
        ),
      ),
    );

    return button;
  }

  Widget _buildLoader() {
    return SizedBox(
      width: 18.w,
      height: 18.w,
      child: CircularProgressIndicator(
        strokeWidth: 2.w,
        valueColor: AlwaysStoppedAnimation<Color>(foregroundColor),
      ),
    );
  }

  Widget _buildContent() {
    return Row(
      key: const ValueKey<String>('button-content'),
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[icon!, SizedBox(width: 10.w)],
        Flexible(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15.sp,
              fontWeight: FontWeight.w800,
              color: foregroundColor,
            ),
          ),
        ),
      ],
    );
  }
}

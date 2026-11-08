import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/solid_ui.dart';

class AppPage extends StatelessWidget {
  final String title;
  final Widget child;
  final Widget? action;
  final bool scrollable;
  final bool glass;
  const AppPage({
    super.key,
    required this.title,
    required this.child,
    this.action,
    this.scrollable = false,
    this.glass = false,
  });

  @override
  Widget build(BuildContext context) => glass
      ? LiquidGlassPage(
          title: title,
          action: action,
          edgeToEdge: scrollable,
          child: child,
        )
      : Scaffold(
          backgroundColor: const Color(0xFFFAFAFA),
          body: SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: EdgeInsets.fromLTRB(16.w, 8.h, 16.w, 12.h),
                  child: Row(
                    children: [
                      IconButton(
                        onPressed: () => Navigator.maybePop(context),
                        icon: Icon(
                          Icons.arrow_back_ios_new,
                          size: 20.w,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      SizedBox(width: 4.w),
                      Expanded(
                        child: Text(
                          title,
                          style: TextStyle(
                            fontSize: 20.sp,
                            fontWeight: FontWeight.w900,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                      ?action,
                    ],
                  ),
                ),
                Expanded(
                  child: scrollable
                      ? child
                      : Padding(
                          padding: EdgeInsets.symmetric(horizontal: 16.w),
                          child: child,
                        ),
                ),
              ],
            ),
          ),
        );
}

class AppSectionLabel extends StatelessWidget {
  final String text;
  const AppSectionLabel(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Text(
    LiquidGlassTheme.of(context) ? text : text.toUpperCase(),
    style: TextStyle(
      fontSize: 12.sp,
      fontWeight: LiquidGlassTheme.of(context)
          ? FontWeight.w600
          : FontWeight.w800,
      color: LiquidGlassTheme.of(context)
          ? GlassTokens.muted
          : AppColors.textTertiary,
      letterSpacing: LiquidGlassTheme.of(context) ? 0 : 0.8,
    ),
  );
}

class AppEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
  });
  @override
  Widget build(BuildContext context) {
    final glass = LiquidGlassTheme.of(context);
    final content = Padding(
      padding: EdgeInsets.all(glass ? 24 : 28.w),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (glass)
            LiquidGlassSurface(
              radius: 99,
              padding: const EdgeInsets.all(18),
              child: Icon(icon, size: 30, color: GlassTokens.accent),
            )
          else
            Container(
              width: 72.w,
              height: 72.w,
              decoration: const BoxDecoration(
                color: AppColors.softGrey,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 30.w, color: AppColors.primaryGreen),
            ),
          SizedBox(height: glass ? 16 : 16.h),
          Text(
            title,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: glass ? 18 : 18.sp,
              fontWeight: glass ? FontWeight.w600 : FontWeight.w900,
              color: glass ? GlassTokens.ink : AppColors.textPrimary,
            ),
          ),
          SizedBox(height: glass ? 6 : 6.h),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: glass ? 14 : 14.sp,
              color: glass ? GlassTokens.muted : AppColors.textSecondary,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
    return Center(child: glass ? LiquidGlassSurface(child: content) : content);
  }
}

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  const AppCard({super.key, required this.child, this.padding});
  @override
  Widget build(BuildContext context) => SolidTheme.of(context)
      ? SolidSurface(padding: padding ?? const EdgeInsets.all(16), child: child)
      : LiquidGlassTheme.of(context)
      ? SizedBox(
          width: double.infinity,
          child: LiquidGlassSurface(
            padding: padding ?? const EdgeInsets.all(18),
            child: child,
          ),
        )
      : Container(
          width: double.infinity,
          padding: padding ?? EdgeInsets.all(16.w),
          decoration: BoxDecoration(
            color: AppColors.pureWhite,
            borderRadius: BorderRadius.circular(16.r),
            border: Border.all(color: AppColors.borderGrey),
            boxShadow: const [
              BoxShadow(
                color: AppColors.shadowColor,
                blurRadius: 4,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: child,
        );
}

class AppLoadError extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const AppLoadError({super.key, required this.message, required this.onRetry});
  @override
  Widget build(BuildContext context) {
    final glass = LiquidGlassTheme.of(context);
    final content = Padding(
      padding: EdgeInsets.all(glass ? 22 : 24.w),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.wifi_off_rounded,
            size: glass ? 34 : 34.w,
            color: glass ? GlassTokens.accent : AppColors.textTertiary,
          ),
          SizedBox(height: glass ? 12 : 12.h),
          Text(
            message,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: glass ? 14 : 14.sp,
              color: glass ? GlassTokens.muted : AppColors.textSecondary,
              height: 1.4,
            ),
          ),
          SizedBox(height: glass ? 12 : 12.h),
          TextButton(onPressed: onRetry, child: const Text('Try again')),
        ],
      ),
    );
    return Center(child: glass ? LiquidGlassSurface(child: content) : content);
  }
}

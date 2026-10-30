import 'package:flutter/material.dart';
import 'package:user/core/color.dart';

/// One animation for an entire placeholder layout, with a static accessible
/// fallback when animation is disabled or this route is not visible.
class AppSkeleton extends StatefulWidget {
  final Widget child;
  final String label;
  const AppSkeleton({super.key, required this.child, this.label = 'Loading'});

  @override
  State<AppSkeleton> createState() => _AppSkeletonState();
}

class _AppSkeletonState extends State<AppSkeleton>
    with SingleTickerProviderStateMixin {
  late final _animation = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );
  bool _animate = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final media = MediaQuery.of(context);
    _animate =
        !media.disableAnimations &&
        !media.accessibleNavigation &&
        TickerMode.valuesOf(context).enabled;
    if (_animate) {
      if (!_animation.isAnimating) _animation.repeat();
    } else {
      _animation.stop();
    }
  }

  @override
  void dispose() {
    _animation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Semantics(
    container: true,
    liveRegion: true,
    label: widget.label,
    child: ExcludeSemantics(
      child: IgnorePointer(
        child: _SkeletonAnimation(
          animation: _animate ? _animation : null,
          child: widget.child,
        ),
      ),
    ),
  );
}

class _SkeletonAnimation extends InheritedWidget {
  final Animation<double>? animation;
  const _SkeletonAnimation({required this.animation, required super.child});
  @override
  bool updateShouldNotify(_SkeletonAnimation oldWidget) =>
      animation != oldWidget.animation;
}

class SkeletonBox extends StatelessWidget {
  final double? width;
  final double height;
  final bool circle;
  const SkeletonBox({
    super.key,
    this.width,
    required this.height,
    this.circle = false,
  });

  @override
  Widget build(BuildContext context) {
    final animation = context
        .dependOnInheritedWidgetOfExactType<_SkeletonAnimation>()
        ?.animation;
    Widget box([double? phase]) => Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: phase == null ? AppColors.borderGrey : null,
        gradient: phase == null
            ? null
            : LinearGradient(
                begin: Alignment(-3 + phase * 4, 0),
                end: Alignment(-1 + phase * 4, 0),
                colors: [
                  AppColors.borderGrey,
                  Color.lerp(AppColors.borderGrey, Colors.white, .7)!,
                  AppColors.borderGrey,
                ],
              ),
        borderRadius: BorderRadius.circular(circle ? height / 2 : 5),
      ),
    );
    // Paint shimmer only into the placeholder shapes, never over backdrop
    // filters. This avoids a whole-screen saveLayer and preserves glass blur.
    return animation == null
        ? box()
        : AnimatedBuilder(
            animation: animation,
            builder: (_, child) => box(animation.value),
          );
  }
}

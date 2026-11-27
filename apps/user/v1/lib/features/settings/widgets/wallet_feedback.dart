import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';

class WalletShimmer extends StatelessWidget {
  const WalletShimmer({super.key, this.width, this.height = 14});
  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) => AppSkeleton(
    child: SkeletonBox(width: width, height: height),
  );
}

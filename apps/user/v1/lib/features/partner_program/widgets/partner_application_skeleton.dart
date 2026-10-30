import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';

/// Mirrors the current category without decoding private file previews.
class PartnerApplicationSkeleton extends StatelessWidget {
  final int fields;
  final int uploads;
  const PartnerApplicationSkeleton({
    super.key,
    required this.fields,
    required this.uploads,
  });

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    child: AppSkeleton(
      label: 'Loading application category',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          const SkeletonBox(width: 90, height: 13),
          const SizedBox(height: 10),
          const SkeletonBox(height: 4),
          const SizedBox(height: 20),
          const FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: .65,
            child: SkeletonBox(height: 26),
          ),
          const SizedBox(height: 12),
          const SkeletonBox(height: 13),
          const SizedBox(height: 20),
          for (var i = 0; i < fields; i++)
            const LiquidGlassSurface(
              radius: 20,
              margin: EdgeInsets.only(bottom: 20),
              padding: EdgeInsets.all(18),
              child: SkeletonBox(height: 22),
            ),
          for (var i = 0; i < uploads; i++)
            const LiquidGlassSurface(
              margin: EdgeInsets.only(bottom: 20),
              padding: EdgeInsets.all(18),
              child: Column(
                children: [
                  SkeletonBox(width: 42, height: 42),
                  SizedBox(height: 16),
                  SkeletonBox(height: 13),
                  SizedBox(height: 12),
                  SkeletonBox(height: 13),
                ],
              ),
            ),
          const SizedBox(height: 20),
          const LiquidGlassSurface(radius: 28, child: SkeletonBox(height: 20)),
        ],
      ),
    ),
  );
}

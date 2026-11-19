import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/solid_ui.dart';

/// Mirrors the current category without decoding private file previews.
class PartnerApplicationSkeleton extends StatelessWidget {
  final int fields;
  final int uploads;
  final bool document;
  const PartnerApplicationSkeleton({
    super.key,
    required this.fields,
    required this.uploads,
    this.document = false,
  });

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.only(top: 12, bottom: 28),
    child: AppSkeleton(
      label: document ? 'Loading partner policy' : 'Loading application',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 8),
          if (!document) ...[
            const SkeletonBox(width: 90, height: 13),
            const SizedBox(height: 10),
            const SkeletonBox(height: 4),
            const SizedBox(height: 20),
          ],
          const FractionallySizedBox(
            alignment: Alignment.centerLeft,
            widthFactor: .65,
            child: SkeletonBox(height: 26),
          ),
          const SizedBox(height: 12),
          const SkeletonBox(height: 13),
          const SizedBox(height: 20),
          for (var i = 0; i < fields; i++)
            const SolidSurface(
              radius: 14,
              margin: EdgeInsets.only(bottom: 20),
              padding: EdgeInsets.all(18),
              child: SkeletonBox(height: 22),
            ),
          for (var i = 0; i < uploads; i++)
            const SolidSurface(
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
          const SolidSurface(radius: 14, child: SkeletonBox(height: 20)),
        ],
      ),
    ),
  );
}

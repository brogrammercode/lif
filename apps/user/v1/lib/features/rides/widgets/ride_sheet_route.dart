import 'package:flutter/material.dart';

/// Changes the ride controls while leaving the home map mounted and interactive.
class RideSheetRoute<T> extends PageRouteBuilder<T> {
  RideSheetRoute({required WidgetBuilder builder, super.settings})
    : super(
        opaque: false,
        transitionDuration: Duration.zero,
        reverseTransitionDuration: Duration.zero,
        pageBuilder: (context, _, _) => builder(context),
      );

  static bool isSheet(BuildContext context) =>
      ModalRoute.of(context) is RideSheetRoute;

  @override
  Widget buildModalBarrier() => const SizedBox.shrink();
}

Widget reportRideSheetMap<T extends Widget>(T map, ValueChanged<T> update) =>
    Builder(
      builder: (context) {
        final route = ModalRoute.of(context);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted && route?.isCurrent == true) update(map);
        });
        return const SizedBox.shrink();
      },
    );

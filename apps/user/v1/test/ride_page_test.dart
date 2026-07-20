import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/ride/pages/ride_page.dart';

void main() {
  testWidgets('ride page progresses to completed trip', (tester) async {
    await tester.pumpWidget(
      ScreenUtilInit(
        designSize: const Size(411.42857142857144, 843.4285714285714),
        builder: (context, child) {
          return MaterialApp(
            routes: AppRoutes.routes,
            home: const RidePage(),
          );
        },
      ),
    );

    expect(find.text('Finding you a nearby driver'), findsOneWidget);

    await tester.tap(find.text('Driver found'));
    await tester.pumpAndSettle();
    expect(find.text('Heading to pickup'), findsOneWidget);

    await tester.ensureVisible(find.text('Arriving now'));
    await tester.tap(find.text('Arriving now'));
    await tester.pumpAndSettle();
    expect(find.text('Arriving in 3 mins'), findsOneWidget);

    await tester.ensureVisible(find.text('Complete trip'));
    await tester.tap(find.text('Complete trip'));
    await tester.pumpAndSettle();
    expect(find.text("You've arrived"), findsOneWidget);
    expect(find.text('Total payment'), findsOneWidget);
  });
}

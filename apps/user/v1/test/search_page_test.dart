import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/search/pages/search_page.dart';

void main() {
  testWidgets('search page renders rides and opens ride flow', (tester) async {
    await tester.pumpWidget(
      ScreenUtilInit(
        designSize: const Size(411.42857142857144, 843.4285714285714),
        builder: (context, child) {
          return MaterialApp(
            routes: AppRoutes.routes,
            home: const SearchPage(),
          );
        },
      ),
    );

    expect(find.text('Choose a ride'), findsOneWidget);
    expect(find.text('Tesla Model 3'), findsOneWidget);

    await tester.tap(find.text('Tesla Model 3'));
    await tester.pumpAndSettle();

    expect(find.text('Finding you a nearby driver'), findsOneWidget);
  });
}

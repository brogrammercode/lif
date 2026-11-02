import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/auth/pages/login_page.dart';

void main() {
  testWidgets(
    'login remains glass and scrollable on a narrow large-text phone',
    (tester) async {
      tester.view.physicalSize = const Size(320, 568);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        MaterialApp(
          home: MediaQuery(
            data: const MediaQueryData(
              size: Size(320, 568),
              textScaler: TextScaler.linear(2),
            ),
            child: const LoginPage(),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(LiquidGlassBackdrop), findsOneWidget);
      expect(find.byType(LiquidGlassButton), findsOneWidget);
      expect(find.text('Continue with Google'), findsOneWidget);
      expect(find.byType(Scrollable), findsWidgets);
      expect(tester.takeException(), isNull);
    },
  );
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';

Widget _host(Widget child, {double textScale = 1}) => MaterialApp(
  home: MediaQuery(
    data: const MediaQueryData().copyWith(
      textScaler: TextScaler.linear(textScale),
    ),
    child: LiquidGlassScope(
      child: Scaffold(
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: child,
        ),
      ),
    ),
  ),
);

void main() {
  testWidgets('driver summary primitives reflow on a narrow large-text screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      _host(
        const Column(
          children: [
            DriverPageIntro(
              icon: Icons.directions_car_outlined,
              title: 'Vehicle verification status',
              description:
                  'This deliberately long description must remain readable without overflowing the glass panel.',
              trailing: DriverStatusPill(
                label: 'Pending administrator review',
                status: 'PENDING',
              ),
            ),
            SizedBox(height: 12),
            DriverInfoRow(
              label: 'Registration number',
              value: 'A deliberately long registration reference',
            ),
          ],
        ),
        textScale: 2,
      ),
    );
    await tester.pump();

    expect(find.text('Vehicle verification status'), findsOneWidget);
    expect(find.text('Pending administrator review'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/features/driver_operations/widgets/trip_actions_panel.dart';

Widget panel(
  bool driver, {
  String status = 'DRIVER_WAITING',
  String paymentStatus = 'PENDING',
}) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, child) => MaterialApp(
    home: Scaffold(
      body: SingleChildScrollView(
        child: TripActionsPanel(
          rideId: 'ride',
          onChanged: () async {},
          externalContext: {
            'status': status,
            'is_driver': driver,
            'start': {
              'code': '123456',
              'rider_confirmed': false,
              'driver_verified': false,
            },
            'payment': {'status': paymentStatus},
            'payment_options': {'cash': true, 'upi': true},
          },
        ),
      ),
    ),
  ),
);
void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://trip.example.test/api/v2',
    ),
  );
  testWidgets('rider sees the trip code and a separate confirmation action', (
    tester,
  ) async {
    await tester.pumpWidget(panel(false));
    await tester.pumpAndSettle();
    expect(find.text('123456'), findsOneWidget);
    expect(find.text('Confirm pickup and driver'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'driver never displays the rider code even if a malformed payload contains it',
    (tester) async {
      await tester.pumpWidget(panel(true));
      await tester.pumpAndSettle();
      expect(find.text('123456'), findsNothing);
      expect(find.text('Verify trip code'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'rider payment stays pending and has no received confirmation control',
    (tester) async {
      await tester.pumpWidget(panel(false, status: 'COMPLETED'));
      await tester.pumpAndSettle();
      expect(find.text('Payment pending'), findsOneWidget);
      expect(find.text('Confirm full fare received'), findsNothing);
      expect(find.text('Pay driver via UPI'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'resolved and provider-managed payments never offer direct recollection',
    (tester) async {
      for (final status in [
        'AUTHORIZED',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
        'CANCELLED',
      ]) {
        await tester.pumpWidget(
          panel(true, status: 'COMPLETED', paymentStatus: status),
        );
        await tester.pumpAndSettle();
        expect(find.text('Confirm full fare received'), findsNothing);
        expect(find.text('Report unpaid fare'), findsNothing);
        expect(find.text('Pay driver via UPI'), findsNothing);
        expect(find.text('Payment pending'), findsNothing);
        await tester.pumpWidget(const SizedBox.shrink());
      }
    },
  );
}

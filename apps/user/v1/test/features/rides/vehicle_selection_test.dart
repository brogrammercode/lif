import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/pages/vehicle_selection_page.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SelectionRepo extends UserAppRepository {
  final previews = <String>[];
  int bookedPassengers = 0;
  String? bookedQuote;
  @override
  Future<Map<String, dynamic>> rideAvailability(
    String draftId,
    String quoteId,
    String method,
    int passengers,
  ) async {
    previews.add('$quoteId/$method/$passengers');
    return {'items': []};
  }

  @override
  Future<Map<String, dynamic>> requestRide(
    String draftId,
    String quoteId, {
    String method = 'CASH',
    String? note,
    String? requestKey,
    int passengerCount = 1,
  }) async {
    bookedPassengers = passengerCount;
    bookedQuote = quoteId;
    return {'id': draftId, 'status': 'SEARCHING'};
  }
}

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=http://localhost/api/v2',
    ),
  );
  final input = {
    'pickup': {'address': 'Pickup', 'latitude': 25.0, 'longitude': 86.0},
    'dropoff': {'address': 'Destination', 'latitude': 25.1, 'longitude': 86.1},
  };
  Map<String, dynamic> draft() => {
    'id': 'draft',
    'quotes': [
      for (final name in ['Bike', 'Mini'])
        {
          'id': name,
          'total_fare': 42,
          'expires_at': DateTime.now()
              .add(const Duration(minutes: 5))
              .toIso8601String(),
          'distance_m': 2000,
          'duration_s': 300,
          'category_snapshot': {
            'name': name,
            'capacity': name == 'Bike' ? 1 : 4,
            'payment_policy': {
              'cash_enabled': true,
              'direct_upi_enabled': true,
            },
          },
        },
    ],
  };
  testWidgets(
    'category selection and passenger count reach one direct booking without a review detour',
    (tester) async {
      final repo = SelectionRepo();
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MaterialApp(
          routes: {
            AppRoutes.rideDetail: (_) =>
                const Scaffold(body: Text('Finding driver destination')),
          },
          home: VehicleSelectionPage(
            input: input,
            initialQuote: draft(),
            points: const [],
            repository: repo,
            mapBuilder: (_) => const SizedBox(),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mini'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.byIcon(Icons.add_circle_outline),
        100,
        scrollable: find
            .byWidgetPredicate(
              (widget) =>
                  widget is Scrollable &&
                  widget.axisDirection == AxisDirection.down,
            )
            .first,
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.add_circle_outline));
      await tester.pumpAndSettle();
      expect(repo.previews.last, 'Mini/CASH/2');
      await tester.tap(find.textContaining('Continue to book Mini'));
      await tester.pumpAndSettle();
      expect(repo.bookedPassengers, 2);
      expect(repo.bookedQuote, 'Mini');
      expect(find.text('Finding driver destination'), findsOneWidget);
    },
  );
  for (final size in [const Size(320, 568), const Size(568, 320)]) {
    testWidgets(
      'vehicle screen retains reachable action at $size and large text',
      (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        await tester.pumpWidget(
          MaterialApp(
            builder: (_, child) => MediaQuery(
              data: MediaQueryData(
                size: size,
                textScaler: const TextScaler.linear(2),
              ),
              child: child!,
            ),
            home: VehicleSelectionPage(
              input: input,
              initialQuote: draft(),
              points: const [],
              repository: SelectionRepo(),
              mapBuilder: (_) => const SizedBox(),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.textContaining('Continue to book Bike'), findsOneWidget);
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }
}

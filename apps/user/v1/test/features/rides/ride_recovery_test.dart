import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

class RecoveredOperations extends DriverOperationsRepository {
  final RideRepository repo;
  RecoveredOperations(this.repo);
  @override
  Future<Map<String, dynamic>> context(String id) async => {
    'ride_id': id,
    'status': 'COMPLETED',
    'is_driver': false,
    'trip': await repo.ride(id),
    'payment': {'status': 'CAPTURED'},
    'payment_options': {'cash': true, 'upi': false},
  };
}

class RideRepository extends UserAppRepository {
  int requests = 0;
  @override
  Future<Map<String, dynamic>> ride(String id) async {
    requests++;
    return {
      'id': id,
      'status': 'COMPLETED',
      'pickup_address': 'Pickup',
      'dropoff_address': 'Drop-off',
      'final_fare': '50.00',
      'payment': {'status': 'CAPTURED'},
      'review': {'id': 'review'},
    };
  }
}

Widget recoveredRide(RideRepository repo) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, child) => MaterialApp(
    navigatorObservers: [appRouteObserver],
    routes: {AppRoutes.gate: (_) => const Scaffold(body: Text('Account home'))},
    onGenerateInitialRoutes: (_) => [
      MaterialPageRoute<void>(
        settings: const RouteSettings(
          name: AppRoutes.rideDetail,
          arguments: 'ride',
        ),
        builder: (_) => RideDetailPage(
          repository: repo,
          operationsRepository: RecoveredOperations(repo),
        ),
      ),
    ],
  ),
);

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://ride.example.test/api/v2',
    ),
  );

  testWidgets(
    'a restored finished ride can return home without a previous route',
    (tester) async {
      final repo = RideRepository();
      await tester.pumpWidget(recoveredRide(repo));
      await tester.pumpAndSettle();
      expect(
        Navigator.of(
          tester.element(find.text('Your trip is complete')),
        ).canPop(),
        isFalse,
      );
      await tester.scrollUntilVisible(
        find.text('Return to home'),
        250,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Return to home'));
      await tester.pumpAndSettle();
      expect(find.text('Account home'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'resume refreshes a restored ride without returning a Future from setState',
    (tester) async {
      final repo = RideRepository();
      await tester.pumpWidget(recoveredRide(repo));
      await tester.pumpAndSettle();
      expect(repo.requests, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      await tester.pump(const Duration(seconds: 16));
      expect(repo.requests, 1);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(repo.requests, 2);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/driver_vehicles/widgets/driver_vehicle_gate.dart';

class GateRepository extends VehicleVerificationRepository {
  bool eligible = true;
  int requests = 0;
  Future<Map<String, dynamic>>? pending;
  Map<String, dynamic> get data => {
    'user': {'id': 'driver'},
    'vehicles': [
      {
        'id': 'vehicle',
        'make': 'Brand',
        'model': 'Model',
        'plate_number': 'BR01AA1234',
        'status': eligible ? 'ACTIVE' : 'REJECTED',
        'is_eligible': eligible,
        'verification_fields': <Map<String, dynamic>>[],
      },
    ],
  };
  @override
  Future<Map<String, dynamic>> mine() {
    requests++;
    return pending ?? Future.value(data);
  }
}

Widget gate(GateRepository repo, {String partnerStatus = 'ACTIVATED'}) =>
    ScreenUtilInit(
      designSize: const Size(390, 844),
      builder: (_, child) => MaterialApp(
        navigatorObservers: [appRouteObserver],
        home: DriverVehicleGate(
          repository: repo,
          loadUser: () async => UserModel(
            id: 'driver',
            role: 'DRIVER',
            status: 'ACTIVE',
            partnerStatus: partnerStatus,
          ),
          child: const Scaffold(body: Text('Verified driver home')),
        ),
      ),
    );

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://vehicle.example.test/api/v2',
    ),
  );
  testWidgets('rechecks eligibility on resume and blocks a revoked vehicle', (
    tester,
  ) async {
    final repo = GateRepository();
    await tester.pumpWidget(gate(repo));
    await tester.pumpAndSettle();
    expect(find.text('Verified driver home'), findsOneWidget);
    final pending = Completer<Map<String, dynamic>>();
    repo.eligible = false;
    repo.pending = pending.future;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();
    expect(find.text('Verified driver home'), findsNothing);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    pending.complete(repo.data);
    await tester.pumpAndSettle();
    expect(repo.requests, 2);
    expect(find.text('Vehicle registration'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('rechecks home when returning from another route', (
    tester,
  ) async {
    final repo = GateRepository();
    await tester.pumpWidget(gate(repo));
    await tester.pumpAndSettle();
    final navigator = Navigator.of(
      tester.element(find.text('Verified driver home')),
    );
    unawaited(
      navigator.push<void>(
        MaterialPageRoute(
          builder: (_) => const Scaffold(body: Text('Another page')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    repo.eligible = false;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(repo.requests, 1);
    navigator.pop();
    await tester.pumpAndSettle();
    expect(repo.requests, 2);
    expect(find.text('Vehicle registration'), findsOneWidget);
    expect(find.text('Verified driver home'), findsNothing);
  });
  testWidgets('leaves registration intact when a capture route returns', (
    tester,
  ) async {
    final repo = GateRepository()..eligible = false;
    await tester.pumpWidget(gate(repo));
    await tester.pumpAndSettle();
    final navigator = Navigator.of(
      tester.element(find.text('Vehicle registration')),
    );
    unawaited(
      navigator.push<void>(
        MaterialPageRoute(
          builder: (_) => const Scaffold(body: Text('Capture page')),
        ),
      ),
    );
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    navigator.pop();
    await tester.pumpAndSettle();
    expect(repo.requests, 1);
    expect(find.text('Vehicle registration'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  testWidgets('exited partners retain access to the settlement home', (
    tester,
  ) async {
    final repo = GateRepository()..eligible = false;
    await tester.pumpWidget(gate(repo, partnerStatus: 'EXITED'));
    await tester.pumpAndSettle();
    expect(repo.requests, 0);
    expect(find.text('Verified driver home'), findsOneWidget);
  });
  testWidgets('refreshes the review list on resume without an async setState', (
    tester,
  ) async {
    final repo = GateRepository()..eligible = false;
    await tester.pumpWidget(gate(repo));
    await tester.pumpAndSettle();
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(repo.requests, 2);
    expect(find.text('Vehicle registration'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

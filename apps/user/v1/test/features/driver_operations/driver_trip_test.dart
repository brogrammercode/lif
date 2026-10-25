import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/driver_vehicles/pages/driver_trip_page.dart';
import 'tracking_lifecycle_test.dart' show trackingFix;

class TripTracking extends DriverTrackingService {
  TripTracking() : super.forTesting() {
    position.value = trackingFix(25.23);
  }
  @override
  Future<void> syncTrip({
    required bool activeTrip,
    required String? availability,
  }) async {}
}

Map<String, dynamic> directions(String target, String road) => {
  'target': target,
  'geometry': [
    [86.95, 25.23],
    [86.96, 25.24],
  ],
  'steps': [
    {
      'distance': 1000,
      'name': road,
      'maneuver': {'type': 'turn'},
    },
  ],
};

class DriverTripRepo extends DriverOperationsRepository {
  String status = 'DRIVER_ASSIGNED';
  bool mismatched = false;
  int reads = 0;
  final requests = <Completer<Map<String, dynamic>>>[];
  @override
  Future<Map<String, dynamic>> context(String id) async {
    reads++;
    return {
      'ride_id': id,
      'is_driver': true,
      'status': status,
      'driver_availability': status == 'COMPLETED' ? 'AVAILABLE' : 'EN_ROUTE',
      'trip': {
        'id': mismatched ? 'another-trip' : id,
        'status': status,
        'pickup_address': 'Station',
        'dropoff_address': 'University',
        'pickup_latitude': '25.23',
        'pickup_longitude': '86.95',
        'dropoff_latitude': '25.24',
        'dropoff_longitude': '86.96',
        'estimated_fare': '50',
      },
    };
  }

  @override
  Future<Map<String, dynamic>> navigation(
    String id,
    double latitude,
    double longitude,
  ) {
    final request = Completer<Map<String, dynamic>>();
    requests.add(request);
    return request.future;
  }

  @override
  Future<Map<String, dynamic>> dashboard() async => {'offers': []};
  @override
  Future<void> complete(String id) async {
    status = 'COMPLETED';
    throw StateError('Response lost after commit');
  }
}

Widget tripPage(
  DriverTripRepo repo,
  TripTracking tracker, {
  void Function(DriverMap)? onMap,
}) => ScreenUtilInit(
  designSize: const Size(390, 844),
  builder: (_, child) => MaterialApp(
    onGenerateRoute: (_) => MaterialPageRoute<void>(
      settings: const RouteSettings(arguments: 'ride'),
      builder: (_) => DriverTripPage(
        repository: repo,
        tracking: tracker,
        mapBuilder: (map) {
          onMap?.call(map as DriverMap);
          return const SizedBox();
        },
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
  testWidgets(
    'trip start clears pickup directions immediately and discards late pickup routing',
    (tester) async {
      final repo = DriverTripRepo(), tracker = TripTracking();
      DriverMap? map;
      await tester.pumpWidget(
        tripPage(repo, tracker, onMap: (value) => map = value),
      );
      await tester.pumpAndSettle();
      repo.requests[0].complete(directions('PICKUP', 'Pickup Road'));
      await tester.pumpAndSettle();
      expect(find.text('turn onto Pickup Road'), findsOneWidget);
      await tester.tap(find.text('Reroute'));
      await tester.pump();
      expect(repo.requests, hasLength(2));
      repo.status = 'IN_PROGRESS';
      await tester.pump(const Duration(seconds: 5));
      await tester.pump();
      expect(find.text('Navigate to drop-off'), findsOneWidget);
      expect(find.text('turn onto Pickup Road'), findsNothing);
      expect(map!.route, isEmpty);
      repo.requests[1].complete(directions('PICKUP', 'Late Pickup Road'));
      await tester.pump();
      await tester.pump();
      expect(find.text('turn onto Late Pickup Road'), findsNothing);
      expect(repo.requests, hasLength(3));
      repo.requests[2].complete(directions('DROPOFF', 'Dropoff Road'));
      await tester.pumpAndSettle();
      expect(find.text('turn onto Dropoff Road'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('a mismatched trip snapshot cannot expose trip actions', (
    tester,
  ) async {
    final repo = DriverTripRepo()..mismatched = true;
    await tester.pumpWidget(tripPage(repo, TripTracking()));
    await tester.pumpAndSettle();
    expect(find.text('I have arrived at pickup'), findsNothing);
    expect(
      find.textContaining('not available to your driver account'),
      findsOneWidget,
    );
    expect(repo.requests, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets('completion recovers committed state when its response is lost', (
    tester,
  ) async {
    final repo = DriverTripRepo()..status = 'IN_PROGRESS';
    await tester.pumpWidget(tripPage(repo, TripTracking()));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Complete ride'));
    await tester.tap(find.text('Complete ride'));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.text('Complete'));
    await tester.pumpAndSettle();
    expect(repo.reads, 2);
    expect(find.text('COMPLETED'), findsOneWidget);
    expect(find.text('Complete ride'), findsNothing);
    repo.requests.single.complete(directions('DROPOFF', 'Old Road'));
    await tester.pumpAndSettle();
    expect(find.text('turn onto Old Road'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
    'a route for the wrong target is not shown as drop-off directions',
    (tester) async {
      final repo = DriverTripRepo()..status = 'IN_PROGRESS';
      DriverMap? map;
      await tester.pumpWidget(
        tripPage(repo, TripTracking(), onMap: (value) => map = value),
      );
      await tester.pumpAndSettle();
      repo.requests.single.complete(directions('PICKUP', 'Wrong Road'));
      await tester.pumpAndSettle();
      expect(map!.route, isEmpty);
      expect(find.text('turn onto Wrong Road'), findsNothing);
      expect(find.textContaining('Trip destination changed'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

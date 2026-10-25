import 'dart:async';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';

class TrackingFixture extends DriverTrackingService {
  TrackingFixture() : super.forTesting();
  bool active = false;
  int starts = 0, stops = 0;
  @override
  Future<void> ensureStarted() async {
    if (!active) starts++;
    active = true;
  }

  @override
  Future<void> stop({bool goOffline = false}) async {
    stops++;
    active = false;
  }
}

Position trackingFix(double latitude) => Position(
  longitude: 86.95,
  latitude: latitude,
  timestamp: DateTime.now(),
  accuracy: 10,
  altitude: 0,
  altitudeAccuracy: 0,
  heading: 0,
  headingAccuracy: 0,
  speed: 0,
  speedAccuracy: 0,
);

class GpsFixture extends GeolocatorPlatform {
  final fixes = <Completer<Position>>[];
  final positions = StreamController<Position>.broadcast();
  int requests = 0;
  @override
  Future<bool> isLocationServiceEnabled() async => true;
  @override
  Future<LocationPermission> checkPermission() async =>
      LocationPermission.always;
  @override
  Future<Position> getCurrentPosition({LocationSettings? locationSettings}) =>
      fixes[requests++].future;
  @override
  Stream<Position> getPositionStream({LocationSettings? locationSettings}) =>
      positions.stream;
}

class TrackingRepo extends DriverOperationsRepository {
  final uploads = <double>[];
  final gates = <Completer<void>>[];
  @override
  Future<void> location(Map<String, dynamic> data) async {
    uploads.add((data['latitude'] as num).toDouble());
    if (gates.length >= uploads.length) await gates[uploads.length - 1].future;
  }
}

Future<void> flushTracking() => Future<void>.delayed(Duration.zero);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://trip.example.test/api/v2',
    ),
  );
  test(
    'a restarted tracker does not reuse or get cleared by an older GPS startup',
    () async {
      final original = GeolocatorPlatform.instance;
      final gps = GpsFixture()
        ..fixes.addAll([Completer<Position>(), Completer<Position>()]);
      GeolocatorPlatform.instance = gps;
      final repo = TrackingRepo();
      final tracker = DriverTrackingService.forTesting(repository: repo);
      try {
        final first = tracker.ensureStarted();
        await flushTracking();
        await tracker.stop();
        final second = tracker.ensureStarted();
        await flushTracking();
        expect(gps.requests, 2);
        gps.fixes[0].complete(trackingFix(25.23));
        await first;
        expect(identical(tracker.ensureStarted(), second), isTrue);
        gps.fixes[1].complete(trackingFix(25.24));
        await second;
        expect(repo.uploads, [25.24]);
        expect(tracker.running, isTrue);
      } finally {
        await tracker.stop();
        await gps.positions.close();
        GeolocatorPlatform.instance = original;
      }
    },
  );
  test(
    'an older upload neither blocks nor clears the new generation upload',
    () async {
      final original = GeolocatorPlatform.instance;
      final gps = GpsFixture()
        ..fixes.addAll([
          Completer<Position>()..complete(trackingFix(25.23)),
          Completer<Position>()..complete(trackingFix(25.24)),
        ]);
      GeolocatorPlatform.instance = gps;
      final repo = TrackingRepo()
        ..gates.addAll([Completer<void>(), Completer<void>()]);
      final tracker = DriverTrackingService.forTesting(repository: repo);
      try {
        final first = tracker.ensureStarted();
        await flushTracking();
        expect(repo.uploads, [25.23]);
        await tracker.stop();
        final second = tracker.ensureStarted();
        await flushTracking();
        expect(repo.uploads, [25.23, 25.24]);
        repo.gates[0].complete();
        await first;
        // freshFix must still wait for the new session's in-flight upload.
        final fresh = tracker.freshFix();
        await flushTracking();
        expect(gps.requests, 2);
        gps.fixes.add(Completer<Position>()..complete(trackingFix(25.25)));
        repo.gates[1].complete();
        await second;
        await fresh;
        expect(repo.uploads, [25.23, 25.24, 25.25]);
        expect(tracker.running, isTrue);
      } finally {
        await tracker.stop();
        await gps.positions.close();
        GeolocatorPlatform.instance = original;
      }
    },
  );
  test(
    'viewing history preserves GPS reporting for an ongoing or approaching trip',
    () async {
      for (final availability in ['EN_ROUTE', 'ON_TRIP']) {
        final tracker = TrackingFixture();
        await tracker.syncTrip(activeTrip: true, availability: availability);
        await tracker.syncTrip(activeTrip: false, availability: availability);
        expect(tracker.active, isTrue);
        expect(tracker.starts, 1);
        expect(tracker.stops, 0);
        await tracker.syncTrip(activeTrip: false, availability: 'OFFLINE');
        expect(tracker.active, isFalse);
        expect(tracker.stops, 1);
      }
    },
  );
  test(
    'a stopped GPS refresh cannot authorize a subsequent driver action',
    () async {
      final original = GeolocatorPlatform.instance;
      final gps = GpsFixture()
        ..fixes.addAll([
          Completer<Position>()..complete(trackingFix(25.23)),
          Completer<Position>(),
        ]);
      GeolocatorPlatform.instance = gps;
      final repo = TrackingRepo();
      final tracker = DriverTrackingService.forTesting(repository: repo);
      try {
        await tracker.ensureStarted();
        final fresh = tracker.freshFix();
        await flushTracking();
        await tracker.stop();
        final stopped = expectLater(fresh, throwsStateError);
        gps.fixes[1].complete(trackingFix(25.24));
        await stopped;
        expect(repo.uploads, [25.23]);
        expect(tracker.position.value, isNull);
      } finally {
        await tracker.stop();
        await gps.positions.close();
        GeolocatorPlatform.instance = original;
      }
    },
  );
  test(
    'a suspension permits the ongoing trip to report GPS and stops after it ends',
    () async {
      final tracker = TrackingFixture();
      await tracker.syncTrip(activeTrip: true, availability: 'SUSPENDED');
      expect(tracker.active, isTrue);
      await tracker.syncTrip(activeTrip: false, availability: null);
      expect(tracker.active, isTrue);
      await tracker.syncTrip(activeTrip: false, availability: 'SUSPENDED');
      expect(tracker.active, isFalse);
    },
  );
}

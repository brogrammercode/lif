import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';
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

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://trip.example.test/api/v2',
    ),
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

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:user/features/rides/rider_booking_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class FlowBookingRepo extends UserAppRepository {
  int requests = 0;
  bool loseReply = false, committed = false, readFails = false;
  final payloads = <String>[];
  @override
  Future<Map<String, dynamic>> ride(String id) async {
    if (readFails) throw StateError('Offline');
    return {'id': id, 'status': committed ? 'SEARCHING' : 'DRAFT'};
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
    requests++;
    payloads.add('$draftId/$quoteId/$method/$note/$requestKey/$passengerCount');
    if (loseReply) throw StateError('Reply lost');
    committed = true;
    return {'id': draftId, 'status': 'SEARCHING'};
  }
}

void main() {
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=http://localhost/api/v2',
    ),
  );
  Map<String, dynamic> quote({bool expired = false}) => {
    'id': 'quote',
    'expires_at': DateTime.now()
        .add(Duration(minutes: expired ? -1 : 5))
        .toIso8601String(),
  };
  test(
    'expired quotes never submit and uncertain retries retain all immutable values',
    () async {
      final repo = FlowBookingRepo();
      final controller = RiderBookingController(repo);
      expect(
        await controller.submit(
          draft: 'draft',
          quote: quote(expired: true),
          method: 'CASH',
          note: '',
          passengers: 1,
        ),
        isNull,
      );
      expect(repo.requests, 0);
      repo.loseReply = true;
      expect(
        await controller.submit(
          draft: 'draft',
          quote: quote(),
          method: 'UPI',
          note: 'Gate',
          passengers: 2,
        ),
        isNull,
      );
      expect(
        await controller.submit(
          draft: 'other',
          quote: {'id': 'other'},
          method: 'CASH',
          note: 'Changed',
          passengers: 4,
        ),
        isNull,
      );
      expect(repo.requests, 2);
      expect(repo.payloads[0], repo.payloads[1]);
      controller.dispose();
    },
  );
  test(
    'lost committed reply recovers and unknown status blocks fresh options and another POST',
    () async {
      final repo = FlowBookingRepo()..loseReply = true;
      final controller = RiderBookingController(repo);
      await controller.submit(
        draft: 'draft',
        quote: quote(),
        method: 'CASH',
        note: '',
        passengers: 1,
      );
      repo.readFails = true;
      expect(await controller.canRefresh(), false);
      await controller.submit(
        draft: 'draft',
        quote: quote(),
        method: 'CASH',
        note: '',
        passengers: 1,
      );
      expect(repo.requests, 1);
      repo.readFails = false;
      repo.committed = true;
      expect(
        await controller.submit(
          draft: 'draft',
          quote: quote(),
          method: 'CASH',
          note: '',
          passengers: 1,
        ),
        'draft',
      );
      expect(repo.requests, 1);
      controller.dispose();
    },
  );
}

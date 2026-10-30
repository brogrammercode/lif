import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/features/driver_vehicles/vehicle_draft.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/driver_vehicles/widgets/vehicle_registration_form.dart';

const registrationKey = 'd09a9a92-6dbb-4288-b651-cb121b986a03';
Map<String, dynamic> draft() => {
  'version': 1,
  'registration_key': registrationKey,
  'brand': null,
  'model': null,
  'plate': 'BR01AA1234',
  'color': 'Red',
  'category_id': null,
  'pending_capture': null,
  'documents': <String, String>{},
  'paths': <String, String>{},
  'names': <String, String>{},
};
Map<String, dynamic> vehicle() => {
  'id': 'vehicle',
  'registration_key': registrationKey,
  'verification_version': 1,
  'status': 'UNDER_REVIEW',
  'brand': {'id': 'brand', 'name': 'Brand', 'status': 'VERIFIED'},
  'catalog_model': {
    'id': 'model',
    'name': 'Model',
    'status': 'VERIFIED',
    'vehicle_type': 'BIKE',
    'seating_capacity': 1,
  },
  'vehicle_category_id': 'category',
  'plate_number': 'BR01AA1234',
  'color': 'Red',
  'verification_fields': [
    for (final entry in vehicleDocuments.entries)
      {
        'key': entry.key,
        'value': 'asset-${entry.key}',
        'label': entry.value,
        'status': 'PENDING',
        'rejection_reason': null,
      },
  ],
};

class FakeRepository extends VehicleVerificationRepository {
  Future<Map<String, dynamic>>? response;
  Object? submitError;
  int submissions = 0;
  final calls = <String>[];
  Map<String, dynamic> current = vehicle();
  @override
  Future<Map<String, dynamic>> mine() =>
      response ??
      Future.value({
        'user': {'id': 'driver'},
        'vehicles': [current],
        'pending_assets': [],
      });
  @override
  Future<void> submit(Map<String, dynamic> input, {String? id}) async {
    calls.add('submit');
    submissions++;
    if (submitError != null) throw submitError!;
  }

  @override
  Future<void> discardUpload(String id) async {
    calls.add('discard:$id');
  }
}

Widget form(FakeRepository repo, {Future<void> Function()? onSaved}) =>
    ScreenUtilInit(
      designSize: const Size(390, 844),
      builder: (_, child) => MaterialApp(
        home: Scaffold(
          body: VehicleRegistrationForm(
            vehicle: vehicle(),
            repository: repo,
            loadCategories: () async => [
              {
                'id': 'category',
                'name': 'Bike',
                'vehicle_type': 'BIKE',
                'capacity': 1,
                'is_selectable': true,
              },
            ],
            onSaved: onSaved ?? () async {},
          ),
        ),
      ),
    );

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://vehicle.example.test/api/v2',
    ),
  );
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  test('detects image encoding from bytes rather than the picker filename', () {
    final payload = VehicleVerificationRepository.imagePayload(
      'camera.jpg',
      Uint8List.fromList([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    expect(payload['data_url'], startsWith('data:image/png;base64,'));
    expect(
      VehicleVerificationRepository.imagePayload(
        'image.bin',
        Uint8List.fromList([0xff, 0xd8, 0xff]),
      )['data_url'],
      startsWith('data:image/jpeg;base64,'),
    );
    expect(
      VehicleVerificationRepository.imagePayload(
        'image.png',
        Uint8List.fromList([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]),
      )['data_url'],
      startsWith('data:image/webp;base64,'),
    );
  });
  test('rejects unsupported image bytes and oversize photos locally', () {
    expect(
      () => VehicleVerificationRepository.imagePayload(
        'not-an-image.jpg',
        Uint8List.fromList([1, 2, 3, 4]),
      ),
      throwsStateError,
    );
    expect(
      () => VehicleVerificationRepository.imagePayload(
        'too-large.jpg',
        Uint8List(3000001),
      ),
      throwsStateError,
    );
  });
  test('removed documents are not resurrected from the server snapshot', () {
    final restored = reusableVehicleDocuments({}, [
      {'key': 'rc_front', 'value': 'old-rc'},
    ], []);
    expect(restored, isEmpty);
  });
  test(
    'expired unsubmitted uploads need uploading again, while bound images stay usable',
    () {
      final restored = reusableVehicleDocuments(
        {'rc_front': 'expired', 'front_image': 'bound', 'insurance': 'pending'},
        [
          {'key': 'front_image', 'value': 'bound'},
        ],
        [
          {'field_key': 'insurance', 'id': 'pending'},
        ],
      );
      expect(restored, {'front_image': 'bound', 'insurance': 'pending'});
    },
  );
  test('a pending asset from the wrong field cannot restore a document', () {
    expect(
      reusableVehicleDocuments(
        {'insurance': 'image'},
        [],
        [
          {'field_key': 'front_image', 'id': 'image'},
        ],
      ),
      isEmpty,
    );
  });
  test('a draft cannot replace or remove an approved document', () {
    expect(
      reusableVehicleDocuments(
        {'insurance': 'other'},
        [
          {'key': 'insurance', 'value': 'approved', 'status': 'APPROVED'},
        ],
        [],
      ),
      {'insurance': 'approved'},
    );
  });
  test('corrupt drafts and malformed model values are rejected safely', () {
    expect(() => decodeVehicleDraft('not json'), throwsFormatException);
    expect(
      () => decodeVehicleDraft(
        jsonEncode({
          ...draft(),
          'model': {
            'id': 'model',
            'name': 'Bike',
            'vehicle_type': 'BIKE',
            'seating_capacity': 'one',
          },
        }),
      ),
      throwsFormatException,
    );
    expect(
      decodeVehicleDraft(jsonEncode(draft()))['registration_key'],
      registrationKey,
    );
  });
  testWidgets(
    'leaving during initial loading does not update disposed controllers',
    (tester) async {
      final pending = Completer<Map<String, dynamic>>();
      final repo = FakeRepository()..response = pending.future;
      await tester.pumpWidget(form(repo));
      await tester.pumpWidget(const SizedBox.shrink());
      pending.complete({
        'user': {'id': 'driver'},
        'vehicles': [vehicle()],
        'pending_assets': [],
      });
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'corrupt saved draft does not block the current registration form',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({
        'vehicle_registration_driver_vehicle': 'broken json',
      });
      await tester.pumpWidget(form(FakeRepository()));
      await tester.pumpAndSettle();
      expect(find.text('Register your vehicle'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );
  testWidgets(
    'cleans up obsolete uploads only on submission, before sending the registration',
    (tester) async {
      final repo = FakeRepository();
      final images = <String, String>{
        for (final key in vehicleDocuments.keys) key: 'asset-$key',
      };
      FlutterSecureStorage.setMockInitialValues({
        'vehicle_registration_driver_vehicle': jsonEncode({
          ...draft(),
          'category_id': 'category',
          'documents': images,
          'obsolete_uploads': ['abandoned-image'],
        }),
      });
      await tester.pumpWidget(form(repo));
      await tester.pumpAndSettle();
      expect(repo.calls, isEmpty);
      await tester.scrollUntilVisible(
        find.text('Submit corrections'),
        400,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text('Submit corrections'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit corrections'));
      await tester.pumpAndSettle();
      expect(repo.calls, ['discard:abandoned-image', 'submit']);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );
  testWidgets(
    'a stale form provides a reload action instead of repeating rejected writes',
    (tester) async {
      final repo = FakeRepository()
        ..submitError = DioException(
          requestOptions: RequestOptions(path: '/vehicle'),
          response: Response(
            requestOptions: RequestOptions(path: '/vehicle'),
            statusCode: 409,
            data: {
              'error_code': 'VEHICLE_VERIFICATION_CONFLICT',
              'message': 'Reload your vehicle.',
            },
          ),
        );
      var reloads = 0;
      await tester.pumpWidget(
        form(
          repo,
          onSaved: () async {
            reloads++;
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Submit corrections'),
        400,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.ensureVisible(find.text('Submit corrections'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Submit corrections'));
      await tester.pumpAndSettle();
      expect(repo.submissions, 1);
      expect(find.text('Reload latest vehicle'), findsOneWidget);
      await tester.ensureVisible(find.text('Reload latest vehicle'));
      await tester.tap(find.text('Reload latest vehicle'));
      await tester.pumpAndSettle();
      expect(reloads, 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpAndSettle();
    },
  );
}

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/controllers/session_controller.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/driver_vehicles/controllers/driver_vehicle_gate_controller.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

class _SessionApi implements HttpClientAdapter {
  _SessionApi(this.travel, this.status, this.user);

  final Map<String, dynamic> travel;
  final int status;
  final UserModel user;
  final requests = <String>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options.path);
    final profile = options.path == '/auth/me';
    return ResponseBody.fromString(
      jsonEncode(
        profile
            ? {'data': user.toJson()}
            : status == 200
            ? {'data': travel}
            : travel,
      ),
      profile ? 200 : status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const exited = UserModel(
    id: 'exited-driver',
    role: 'RIDER',
    status: 'ACTIVE',
    partnerStatus: 'EXITED',
    hasPartnerExit: true,
  );

  setUp(
    () => FlutterSecureStorage.setMockInitialValues({
      'app_mode_${exited.id}': 'driver',
    }),
  );

  Future<SessionController> signedIn(_SessionApi api) async {
    Dio dio() =>
        Dio(BaseOptions(baseUrl: 'https://example.test'))
          ..httpClientAdapter = api;
    final client = DioClient.forTesting(
      client: dio(),
      createRefreshClient: dio,
    );
    final claims = base64Url.encode(
      utf8.encode(
        jsonEncode({
          'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
        }),
      ),
    );
    await client.saveTokens('header.$claims.signature', 'test-refresh');
    final controller = SessionController(client: client);
    addTearDown(controller.dispose);
    return controller;
  }

  test(
    'fresh Google sign-in opens Rider Home when trip state is unavailable',
    () async {
      final api = _SessionApi({}, 503, exited);
      final controller = await signedIn(api);
      expect(
        (await controller.resolveDestination(signedInUser: exited)).route,
        AppRoutes.home,
      );
      expect(api.requests, ['/me/travel-context']);
    },
  );

  test('restored session ignores a stale driver exit denial', () async {
    final api = _SessionApi({'error_code': 'DRIVER_EXITED'}, 403, exited);
    final controller = await signedIn(api);
    expect((await controller.resolveDestination()).route, AppRoutes.home);
    expect(api.requests, unorderedEquals(['/auth/me', '/me/travel-context']));
  });

  test('an exited driver resumes their active rider trip', () async {
    final api = _SessionApi(
      {
        'active_driver_ride': {'id': 'obsolete-driver-trip'},
        'active_rider_ride': {'id': 'active-rider-trip'},
      },
      200,
      exited,
    );
    final controller = await signedIn(api);
    final destination = await controller.resolveDestination();
    expect(destination.route, AppRoutes.rideDetail);
    expect(destination.arguments, 'active-rider-trip');
  });

  test('a confirmed inactive account still returns to login', () async {
    final api = _SessionApi({'error_code': 'USER_INACTIVE'}, 403, exited);
    final controller = await signedIn(api);
    expect(
      (await controller.resolveDestination(signedInUser: exited)).route,
      AppRoutes.login,
    );
  });

  test('an activated driver still resumes the active driver trip', () async {
    const driver = UserModel(
      id: 'driver',
      role: 'DRIVER',
      status: 'ACTIVE',
      partnerStatus: 'ACTIVATED',
    );
    final api = _SessionApi(
      {
        'driver_operations_allowed': true,
        'active_driver_ride': {'id': 'active-driver-trip'},
      },
      200,
      driver,
    );
    final controller = await signedIn(api);
    final destination = await controller.resolveDestination();
    expect(destination.route, AppRoutes.driverRideDetail);
    expect(destination.arguments, 'active-driver-trip');
  });

  test(
    'an open driver screen hands the exited account to session routing',
    () async {
      final api = _SessionApi({}, 500, exited);
      Dio dio() =>
          Dio(BaseOptions(baseUrl: 'https://example.test'))
            ..httpClientAdapter = api;
      final client = DioClient.forTesting(
        client: dio(),
        createRefreshClient: dio,
      );
      final gate = DriverVehicleGateController(
        VehicleVerificationRepository(client: client),
        () async => exited,
      );
      addTearDown(gate.dispose);
      expect(await gate.ready, DriverVehicleAccess.rider);
      expect(api.requests, isEmpty);
    },
  );
}

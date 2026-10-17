import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:user/core/network/api.constant.dart';
import 'package:user/core/network/dio_client.dart';

class _Adapter implements HttpClientAdapter {
  final Future<ResponseBody> Function(RequestOptions) respond;
  _Adapter(this.respond);

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) => respond(options);

  @override
  void close({bool force = false}) {}
}

String _token(String suffix) =>
    'e30.${base64Url.encode(utf8.encode(jsonEncode({'exp': DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600}))).replaceAll('=', '')}.$suffix';

ResponseBody _json(Object? data, [int status = 200]) => ResponseBody.fromString(
  jsonEncode({'status': status < 400 ? 'success' : 'error', 'data': data}),
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

Dio _dio(Future<ResponseBody> Function(RequestOptions) respond) =>
    Dio(BaseOptions(baseUrl: 'https://lif.example.test/api/v1'))
      ..httpClientAdapter = _Adapter(respond);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(
    () => dotenv.loadFromString(
      envString: 'API_BASE_URL=https://lif.example.test/api/v1',
    ),
  );
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  test('a failed retry completes with its actual error', () async {
    var calls = 0;
    final client = DioClient.forTesting(
      client: _dio((_) async => _json(null, ++calls == 1 ? 401 : 500)),
      createRefreshClient: () => _dio(
        (_) async => _json({
          'access_token': _token('new'),
          'refresh_token': 'new-refresh',
        }),
      ),
    );
    await client.saveTokens(_token('old'), 'old-refresh');
    await expectLater(
      client.getData('/protected').timeout(const Duration(seconds: 2)),
      throwsA(
        isA<DioException>().having(
          (error) => error.response?.statusCode,
          'status',
          500,
        ),
      ),
    );
    expect(calls, 2);
  });

  test('concurrent unauthorized requests share one refresh', () async {
    final oldToken = _token('old');
    var refreshes = 0;
    final client = DioClient.forTesting(
      client: _dio(
        (request) async =>
            request.headers['Authorization'] == 'Bearer $oldToken'
            ? _json(null, 401)
            : _json({'ok': true}),
      ),
      createRefreshClient: () => _dio((_) async {
        refreshes++;
        return _json({
          'access_token': _token('new'),
          'refresh_token': 'new-refresh',
        });
      }),
    );
    await client.saveTokens(oldToken, 'old-refresh');
    await Future.wait([
      client.getData('/first'),
      client.getData('/second'),
    ]).timeout(const Duration(seconds: 2));
    expect(refreshes, 1);
  });

  test(
    'clearing a session prevents an old refresh from restoring tokens',
    () async {
      final started = Completer<void>();
      final response = Completer<ResponseBody>();
      final client = DioClient.forTesting(
        client: _dio((_) async => _json(null)),
        createRefreshClient: () => _dio((_) {
          started.complete();
          return response.future;
        }),
      );
      await client.saveTokens(_token('old'), 'old-refresh');
      final refresh = client.refreshSession();
      await started.future;
      await client.clearSession();
      response.complete(
        _json({'access_token': _token('new'), 'refresh_token': 'new-refresh'}),
      );
      await expectLater(refresh, throwsStateError);
      expect(await client.hasSession(), false);
      expect(await client.readRefreshToken(), isNull);
    },
  );

  test(
    'logout waits for rotation and revokes the latest refresh token',
    () async {
      final started = Completer<void>();
      final response = Completer<ResponseBody>();
      Object? revoked;
      final client = DioClient.forTesting(
        client: _dio((request) async {
          revoked = (request.data as Map)['refresh_token'];
          expect(request.headers['Authorization'], isNull);
          return _json(null);
        }),
        createRefreshClient: () => _dio((_) {
          started.complete();
          return response.future;
        }),
      );
      await client.saveTokens(_token('old'), 'old-refresh');
      await client.saveCachedUserLocation(latitude: 12.9, longitude: 77.5);
      final refresh = client.refreshSession();
      await started.future;
      final logout = client.signOut();
      response.complete(
        _json({'access_token': _token('new'), 'refresh_token': 'new-refresh'}),
      );
      await Future.wait([refresh, logout]);
      expect(revoked, 'new-refresh');
      expect(await client.hasSession(), false);
      expect(await client.readCachedUserLocation(), isNull);
    },
  );

  test('a second unauthorized response clears the rejected session', () async {
    var calls = 0;
    final client = DioClient.forTesting(
      client: _dio((_) async {
        calls++;
        return _json(null, 401);
      }),
      createRefreshClient: () => _dio(
        (_) async => _json({
          'access_token': _token('new'),
          'refresh_token': 'new-refresh',
        }),
      ),
    );
    await client.saveTokens(_token('old'), 'old-refresh');
    await expectLater(
      client.getData('/protected').timeout(const Duration(seconds: 2)),
      throwsA(isA<DioException>()),
    );
    expect(calls, 2);
    expect(await client.hasSession(), false);
  });

  test('temporary refresh failures preserve the session', () async {
    final oldToken = _token('old');
    final client = DioClient.forTesting(
      client: _dio((_) async => _json(null)),
      createRefreshClient: () => _dio(
        (request) async => throw DioException(
          requestOptions: request,
          type: DioExceptionType.connectionTimeout,
        ),
      ),
    );
    await client.saveTokens(oldToken, 'old-refresh');
    await expectLater(client.refreshSession(), throwsStateError);
    expect(await client.hasSession(), true);
    expect(await client.readRefreshToken(), 'old-refresh');
    expect(
      await const FlutterSecureStorage().read(
        key: ApiConstants.ACCESS_TOKEN_KEY,
      ),
      oldToken,
    );
  });

  for (final status in [200, 401]) {
    test(
      'an old account response with status $status cannot alter a new session',
      () async {
        final started = Completer<void>();
        final response = Completer<ResponseBody>();
        var refreshes = 0;
        final client = DioClient.forTesting(
          client: _dio((_) {
            started.complete();
            return response.future;
          }),
          createRefreshClient: () {
            refreshes++;
            return _dio((_) async => _json(null));
          },
        );
        await client.saveTokens(_token('old-account'), 'old-refresh');
        final request = client.getData('/profile');
        await started.future;
        await client.saveTokens(_token('new-account'), 'new-refresh');
        response.complete(_json({'email': 'old@example.test'}, status));
        await expectLater(request, throwsA(isA<DioException>()));
        expect(refreshes, 0);
        expect(await client.hasSession(), true);
        expect(await client.readRefreshToken(), 'new-refresh');
      },
    );
  }

  test(
    'a new sign-in does not inherit another account location cache',
    () async {
      final client = DioClient.forTesting(
        client: _dio((_) async => _json(null)),
        createRefreshClient: () => _dio((_) async => _json(null)),
      );
      await client.saveTokens(_token('old-account'), 'old-refresh');
      await client.saveCachedUserLocation(latitude: 12.9, longitude: 77.5);
      expect(await client.readCachedUserLocation(), isNotNull);
      await client.saveTokens(_token('new-account'), 'new-refresh');
      expect(await client.readCachedUserLocation(), isNull);
    },
  );
}

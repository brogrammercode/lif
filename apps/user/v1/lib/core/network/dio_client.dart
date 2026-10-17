import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:user/core/config.dart';
import 'package:user/core/network/api.constant.dart';

class DioClient {
  static final DioClient _instance = DioClient._internal();
  late final Dio dio;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  Future<String?>? _refreshingAccessToken;
  Future<void> _sessionWrites = Future<void>.value();
  int _sessionVersion = 0;
  bool _signingOut = false;
  Dio Function()? _createRefreshClient;

  factory DioClient() {
    return _instance;
  }

  @visibleForTesting
  factory DioClient.forTesting({
    required Dio client,
    required Dio Function() createRefreshClient,
  }) => DioClient._internal(
    client: client,
    createRefreshClient: createRefreshClient,
  );

  DioClient._internal({Dio? client, Dio Function()? createRefreshClient}) {
    _createRefreshClient = createRefreshClient;
    dio =
        client ??
        Dio(
          BaseOptions(
            baseUrl: AppConfig.apiBaseUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 20),
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
          ),
        );
    if (kDebugMode) dio.interceptors.add(_SimpleLogInterceptor());
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          try {
            if (options.path == ApiConstants.AUTH_GOOGLE ||
                options.path == ApiConstants.AUTH_REFRESH ||
                options.path == ApiConstants.AUTH_LOGOUT) {
              options.headers.remove('Authorization');
              handler.next(options);
              return;
            }
            final version = options.extra.putIfAbsent(
              ApiConstants.SESSION_VERSION_EXTRA,
              () => _sessionVersion,
            );
            await _sessionWrites;
            var token = await _storage.read(key: ApiConstants.ACCESS_TOKEN_KEY);
            if (version != _sessionVersion) {
              throw DioException(
                requestOptions: options,
                type: DioExceptionType.cancel,
                message: ApiConstants.SESSION_CHANGED_MESSAGE,
              );
            }
            if (token != null &&
                token.isNotEmpty &&
                _tokenNeedsRefresh(token)) {
              token = await _refreshAccessToken() ?? token;
            }
            if (token != null && token.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer $token';
            }
            if (version != _sessionVersion) {
              throw DioException(
                requestOptions: options,
                type: DioExceptionType.cancel,
                message: ApiConstants.SESSION_CHANGED_MESSAGE,
              );
            }
            handler.next(options);
          } catch (error, stackTrace) {
            handler.reject(
              error is DioException
                  ? error
                  : DioException(
                      requestOptions: options,
                      error: error,
                      stackTrace: stackTrace,
                    ),
            );
          }
        },
        onResponse: (response, handler) {
          final version =
              response.requestOptions.extra[ApiConstants.SESSION_VERSION_EXTRA];
          if (version != null && version != _sessionVersion) {
            handler.reject(
              DioException(
                requestOptions: response.requestOptions,
                type: DioExceptionType.cancel,
                message: ApiConstants.SESSION_CHANGED_MESSAGE,
              ),
            );
            return;
          }
          handler.next(response);
        },
        onError: (error, handler) async {
          try {
            final request = error.requestOptions;
            final version = request.extra[ApiConstants.SESSION_VERSION_EXTRA];
            if (version != null && version != _sessionVersion) {
              handler.next(error);
              return;
            }
            final inactive =
                error.response?.statusCode == 403 &&
                error.response?.data is Map &&
                error.response?.data['error_code'] == 'USER_INACTIVE';
            if (inactive ||
                (request.extra[ApiConstants.SESSION_RETRY_EXTRA] == true &&
                    error.response?.statusCode == 401)) {
              final failedToken = request.headers['Authorization'];
              await _sessionWrites;
              final current = await _storage.read(
                key: ApiConstants.ACCESS_TOKEN_KEY,
              );
              if (current != null && failedToken == 'Bearer $current') {
                await clearSession();
              }
              handler.next(error);
              return;
            }
            if (request.extra[ApiConstants.SESSION_RETRY_EXTRA] == true) {
              handler.next(error);
              return;
            }
            final isAuthRequest =
                request.path == ApiConstants.AUTH_GOOGLE ||
                request.path == ApiConstants.AUTH_REFRESH ||
                request.path == ApiConstants.AUTH_LOGOUT;
            if (error.response?.statusCode != 401 || isAuthRequest) {
              handler.next(error);
              return;
            }
            try {
              await _sessionWrites;
              final current = await _storage.read(
                key: ApiConstants.ACCESS_TOKEN_KEY,
              );
              final accessToken =
                  current != null &&
                      !_tokenNeedsRefresh(current) &&
                      request.headers['Authorization'] != 'Bearer $current'
                  ? current
                  : await _refreshAccessToken();
              if (accessToken == null) {
                handler.next(error);
                return;
              }
              request.extra[ApiConstants.SESSION_RETRY_EXTRA] = true;
              request.headers['Authorization'] = 'Bearer $accessToken';
              handler.resolve(await dio.fetch<dynamic>(request));
            } on DioException catch (retryError) {
              handler.next(retryError);
            } catch (_) {
              handler.next(error);
            }
          } catch (_) {
            handler.next(error);
          }
        },
      ),
    );
  }

  Future<void> saveTokens(String accessToken, String refreshToken) async {
    final version = ++_sessionVersion;
    await _storeTokens(
      accessToken,
      refreshToken,
      version,
      clearCachedLocation: true,
    );
  }

  Future<void> _mutateSession(Future<void> Function() action) {
    final pending = _sessionWrites.then((_) => action());
    _sessionWrites = pending.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return pending;
  }

  Future<void> _storeTokens(
    String accessToken,
    String refreshToken,
    int version, {
    bool clearCachedLocation = false,
  }) => _mutateSession(() async {
    if (version != _sessionVersion) return;
    if (clearCachedLocation) {
      await _storage.delete(key: ApiConstants.CACHED_LOCATION_LATITUDE_KEY);
      await _storage.delete(key: ApiConstants.CACHED_LOCATION_LONGITUDE_KEY);
    }
    await _storage.write(
      key: ApiConstants.REFRESH_TOKEN_KEY,
      value: refreshToken,
    );
    await _storage.write(
      key: ApiConstants.ACCESS_TOKEN_KEY,
      value: accessToken,
    );
  });

  Future<String?> readRefreshToken() async {
    await _sessionWrites;
    return _storage.read(key: ApiConstants.REFRESH_TOKEN_KEY);
  }

  Future<void> refreshSession() async {
    if (await _refreshAccessToken() == null) {
      throw StateError(
        'Your session could not be refreshed. Please try again.',
      );
    }
  }

  Future<void> signOut() async {
    if (_signingOut) return;
    _signingOut = true;
    try {
      await _refreshingAccessToken;
      final token = await readRefreshToken();
      if (token != null && token.isNotEmpty) {
        try {
          await postData(
            ApiConstants.AUTH_LOGOUT,
            data: {'refresh_token': token},
          );
        } on DioException catch (_) {}
      }
    } finally {
      try {
        await clearSession();
      } finally {
        _signingOut = false;
      }
    }
  }

  Future<String?> _refreshAccessToken() {
    if (_signingOut) return Future<String?>.value();
    final currentRefresh = _refreshingAccessToken;
    if (currentRefresh != null) return currentRefresh;

    late final Future<String?> refresh;
    refresh = _performSessionRefresh().whenComplete(() {
      if (identical(_refreshingAccessToken, refresh)) {
        _refreshingAccessToken = null;
      }
    });
    _refreshingAccessToken = refresh;
    return refresh;
  }

  Future<String?> _performSessionRefresh() async {
    await _sessionWrites;
    final version = _sessionVersion;
    Dio? refreshDio;
    try {
      final refreshToken = await readRefreshToken();
      if (version != _sessionVersion) return null;
      if (refreshToken == null || refreshToken.isEmpty) return null;

      refreshDio =
          _createRefreshClient?.call() ??
          Dio(
            BaseOptions(
              baseUrl: AppConfig.apiBaseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 20),
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
            ),
          );
      if (kDebugMode) refreshDio.interceptors.add(_SimpleLogInterceptor());

      final refreshResponse = await refreshDio.post(
        ApiConstants.AUTH_REFRESH,
        data: {'refresh_token': refreshToken},
      );
      final responseData = refreshResponse.data as Map<String, dynamic>;
      final data = responseData['data'] as Map<String, dynamic>;
      final accessToken = data['access_token'] as String;
      final rotatedRefreshToken = data['refresh_token'] as String;
      if (version != _sessionVersion) return null;
      await _storeTokens(accessToken, rotatedRefreshToken, version);
      return version == _sessionVersion ? accessToken : null;
    } on DioException catch (error) {
      if (error.response?.statusCode == 401 && version == _sessionVersion) {
        await clearSession();
      }
      return null;
    } catch (_) {
      return null;
    } finally {
      refreshDio?.close();
    }
  }

  bool _tokenNeedsRefresh(String token) {
    try {
      final segments = token.split('.');
      if (segments.length != 3) return true;
      final payloadBytes = base64Url.decode(base64Url.normalize(segments[1]));
      final payload = jsonDecode(utf8.decode(payloadBytes));
      if (payload is! Map<String, dynamic>) return true;
      final expiration = payload['exp'];
      if (expiration is! num) return true;
      final expiresAt = DateTime.fromMillisecondsSinceEpoch(
        expiration.toInt() * 1000,
      );
      return expiresAt.isBefore(
        DateTime.now().add(const Duration(seconds: 60)),
      );
    } catch (_) {
      return true;
    }
  }

  Future<void> saveCachedUserLocation({
    required double latitude,
    required double longitude,
  }) async {
    final version = _sessionVersion;
    await _mutateSession(() async {
      if (version != _sessionVersion) return;
      await _storage.write(
        key: ApiConstants.CACHED_LOCATION_LATITUDE_KEY,
        value: latitude.toString(),
      );
      await _storage.write(
        key: ApiConstants.CACHED_LOCATION_LONGITUDE_KEY,
        value: longitude.toString(),
      );
    });
  }

  Future<Map<String, double>?> readCachedUserLocation() async {
    await _sessionWrites;
    final version = _sessionVersion;
    final latitude = double.tryParse(
      await _storage.read(key: ApiConstants.CACHED_LOCATION_LATITUDE_KEY) ?? '',
    );
    final longitude = double.tryParse(
      await _storage.read(key: ApiConstants.CACHED_LOCATION_LONGITUDE_KEY) ??
          '',
    );
    if (version != _sessionVersion ||
        latitude == null ||
        longitude == null ||
        !latitude.isFinite ||
        !longitude.isFinite ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180) {
      return null;
    }
    return {'latitude': latitude, 'longitude': longitude};
  }

  Future<bool> hasSession() async {
    await _sessionWrites;
    return (await _storage.read(
          key: ApiConstants.ACCESS_TOKEN_KEY,
        ))?.isNotEmpty ??
        false;
  }

  Future<void> clearSession() async {
    _sessionVersion++;
    await _mutateSession(() async {
      for (final key in [
        ApiConstants.ACCESS_TOKEN_KEY,
        ApiConstants.REFRESH_TOKEN_KEY,
        ApiConstants.CACHED_LOCATION_LATITUDE_KEY,
        ApiConstants.CACHED_LOCATION_LONGITUDE_KEY,
      ]) {
        await _storage.delete(key: key);
      }
    });
  }

  Future<dynamic> getData(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) async => (await dio.get(path, queryParameters: queryParameters)).data;

  Future<dynamic> postData(
    String path, {
    Object? data,
    Map<String, dynamic>? headers,
  }) async => (await dio.post(
    path,
    data: data,
    options: Options(headers: headers),
  )).data;

  Future<dynamic> patchData(String path, {Object? data}) async =>
      (await dio.patch(path, data: data)).data;

  Future<dynamic> deleteData(String path) async =>
      (await dio.delete(path)).data;
}

class _SimpleLogInterceptor extends Interceptor {
  static const _blue = '\x1B[38;2;0;122;255m';
  static const _orange = '\x1B[38;2;255;145;0m';
  static const _red = '\x1B[38;2;255;55;55m';
  static const _reset = '\x1B[0m';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final now = DateTime.now();
    final time =
        '${_twoDigits(now.hour)}:${_twoDigits(now.minute)}:${_twoDigits(now.second)}.${now.millisecond.toString().padLeft(3, '0')}';
    _write('$_blue- $time : ${options.method} : ${options.path}$_reset');
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    _logResponse(
      response.requestOptions.path,
      response.statusCode,
      response.data,
      isError: (response.statusCode ?? 0) >= 400,
    );
    handler.next(response);
  }

  @override
  void onError(DioException error, ErrorInterceptorHandler handler) {
    _logResponse(
      error.requestOptions.path,
      error.response?.statusCode,
      error.response?.data ?? {'message': error.message ?? 'Request failed'},
      isError: true,
    );
    handler.next(error);
  }

  void _logResponse(
    String path,
    int? status,
    Object? body, {
    required bool isError,
  }) {
    String formattedBody;
    try {
      formattedBody = const JsonEncoder.withIndent(
        '  ',
      ).convert(_redactSensitiveValues(body));
    } catch (_) {
      formattedBody = '[Response body could not be formatted]';
    }
    final color = isError ? _red : _orange;
    final statusLabel = status?.toString() ?? 'NO STATUS';
    _write('$color🔥🔥 : $statusLabel : $path : $formattedBody$_reset');
  }

  Object? _redactSensitiveValues(Object? value) {
    if (value is Map) {
      return value.map((key, nestedValue) {
        final keyString = '$key';
        final normalizedKey = keyString.toLowerCase();
        final isSensitive =
            normalizedKey.contains('token') ||
            normalizedKey.contains('password') ||
            normalizedKey.contains('secret') ||
            normalizedKey.contains('authorization') ||
            normalizedKey.contains('latitude') ||
            normalizedKey.contains('longitude');
        return MapEntry(
          keyString,
          isSensitive ? '[REDACTED]' : _redactSensitiveValues(nestedValue),
        );
      });
    }
    if (value is List) {
      return value.map(_redactSensitiveValues).toList();
    }
    return value;
  }

  void _write(String message) {
    debugPrint(message, wrapWidth: 1000);
  }

  String _twoDigits(int value) => value.toString().padLeft(2, '0');
}

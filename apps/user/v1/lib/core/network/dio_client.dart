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

  factory DioClient() {
    return _instance;
  }

  DioClient._internal() {
    dio = Dio(
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
      QueuedInterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _storage.read(key: ApiConstants.ACCESS_TOKEN_KEY);
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) async {
          final request = error.requestOptions;
          if (request.extra['session_refresh_attempted'] == true) {
            handler.next(error);
            return;
          }
          final isAuthRequest =
              request.path.contains('/auth/google') ||
              request.path.contains('/auth/refresh') ||
              request.path.contains('/auth/logout');
          if (error.response?.statusCode != 401 || isAuthRequest) {
            handler.next(error);
            return;
          }
          try {
            final refreshToken = await readRefreshToken();
            if (refreshToken == null) throw StateError('Missing refresh token');
            final refreshDio = Dio(
              BaseOptions(
                baseUrl: AppConfig.apiBaseUrl,
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
              ),
            );
            if (kDebugMode) {
              refreshDio.interceptors.add(_SimpleLogInterceptor());
            }
            final refreshResponse = await refreshDio.post(
              '/auth/refresh',
              data: {'refresh_token': refreshToken},
            );
            final responseData = refreshResponse.data as Map<String, dynamic>;
            final data = responseData['data'] as Map<String, dynamic>;
            final accessToken = data['access_token'] as String;
            await saveTokens(accessToken, data['refresh_token'] as String);
            request.extra['session_refresh_attempted'] = true;
            request.headers['Authorization'] = 'Bearer $accessToken';
            handler.resolve(await dio.fetch<dynamic>(request));
          } catch (_) {
            await clearSession();
            handler.next(error);
          }
        },
      ),
    );
  }

  Future<void> saveTokens(String accessToken, String refreshToken) async {
    await _storage.write(
      key: ApiConstants.ACCESS_TOKEN_KEY,
      value: accessToken,
    );
    await _storage.write(
      key: ApiConstants.REFRESH_TOKEN_KEY,
      value: refreshToken,
    );
  }

  Future<String?> readRefreshToken() =>
      _storage.read(key: ApiConstants.REFRESH_TOKEN_KEY);

  Future<void> saveCachedUserLocation({
    required double latitude,
    required double longitude,
  }) async {
    await _storage.write(
      key: ApiConstants.CACHED_LOCATION_LATITUDE_KEY,
      value: latitude.toString(),
    );
    await _storage.write(
      key: ApiConstants.CACHED_LOCATION_LONGITUDE_KEY,
      value: longitude.toString(),
    );
  }

  Future<Map<String, double>?> readCachedUserLocation() async {
    final latitude = double.tryParse(
      await _storage.read(key: ApiConstants.CACHED_LOCATION_LATITUDE_KEY) ?? '',
    );
    final longitude = double.tryParse(
      await _storage.read(key: ApiConstants.CACHED_LOCATION_LONGITUDE_KEY) ??
          '',
    );
    if (latitude == null ||
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

  Future<bool> hasSession() async =>
      (await _storage.read(key: ApiConstants.ACCESS_TOKEN_KEY))?.isNotEmpty ??
      false;

  Future<void> clearSession() async => _storage.deleteAll();

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
      formattedBody = '$body';
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

import 'dart:convert';
import 'dart:developer' as developer;

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
        baseUrl: AppConfig.API_BASE_URL,
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
          if (token != null && token.isNotEmpty)
            options.headers['Authorization'] = 'Bearer $token';
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
                baseUrl: AppConfig.API_BASE_URL,
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
              ),
            );
            if (kDebugMode)
              refreshDio.interceptors.add(_SimpleLogInterceptor());
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
  static const _blue = '\x1B[34m';
  static const _yellow = '\x1B[33m';
  static const _reset = '\x1B[0m';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    developer.log('${_blue}request - ${options.path}$_reset', name: 'dio');
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    _logResponse(
      response.requestOptions.path,
      response.statusCode,
      response.data,
    );
    handler.next(response);
  }

  @override
  void onError(DioException error, ErrorInterceptorHandler handler) {
    _logResponse(
      error.requestOptions.path,
      error.response?.statusCode,
      error.response == null ? error.message : error.response!.data,
    );
    handler.next(error);
  }

  void _logResponse(String path, int? code, Object? body) {
    String formattedBody;
    try {
      formattedBody = jsonEncode(body);
    } catch (_) {
      formattedBody = '$body';
    }
    developer.log(
      '${_yellow}response - $path : ${code ?? '-'} : $formattedBody$_reset',
      name: 'dio',
    );
  }
}

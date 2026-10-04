import 'package:dio/dio.dart';
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
            final refreshResponse = await Dio(
              BaseOptions(
                baseUrl: AppConfig.API_BASE_URL,
                headers: {
                  'Accept': 'application/json',
                  'Content-Type': 'application/json',
                },
              ),
            ).post('/auth/refresh', data: {'refresh_token': refreshToken});
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

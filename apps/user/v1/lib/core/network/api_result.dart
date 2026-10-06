import 'package:dio/dio.dart';

class ApiResult {
  static dynamic unwrap(dynamic response) {
    if (response is Map<String, dynamic>) return response['data'] ?? response;
    return response;
  }

  static String errorMessage(Object error) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map<String, dynamic> && data['message'] is String) {
        return data['message'] as String;
      }
      if (error.type == DioExceptionType.connectionTimeout ||
          error.type == DioExceptionType.connectionError ||
          error.type == DioExceptionType.receiveTimeout ||
          error.type == DioExceptionType.sendTimeout) {
        return 'Cannot reach the API. Check that the server is running and your phone is connected to the same network.';
      }
      return error.message ?? 'The request could not be completed.';
    }
    return 'The request could not be completed.';
  }
}

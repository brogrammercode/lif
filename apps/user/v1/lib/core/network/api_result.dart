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
      return error.message ?? 'The request could not be completed.';
    }
    return 'The request could not be completed.';
  }
}

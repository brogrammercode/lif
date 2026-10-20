import 'package:dio/dio.dart';
import 'package:flutter/services.dart';

class ApiResult {
  static dynamic unwrap(dynamic response) {
    if (response is Map<String, dynamic> && response.containsKey('data')) {
      return response['data'];
    }
    return response;
  }

  static String errorMessage(Object error) {
    if (error is StateError) return error.message;
    if (error is FormatException) return error.message;
    if (error is PlatformException) {
      if ([
        'camera_access_denied',
        'camera_access_restricted',
      ].contains(error.code)) {
        return 'Camera access is unavailable. Allow camera access for 1More in your device settings, then try again.';
      }
      if (error.code == 'no_available_camera') {
        return 'No camera is available on this device. Use a phone with a camera to take your live selfie.';
      }
    }
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

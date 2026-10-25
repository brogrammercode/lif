import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/network/api_result.dart';

class PartnerProgramRepository {
  static const base = '/partner-program';
  final DioClient _client;
  PartnerProgramRepository({DioClient? client})
    : _client = client ?? DioClient();
  Map<String, dynamic> _map(dynamic response) =>
      Map<String, dynamic>.from(ApiResult.unwrap(response) as Map);
  Future<Map<String, dynamic>> workflow() async =>
      _map(await _client.getData('$base/me'));
  Future<Map<String, dynamic>> geography({
    String? state,
    String? city,
    String? pincode,
  }) async => _map(
    await _client.getData(
      '$base/geography',
      queryParameters: {'state': ?state, 'city': ?city, 'pincode': ?pincode},
    ),
  );
  Future<void> submit(Map<String, dynamic> input) async {
    try {
      final response = await _client.postData(
        '$base/applications',
        data: input,
        receiveTimeout: const Duration(seconds: 90),
      );
      final receipt = ApiResult.unwrap(response);
      if (receipt is! Map ||
          receipt['id'] is! String ||
          (receipt['id'] as String).isEmpty ||
          receipt['status'] != 'SUBMITTED' ||
          receipt['version'] is! num ||
          !(receipt['version'] as num).isFinite ||
          (receipt['version'] as num) <= (input['version'] as num? ?? 0)) {
        throw const FormatException(
          'The server did not confirm your application. Your draft is saved. Refresh its status before retrying.',
        );
      }
    } on DioException catch (error) {
      final status = error.response?.statusCode;
      final ambiguous = status == null || status >= 500 || status == 409;
      if (ambiguous) {
        try {
          final saved = (await workflow())['application'];
          // A lost response is success only when the server saved this exact
          // submission. Never treat somebody else's revision as our receipt.
          if (saved is Map &&
              (saved['version'] as num? ?? 0) >
                  (input['version'] as num? ?? 0) &&
              saved['contact_email'] == input['contact_email'] &&
              saved['whatsapp_phone'] == input['whatsapp_phone'] &&
              saved['fields'] is List &&
              input['answers'] is List &&
              (input['answers'] as List).every(
                (answer) =>
                    answer is Map &&
                    (saved['fields'] as List).any(
                      (field) =>
                          field is Map &&
                          field['requirement_id'] == answer['requirement_id'] &&
                          jsonEncode(field['value']) ==
                              jsonEncode(answer['value']),
                    ),
              )) {
            return;
          }
        } catch (_) {
          // Keep the original request error and the local retryable draft.
        }
      }
      rethrow;
    }
  }

  Future<void> confirm(Map<String, dynamic> input) async {
    await _client.postData('$base/confirmations', data: input);
  }

  Future<void> activate(String code) async {
    await _client.postData('$base/activate', data: {'code': code});
  }

  Future<Map<String, dynamic>?> exitRequest() async {
    final data = ApiResult.unwrap(await _client.getData('$base/exit-request'));
    return data is Map ? Map<String, dynamic>.from(data) : null;
  }

  Future<void> requestExit(String reason, int version) async {
    await _client.postData(
      '$base/exit-request',
      data: {'reason': reason, 'version': version},
    );
  }

  Future<Map<String, dynamic>> upload(
    String fieldId,
    String fileName,
    Uint8List bytes,
  ) async {
    if (bytes.isEmpty || bytes.length > 3000000) {
      throw StateError('Choose a file up to 3 MB.');
    }
    final mime = switch (fileName.split('.').last.toLowerCase()) {
      'jpg' || 'jpeg' => 'image/jpeg',
      'png' => 'image/png',
      'webp' => 'image/webp',
      'pdf' => 'application/pdf',
      'txt' || 'csv' => 'text/plain',
      _ => 'application/octet-stream',
    };
    return _map(
      await _client.postData(
        '$base/assets',
        receiveTimeout: const Duration(seconds: 90),
        sendTimeout: const Duration(seconds: 90),
        data: {
          'field_id': fieldId,
          if (fieldId == '__live_selfie__') 'capture_source': 'CAMERA',
          'file_name': fileName,
          'data_url': 'data:$mime;base64,${base64Encode(bytes)}',
        },
      ),
    );
  }

  Future<Map<String, dynamic>> uploadFile(
    String fieldId,
    String fileName,
    String path,
  ) async {
    // Keep file reading, base64 and JSON copies off the UI isolate, and return
    // only one ready-to-send request body rather than retaining source bytes.
    final body = await compute(_encodePartnerUpload, (fieldId, fileName, path));
    return _map(
      await _client.postData(
        '$base/assets',
        receiveTimeout: const Duration(seconds: 90),
        sendTimeout: const Duration(seconds: 90),
        data: body,
      ),
    );
  }

  Future<void> download(String assetId) async {
    final asset = _map(await _client.getData('$base/assets/$assetId'));
    final bytes = base64Decode((asset['data_url'] as String).split(',').last);
    final folder = await getApplicationDocumentsDirectory();
    final safeName = (asset['file_name'] as String).replaceAll(
      RegExp(r'[^a-zA-Z0-9_.-]'),
      '_',
    );
    final file = File('${folder.path}/partner_${assetId}_$safeName');
    await file.writeAsBytes(bytes, flush: true);
    final result = await OpenFilex.open(file.path);
    if (result.type != ResultType.done) {
      throw StateError('Saved to ${file.path}. ${result.message}');
    }
  }
}

Future<String> _encodePartnerUpload((String, String, String) input) async {
  final (fieldId, name, path) = input;
  final file = File(path);
  final size = await file.length();
  if (size == 0 || size > 3000000) {
    throw StateError('Choose a file up to 3 MB.');
  }
  final bytes = await file.readAsBytes();
  if (bytes.isEmpty || bytes.length > 3000000) {
    throw StateError('Choose a file up to 3 MB.');
  }
  final mime = switch (name.split('.').last.toLowerCase()) {
    'jpg' || 'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'pdf' => 'application/pdf',
    'txt' || 'csv' => 'text/plain',
    _ => 'application/octet-stream',
  };
  return jsonEncode({
    'field_id': fieldId,
    if (fieldId == '__live_selfie__') 'capture_source': 'CAMERA',
    'file_name': name,
    'data_url': 'data:$mime;base64,${base64Encode(bytes)}',
  });
}

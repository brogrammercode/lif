import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/network/api_result.dart';

class PartnerProgramRepository {
  static const base = '/partner-program';
  final DioClient _client = DioClient();
  Map<String, dynamic> _map(dynamic response) =>
      Map<String, dynamic>.from(ApiResult.unwrap(response) as Map);
  Future<Map<String, dynamic>> workflow() async =>
      _map(await _client.getData('$base/me'));
  Future<void> submit(Map<String, dynamic> input) async {
    await _client.postData('$base/applications', data: input);
  }

  Future<void> confirm(Map<String, dynamic> input) async {
    await _client.postData('$base/confirmations', data: input);
  }

  Future<void> activate(String code) async {
    await _client.postData('$base/activate', data: {'code': code});
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
        data: {
          'field_id': fieldId,
          'file_name': fileName,
          'data_url': 'data:$mime;base64,${base64Encode(bytes)}',
        },
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

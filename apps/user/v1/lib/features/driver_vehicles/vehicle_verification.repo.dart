import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'dart:io';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/network/dio_client.dart';

class VehicleVerificationRepository {
  static const base = '/driver/vehicle-verification';
  final DioClient _client;
  VehicleVerificationRepository({DioClient? client})
    : _client = client ?? DioClient();
  Map<String, dynamic> _map(dynamic response) =>
      Map<String, dynamic>.from(ApiResult.unwrap(response) as Map);
  Future<Map<String, dynamic>> mine() async =>
      _map(await _client.getData(base));
  Future<Map<String, dynamic>> documents() async =>
      _map(await _client.getData('/driver/vehicle-documents'));
  Future<void> renewDocument(
    String id,
    int version,
    String key,
    String assetId,
  ) async {
    await _client.postData(
      '$base/${Uri.encodeComponent(id)}/renewal',
      data: {
        'expected_version': version,
        'field_key': key,
        'asset_id': assetId,
      },
    );
  }

  static Map<String, dynamic> documentPayload(
    String key,
    String name,
    Uint8List bytes,
  ) {
    if (bytes.length >= 5 && String.fromCharCodes(bytes.take(5)) == '%PDF-') {
      if (['front_image', 'back_image'].contains(key)) {
        throw StateError('Vehicle front/back must be images.');
      }
      if (bytes.length > 3000000) {
        throw StateError('Choose a document up to 3 MB.');
      }
      return {
        'file_name': name,
        'data_url': 'data:application/pdf;base64,${base64Encode(bytes)}',
      };
    }
    return imagePayload(name, bytes);
  }

  Future<Map<String, dynamic>> choices({
    String? brandId,
    String query = '',
    int page = 1,
  }) async => _map(
    await _client.getData(
      '$base/catalog',
      queryParameters: {
        'brand_id': ?brandId,
        'query': query,
        'page': page,
        'page_size': 50,
      },
    ),
  );
  Future<Map<String, dynamic>> requestCatalog(
    bool model,
    Map<String, dynamic> input,
  ) async => _map(
    await _client.postData(
      '/driver/vehicle-${model ? 'models' : 'brands'}/requests',
      data: input,
      receiveTimeout: const Duration(seconds: 90),
      sendTimeout: const Duration(seconds: 90),
    ),
  );
  Future<Map<String, dynamic>> correctCatalog(
    bool model,
    String id,
    Map<String, dynamic> input,
  ) async => _map(
    await _client.patchData(
      '/driver/vehicle-${model ? 'models' : 'brands'}/requests/${Uri.encodeComponent(id)}',
      data: input,
    ),
  );
  Future<Map<String, dynamic>> upload(
    String key,
    String name,
    Uint8List bytes,
  ) async => _map(
    await _client.postData(
      '$base/assets',
      data: {
        'field_key': key,
        'image_upload': documentPayload(key, name, bytes),
      },
      receiveTimeout: const Duration(seconds: 90),
      sendTimeout: const Duration(seconds: 90),
    ),
  );
  Future<void> submit(Map<String, dynamic> input, {String? id}) async {
    if (id == null) {
      await _client.postData(base, data: input);
    } else {
      await _client.patchData('$base/$id', data: input);
    }
  }

  Future<Uint8List> image(String id) async {
    final data = _map(
      await _client.getData('/vehicle-verification/assets/$id'),
    );
    return base64Decode((data['data_url'] as String).split(',').last);
  }

  Future<void> discardUpload(String id) async {
    await _client.deleteData('$base/assets/${Uri.encodeComponent(id)}');
  }

  static Future<void> openDocument(String name, Uint8List bytes) async {
    final dir = await getTemporaryDirectory();
    final safe = name.replaceAll(RegExp(r'[^a-zA-Z0-9_.-]'), '_');
    final file = File(
      '${dir.path}/vehicle_${DateTime.now().microsecondsSinceEpoch}_$safe',
    );
    await file.writeAsBytes(bytes, flush: true);
    final result = await OpenFilex.open(file.path);
    if (result.type != ResultType.done) throw StateError(result.message);
  }

  static Map<String, dynamic> imagePayload(String name, Uint8List bytes) {
    if (bytes.isEmpty || bytes.length > 3000000) {
      throw StateError('Choose an image up to 3 MB.');
    }
    // Pickers can change the encoding without changing the original filename.
    // Match the API's supported image signatures before previewing or uploading.
    bool startsWith(List<int> signature, [int offset = 0]) {
      if (bytes.length < offset + signature.length) return false;
      for (var i = 0; i < signature.length; i++) {
        if (bytes[offset + i] != signature[i]) return false;
      }
      return true;
    }

    final String mime;
    if (startsWith([0xff, 0xd8, 0xff])) {
      mime = 'image/jpeg';
    } else if (startsWith([137, 80, 78, 71, 13, 10, 26, 10])) {
      mime = 'image/png';
    } else if (startsWith([82, 73, 70, 70]) &&
        startsWith([87, 69, 66, 80], 8)) {
      mime = 'image/webp';
    } else {
      throw StateError('Choose a JPEG, PNG, or WebP image.');
    }
    return {
      'file_name': name,
      'data_url': 'data:$mime;base64,${base64Encode(bytes)}',
    };
  }

  static String registrationKey() {
    final bytes = List.generate(16, (_) => Random.secure().nextInt(256));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    final hex = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
    return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
  }
}

const vehicleDocuments = <String, String>{
  'front_image': 'Vehicle front',
  'back_image': 'Vehicle back',
  'rc_front': 'RC front',
  'rc_back': 'RC back',
  'insurance': 'Insurance',
  'pollution': 'Pollution / PUC certificate',
};
List<Map<String, dynamic>> vehicleMaps(dynamic value) => (value as List? ?? [])
    .map((v) => Map<String, dynamic>.from(v as Map))
    .toList();

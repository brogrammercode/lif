import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class PlacesRepository {
  final _client = DioClient();
  Map<String, dynamic> _map(dynamic response) =>
      Map<String, dynamic>.from(ApiResult.unwrap(response) as Map);
  Future<Map<String, dynamic>> list({
    int page = 1,
    String query = '',
    String scope = 'all',
    String? type,
  }) async => _map(
    await _client.getData(
      '/places',
      queryParameters: {
        'page': page,
        'query': query,
        'scope': scope,
        'type': ?type,
      },
    ),
  );
  Future<Map<String, dynamic>> detail(String id) async =>
      _map(await _client.getData('/places/${Uri.encodeComponent(id)}'));
  Future<Map<String, dynamic>> reviews(String id, {int page = 1}) async => _map(
    await _client.getData(
      '/places/${Uri.encodeComponent(id)}/reviews',
      queryParameters: {'page': page},
    ),
  );
  Future<String> save(Map<String, dynamic> input, {String? id}) async {
    final result = _map(
      id == null
          ? await _client.postData('/places', data: input)
          : await _client.patchData(
              '/places/${Uri.encodeComponent(id)}',
              data: input,
            ),
    );
    final savedId = result['id'];
    if (savedId is! String || savedId.isEmpty) {
      throw StateError('The saved place could not be verified. Please retry.');
    }
    return savedId;
  }

  Future<void> bookmark(String id, bool value) async => ApiResult.unwrap(
    await _client.dio
        .put(
          '/places/${Uri.encodeComponent(id)}/bookmark',
          data: {'value': value},
        )
        .then((r) => r.data),
  );
  Future<void> visit(String id, bool value) async => ApiResult.unwrap(
    await _client.dio
        .put('/places/${Uri.encodeComponent(id)}/visit', data: {'value': value})
        .then((r) => r.data),
  );
  Future<void> review(String id, int score, String comment) async =>
      ApiResult.unwrap(
        await _client.dio
            .put(
              '/places/${Uri.encodeComponent(id)}/review',
              data: {'score': score, 'comment': comment},
            )
            .then((r) => r.data),
      );
  Future<void> removeReview(String id) async => ApiResult.unwrap(
    await _client.deleteData('/places/${Uri.encodeComponent(id)}/review'),
  );
  Future<void> removePhoto(String id, String photoId) async => ApiResult.unwrap(
    await _client.deleteData(
      '/places/${Uri.encodeComponent(id)}/photos/${Uri.encodeComponent(photoId)}',
    ),
  );
  Future<void> photo(
    String id,
    String path,
    String name,
    String requestKey,
  ) async {
    final body = await compute(_placePhotoBody, (path, name, requestKey));
    ApiResult.unwrap(
      await _client.postData(
        '/places/${Uri.encodeComponent(id)}/photos',
        data: body,
        sendTimeout: const Duration(seconds: 60),
        receiveTimeout: const Duration(seconds: 60),
      ),
    );
  }

  Future<List<Map<String, dynamic>>> search(String query) =>
      UserAppRepository().searchPlaces(query);
  Future<Map<String, dynamic>> reverse(
    double latitude,
    double longitude,
  ) async => _map(
    await _client.getData(
      '/geocode/reverse',
      queryParameters: {'latitude': latitude, 'longitude': longitude},
    ),
  );
  Future<Map<String, dynamic>> profile() => UserAppRepository().profile();
  Future<List<Map<String, dynamic>>> legacy() async =>
      (await UserAppRepository().savedPlaces())
          .where((p) => p['community_place_id'] == null)
          .toList();
  Future<void> removeLegacy(String id) =>
      UserAppRepository().deleteSavedPlace(id);
}

Future<String> _placePhotoBody((String, String, String) input) async {
  final (path, name, key) = input;
  final file = File(path);
  if (await file.length() > 3000000) {
    throw StateError('Choose an image up to 3 MB.');
  }
  final bytes = await file.readAsBytes();
  if (bytes.isEmpty || bytes.length > 3000000) {
    throw StateError('Choose an image up to 3 MB.');
  }
  final mime = switch (bytes) {
    [0xff, 0xd8, 0xff, ...] => 'image/jpeg',
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...] => 'image/png',
    [0x52, 0x49, 0x46, 0x46, _, _, _, _, 0x57, 0x45, 0x42, 0x50, ...] =>
      'image/webp',
    _ => throw StateError('Choose a JPEG, PNG or WebP image.'),
  };
  return jsonEncode({
    'image_upload': {
      'file_name': name,
      'data_url': 'data:$mime;base64,${base64Encode(bytes)}',
    },
    'request_key': key,
  });
}

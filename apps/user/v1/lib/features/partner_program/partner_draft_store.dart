import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:path_provider/path_provider.dart';

class PartnerLocalFile {
  final String name;
  final String? path;
  String? assetId;
  PartnerLocalFile({required this.name, this.path, this.assetId});
  Map<String, dynamic> toJson() => {
    'name': name,
    'path': path,
    'asset_id': assetId,
  };
}

/// Metadata is encrypted by secure storage. Document bytes stay in private
/// application storage and never form part of the in-memory form/draft JSON.
class PartnerDraftStore {
  final Directory directory;
  final String userId;
  final FlutterSecureStorage _storage;
  Future<void> _writes = Future<void>.value();
  PartnerDraftStore({
    required this.directory,
    required this.userId,
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) : _storage = storage;

  static Future<PartnerDraftStore> create(String userId) async {
    final root = await getApplicationSupportDirectory();
    final scope = base64Url.encode(utf8.encode(userId)).replaceAll('=', '');
    final directory = Directory('${root.path}/partner_drafts/$scope');
    await directory.create(recursive: true);
    return PartnerDraftStore(directory: directory, userId: userId);
  }

  String get _key => 'partner_application_draft:$userId';
  bool owns(String path) =>
      File(path).absolute.parent.uri.normalizePath() ==
      directory.absolute.uri.normalizePath();

  Future<PartnerLocalFile> stage(
    String name,
    Stream<List<int>> source, {
    int maxBytes = 3000000,
  }) async {
    await directory.create(recursive: true);
    final id = List.generate(
      16,
      (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0'),
    ).join();
    final file = File.fromUri(directory.uri.resolve('$id.pending'));
    final sink = file.openWrite();
    var size = 0;
    try {
      await for (final chunk in source) {
        size += chunk.length;
        if (size > maxBytes || size > 3000000) {
          throw StateError(
            'Choose files within the configured size limit and no larger than 3 MB.',
          );
        }
        sink.add(chunk);
        // Apply disk backpressure instead of retaining the whole input stream.
        await sink.flush();
      }
      if (size == 0) throw StateError('Choose a nonempty file.');
      await sink.close();
      return PartnerLocalFile(name: name, path: file.path);
    } catch (_) {
      try {
        await sink.close();
      } catch (_) {}
      if (await file.exists()) await file.delete();
      rethrow;
    }
  }

  Future<void> save(Map<String, dynamic> draft) {
    final value = jsonEncode(draft);
    final write = _writes.then((_) => _storage.write(key: _key, value: value));
    _writes = write.catchError((Object _) {});
    return write;
  }

  Future<Map<String, dynamic>?> read() async {
    await _writes;
    final value = await _storage.read(key: _key);
    if (value == null) return null;
    try {
      final draft = jsonDecode(value);
      return draft is Map<String, dynamic> && draft['format'] == 1
          ? draft
          : null;
    } catch (_) {
      return null;
    }
  }

  Future<List<PartnerLocalFile>> restoreFiles(
    dynamic rows,
    Set<String> assets,
  ) async {
    if (rows is! List) return [];
    final result = <PartnerLocalFile>[];
    for (final row in rows.take(10)) {
      if (row is! Map || row['name'] is! String) continue;
      final assetId = row['asset_id'];
      final path = row['path'];
      final local = path is String && owns(path) && await File(path).exists();
      result.add(
        PartnerLocalFile(
          name: row['name'] as String,
          path: local ? path : null,
          assetId: assetId is String && assets.contains(assetId)
              ? assetId
              : null,
        ),
      );
      if (result.last.path == null && result.last.assetId == null) {
        result.removeLast();
      }
    }
    return result;
  }

  Future<void> remove(PartnerLocalFile file) async {
    final path = file.path;
    if (path != null && owns(path) && await File(path).exists()) {
      await File(path).delete();
    }
  }

  Future<void> clear() async {
    final write = _writes.then((_) => _storage.delete(key: _key));
    _writes = write.catchError((Object _) {});
    await write;
    if (!await directory.exists()) return;
    await for (final entry in directory.list()) {
      if (entry is File &&
          owns(entry.path) &&
          RegExp(
            r'^[a-f0-9]{32}\.pending$',
          ).hasMatch(entry.uri.pathSegments.last)) {
        await entry.delete();
      }
    }
  }
}

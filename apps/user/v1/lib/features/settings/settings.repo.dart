import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/models/user.model.dart';

class SettingsAccount {
  final UserModel user;
  final AppMode mode;
  const SettingsAccount({required this.user, required this.mode});

  bool get hasDriverAccess => AppModeRepository().canEnterDriver(user);
  bool get exited => user.partnerStatus == 'EXITED';
}

class SettingsRepository {
  Future<SettingsAccount> load() async {
    final user = await AuthRepository().currentUser();
    // Resolve the account-scoped mode before enabling mode-dependent shortcuts.
    return SettingsAccount(
      user: user,
      mode: await AppModeRepository().preferred(user),
    );
  }

  Future<void> savePhoto(String path, String name) async {
    final body = await compute(_photoBody, (path, name));
    ApiResult.unwrap(
      await DioClient().postData(
        '/me/avatar',
        data: body,
        sendTimeout: const Duration(seconds: 60),
        receiveTimeout: const Duration(seconds: 60),
      ),
    );
  }

  Future<void> signOut() => AuthRepository().signOut();
}

Future<String> _photoBody((String, String) input) async {
  final (path, name) = input;
  final file = File(path);
  if (await file.length() > 3000000) {
    throw StateError('Choose a profile photo up to 3 MB.');
  }
  final bytes = await file.readAsBytes();
  if (bytes.isEmpty || bytes.length > 3000000) {
    throw StateError('Choose a profile photo up to 3 MB.');
  }
  final mime = switch (bytes) {
    [0xff, 0xd8, 0xff, ...] => 'image/jpeg',
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...] => 'image/png',
    [0x52, 0x49, 0x46, 0x46, _, _, _, _, 0x57, 0x45, 0x42, 0x50, ...] =>
      'image/webp',
    _ => throw StateError('Choose a JPEG, PNG or WebP profile photo.'),
  };
  return jsonEncode({
    'image_upload': {
      'file_name': name,
      'data_url': 'data:$mime;base64,${base64Encode(bytes)}',
    },
  });
}

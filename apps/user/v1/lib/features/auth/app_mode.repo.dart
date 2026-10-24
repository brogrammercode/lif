import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:user/features/auth/models/user.model.dart';

enum AppMode { rider, driver }

class AppModeRepository {
  final _storage = const FlutterSecureStorage();
  bool canEnterDriver(UserModel user) =>
      user.role == 'DRIVER' ||
      user.partnerStatus == 'ACTIVATED' ||
      user.partnerStatus == 'EXITED';

  Future<AppMode> preferred(UserModel user) async {
    if (!canEnterDriver(user)) return AppMode.rider;
    final value = await _storage.read(key: 'app_mode_${user.id}');
    return value == 'rider' ? AppMode.rider : AppMode.driver;
  }

  Future<void> save(String userId, AppMode mode) =>
      _storage.write(key: 'app_mode_$userId', value: mode.name);
}

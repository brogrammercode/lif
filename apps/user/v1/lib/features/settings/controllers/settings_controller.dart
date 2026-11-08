import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/settings/settings.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class SettingsController extends FeatureController {
  SettingsController(this.repository);
  String? notice;
  final SettingsRepository repository;
  SettingsAccount? account;
  String? error;
  int loadId = 0;
  Future<void> load() async {
    final id = ++loadId;
    if (error != null) update(() => error = null);
    try {
      final account = await repository.load();
      if (!isDisposed && id == loadId) update(() => this.account = account);
    } catch (error) {
      if (isDisposed || id != loadId) return;
      if (account == null) {
        update(() => this.error = ApiResult.errorMessage(error));
      } else {
        notice = 'Your profile could not be refreshed. Please try again.';
      }
    }
  }
}

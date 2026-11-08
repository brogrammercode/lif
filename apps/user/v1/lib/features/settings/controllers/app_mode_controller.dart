import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/auth/models/user.model.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class AppModeController extends FeatureController {
  AppModeController(this.user, this.initial);
  final UserModel user;
  final AppMode? initial;
  final modes = AppModeRepository();
  late final Future<AppMode> mode = initial == null
      ? modes.preferred(user)
      : Future.value(initial!);
  bool busy = false;

  Future<bool> switchMode(AppMode current) async {
    if (busy || isDisposed) return false;
    update(() => busy = true);
    try {
      final contextData = await UserAppRepository().travelContext();
      if (contextData['mode_switch_allowed'] != true) {
        throw StateError(
          'Finish or cancel your active ride before switching modes.',
        );
      }
      final target = current == AppMode.rider ? AppMode.driver : AppMode.rider;
      if (target == AppMode.driver &&
          contextData['can_enter_driver_mode'] != true) {
        throw StateError(
          'Complete Partner Program activation before entering driver mode.',
        );
      }
      if (target == AppMode.rider &&
          contextData['driver_availability'] != null &&
          contextData['driver_operations_allowed'] == true) {
        await UserAppRepository().goOffline();
      }
      if (target == AppMode.rider) await DriverTrackingService.instance.stop();
      await modes.save(user.id, target);
      return !isDisposed;
    } finally {
      if (!isDisposed) update(() => busy = false);
    }
  }
}

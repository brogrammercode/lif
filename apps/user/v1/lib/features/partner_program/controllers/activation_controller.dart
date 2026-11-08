import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';

class ActivationController extends FeatureController {
  bool busy = false;
  String? error;
  Future<bool> activate(String code) async {
    if (busy || code.length != 6 || isDisposed) return false;
    update(() {
      busy = true;
      error = null;
    });
    try {
      await PartnerProgramRepository().activate(code);
      try {
        final user = await AuthRepository().currentUser();
        await AppModeRepository().save(user.id, AppMode.driver);
      } catch (_) {
        /* Activation is committed; preference failure must not consume it again. */
      }
      return !isDisposed;
    } catch (e) {
      update(() => error = ApiResult.errorMessage(e));
      return false;
    } finally {
      update(() => busy = false);
    }
  }
}

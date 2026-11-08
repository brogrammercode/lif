import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SessionDestination {
  final String route;
  final Object? arguments;
  const SessionDestination(this.route, [this.arguments]);
}

class SessionController extends FeatureController {
  late Future<SessionDestination> destination = resolveDestination();
  Future<SessionDestination> resolveDestination() async {
    if (!await DioClient().hasSession()) {
      return const SessionDestination(AppRoutes.login);
    }
    try {
      final user = await AuthRepository().currentUser();
      final travel = await UserAppRepository().travelContext();
      if (travel['active_driver_ride'] is Map) {
        return SessionDestination(
          AppRoutes.driverRideDetail,
          (travel['active_driver_ride'] as Map)['id'],
        );
      }
      if (travel['active_rider_ride'] is Map) {
        return SessionDestination(
          AppRoutes.rideDetail,
          (travel['active_rider_ride'] as Map)['id'],
        );
      }
      if (user.partnerActivationRequired) {
        return const SessionDestination(AppRoutes.partnerActivation);
      }
      final mode = await AppModeRepository().preferred(user);
      return SessionDestination(
        mode == AppMode.driver && travel['can_enter_driver_mode'] == true
            ? AppRoutes.driverHome
            : AppRoutes.home,
      );
    } catch (_) {
      if (!await DioClient().hasSession()) {
        return const SessionDestination(AppRoutes.login);
      }
      rethrow;
    }
  }

  void retry() => update(() => destination = resolveDestination());
}

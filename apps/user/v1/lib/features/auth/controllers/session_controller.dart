import 'package:dio/dio.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SessionDestination {
  final String route;
  final Object? arguments;
  const SessionDestination(this.route, [this.arguments]);
}

class SessionController extends FeatureController {
  SessionController({DioClient? client}) : _injectedClient = client;

  final DioClient? _injectedClient;
  late final _client = _injectedClient ?? DioClient();
  late final _auth = AuthRepository(client: _client);
  late final _travel = UserAppRepository(client: _client);
  final _modes = AppModeRepository();

  Future<SessionDestination> resolveDestination({
    UserModel? signedInUser,
  }) async {
    if (!await _client.hasSession()) {
      return const SessionDestination(AppRoutes.login);
    }
    try {
      final profile = signedInUser == null
          ? _auth.currentUser()
          : Future.value(signedInUser);
      final reads = await Future.wait<Object>([profile, _loadTravel(profile)]);
      final user = reads[0] as UserModel;
      final travel = reads[1] as Map<String, dynamic>;
      if (user.partnerStatus != 'EXITED' &&
          travel['driver_operations_allowed'] != false &&
          travel['active_driver_ride'] is Map) {
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
      final mode = await _modes.preferred(user);
      return SessionDestination(
        mode == AppMode.driver && travel['can_enter_driver_mode'] == true
            ? AppRoutes.driverHome
            : AppRoutes.home,
      );
    } catch (_) {
      if (!await _client.hasSession()) {
        return const SessionDestination(AppRoutes.login);
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _loadTravel(Future<UserModel> profile) async {
    try {
      return await _travel.travelContext();
    } on DioException catch (error) {
      final user = await profile;
      final code = error.response?.statusCode;
      final data = error.response?.data;
      final staleDriverGate =
          user.partnerStatus == 'EXITED' &&
          code == 403 &&
          data is Map &&
          data['error_code'] == 'DRIVER_EXITED';
      final retryable =
          code == 429 ||
          (code != null && code >= 500) ||
          switch (error.type) {
            DioExceptionType.connectionError ||
            DioExceptionType.connectionTimeout ||
            DioExceptionType.sendTimeout ||
            DioExceptionType.receiveTimeout => true,
            _ => false,
          };
      // Rider Home refreshes trip state independently of the login gate.
      if (!_modes.canEnterDriver(user) &&
          !user.partnerActivationRequired &&
          (staleDriverGate || retryable) &&
          await _client.hasSession()) {
        return const {};
      }
      rethrow;
    }
  }
}

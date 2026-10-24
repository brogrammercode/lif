import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  late Future<_Destination> _destination = _resolveDestination();

  Future<_Destination> _resolveDestination() async {
    if (!await DioClient().hasSession()) {
      return const _Destination(AppRoutes.login);
    }
    try {
      final user = await AuthRepository().currentUser();
      final travel = await UserAppRepository().travelContext();
      if (travel['active_driver_ride'] is Map) {
        return _Destination(
          AppRoutes.driverRideDetail,
          (travel['active_driver_ride'] as Map)['id'],
        );
      }
      if (travel['active_rider_ride'] is Map) {
        return _Destination(
          AppRoutes.rideDetail,
          (travel['active_rider_ride'] as Map)['id'],
        );
      }
      if (user.partnerActivationRequired) {
        return const _Destination(AppRoutes.partnerActivation);
      }
      final mode = await AppModeRepository().preferred(user);
      return _Destination(
        mode == AppMode.driver && travel['can_enter_driver_mode'] == true
            ? AppRoutes.driverHome
            : AppRoutes.home,
      );
    } catch (_) {
      if (!await DioClient().hasSession()) {
        return const _Destination(AppRoutes.login);
      }
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<_Destination>(
    future: _destination,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Scaffold(
          body: SafeArea(
            child: AppLoadError(
              message: ApiResult.errorMessage(snapshot.error!),
              onRetry: () => setState(() {
                _destination = _resolveDestination();
              }),
            ),
          ),
        );
      }
      if (!snapshot.hasData) {
        return Scaffold(
          backgroundColor: AppColors.pureWhite,
          body: Center(
            child: SizedBox(
              width: 22.w,
              height: 22.w,
              child: const CircularProgressIndicator(
                strokeWidth: 2,
                color: AppColors.primaryGreen,
              ),
            ),
          ),
        );
      }
      return _RouteReplacement(
        route: snapshot.data!.route,
        arguments: snapshot.data!.arguments,
      );
    },
  );
}

class HomeDestination extends StatelessWidget {
  const HomeDestination({super.key});
  @override
  Widget build(BuildContext context) =>
      const _RouteReplacement(route: AppRoutes.home);
}

class LoginDestination extends StatelessWidget {
  const LoginDestination({super.key});
  @override
  Widget build(BuildContext context) =>
      const _RouteReplacement(route: AppRoutes.login);
}

class _RouteReplacement extends StatefulWidget {
  final String route;
  final Object? arguments;
  const _RouteReplacement({required this.route, this.arguments});
  @override
  State<_RouteReplacement> createState() => _RouteReplacementState();
}

class _RouteReplacementState extends State<_RouteReplacement> {
  bool _scheduled = false;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_scheduled) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        Navigator.pushReplacementNamed(
          context,
          widget.route,
          arguments: widget.arguments,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class _Destination {
  final String route;
  final Object? arguments;
  const _Destination(this.route, [this.arguments]);
}

import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  late Future<String> _destination = _resolveDestination();

  Future<String> _resolveDestination() async {
    if (!await DioClient().hasSession()) return AppRoutes.login;
    try {
      final user = await AuthRepository().currentUser();
      if (user.role == 'DRIVER' ||
          user.partnerStatus == 'ACTIVATED' ||
          user.partnerStatus == 'EXITED') {
        return AppRoutes.driverHome;
      }
      if (user.partnerActivationRequired) return AppRoutes.partnerActivation;
      return AppRoutes.home;
    } catch (_) {
      if (!await DioClient().hasSession()) return AppRoutes.login;
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<String>(
    future: _destination,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return Scaffold(
          body: SafeArea(
            child: AppLoadError(
              message: ApiResult.errorMessage(snapshot.error!),
              onRetry: () =>
                  setState(() => _destination = _resolveDestination()),
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
      return _RouteReplacement(route: snapshot.data!);
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
  const _RouteReplacement({required this.route});
  @override
  State<_RouteReplacement> createState() => _RouteReplacementState();
}

class _RouteReplacementState extends State<_RouteReplacement> {
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) Navigator.pushReplacementNamed(context, widget.route);
    });
  }

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

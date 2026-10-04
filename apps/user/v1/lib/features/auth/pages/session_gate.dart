import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  late final Future<String> _destination = _resolveDestination();

  Future<String> _resolveDestination() async {
    if (!await DioClient().hasSession()) return AppRoutes.login;
    try {
      await AuthRepository().currentUser();
      return AppRoutes.home;
    } catch (_) {
      return await DioClient().hasSession() ? AppRoutes.home : AppRoutes.login;
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<String>(
    future: _destination,
    builder: (context, snapshot) {
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
      return snapshot.data == AppRoutes.home
          ? const HomeDestination()
          : const LoginDestination();
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

import 'package:user/features/auth/controllers/session_controller.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_logo.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/routes.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  final _controller = SessionController();
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<SessionDestination>(
    future: _controller.destination,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return LiquidGlassScope(
          child: Scaffold(
            backgroundColor: GlassTokens.canvas,
            body: LiquidGlassBackdrop(
              child: SafeArea(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: AppLoadError(
                        message: ApiResult.errorMessage(snapshot.error!),
                        onRetry: () => setState(() {
                          _controller.retry();
                        }),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      }
      if (!snapshot.hasData) {
        return LiquidGlassScope(
          child: Scaffold(
            backgroundColor: GlassTokens.canvas,
            body: LiquidGlassBackdrop(
              child: SafeArea(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: LiquidGlassSurface(
                        child: AppSkeleton(
                          label: 'Restoring your 1More workspace',
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: const [
                              AppLogo(width: 116, height: 44),
                              SizedBox(height: 24),
                              SkeletonBox(width: 230, height: 18),
                              SizedBox(height: 11),
                              SkeletonBox(width: 290, height: 12),
                              SizedBox(height: 8),
                              SkeletonBox(width: 210, height: 12),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
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

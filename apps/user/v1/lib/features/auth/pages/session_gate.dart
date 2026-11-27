import 'package:user/features/auth/controllers/session_controller.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/routes.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/widgets/startup_splash.dart';

class SessionGate extends StatefulWidget {
  final Future<void> Function()? initialize;
  final UserModel? signedInUser;
  const SessionGate({super.key, this.initialize, this.signedInUser});

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  final _controller = SessionController();
  late Future<SessionDestination> _destination;
  Future<void>? _initialization;
  bool _splashFinished = false;

  @override
  void initState() {
    super.initState();
    _destination = _resolveDestination(signedInUser: widget.signedInUser);
  }

  Future<SessionDestination> _resolveDestination({
    UserModel? signedInUser,
  }) async {
    final initialize = widget.initialize;
    if (initialize != null) {
      try {
        await (_initialization ??= initialize());
      } catch (_) {
        _initialization = null;
        rethrow;
      }
    }
    return _controller.resolveDestination(signedInUser: signedInUser);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<SessionDestination>(
    future: _destination,
    builder: (context, snapshot) {
      if (widget.initialize != null &&
          (!_splashFinished || !snapshot.hasError)) {
        return Stack(
          fit: StackFit.expand,
          children: [
            StartupSplash(
              play: !_splashFinished,
              onFinished: () => setState(() => _splashFinished = true),
            ),
            if (_splashFinished && snapshot.hasData)
              _RouteReplacement(
                route: snapshot.data!.route,
                arguments: snapshot.data!.arguments,
              ),
          ],
        );
      }
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
                          _destination = _resolveDestination();
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
        return const Scaffold(
          backgroundColor: Colors.white,
          body: SizedBox.expand(),
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
    if (_scheduled || ModalRoute.isCurrentOf(context) == false) return;
    _scheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (ModalRoute.isCurrentOf(context) == false) {
        _scheduled = false;
      } else {
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

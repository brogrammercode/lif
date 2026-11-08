import 'package:user/features/auth/controllers/login_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/app_logo.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/constants/user.constant.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  late final _controller = LoginController()..addListener(_changed);
  bool get _signingIn => _controller.signingIn;
  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.removeListener(_changed);
    _controller.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    if (_signingIn) return;
    try {
      if (await _controller.signIn() && mounted) {
        Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.gate,
          (_) => false,
        );
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    }
  }

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: SystemUiOverlayStyle.dark.copyWith(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: GlassTokens.canvas,
    ),
    child: LiquidGlassScope(
      child: Scaffold(
        backgroundColor: GlassTokens.canvas,
        body: LiquidGlassBackdrop(
          child: SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 14, 20, 24),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: constraints.maxHeight - 38,
                  ),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Wrap(
                          alignment: WrapAlignment.spaceBetween,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          spacing: 12,
                          runSpacing: 10,
                          children: [
                            const AppLogo(width: 116, height: 44),
                            LiquidGlassSurface(
                              radius: 99,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 13,
                                vertical: 9,
                              ),
                              child: const Text(
                                'RIDER + DRIVER',
                                style: TextStyle(
                                  color: GlassTokens.accent,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: .7,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 32),
                        const _WelcomeVisual(),
                        const SizedBox(height: 28),
                        Text(
                          UserConstants.LOGIN_TITLE.replaceAll('\n', ' '),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: GlassTokens.ink,
                            fontSize: 34,
                            fontWeight: FontWeight.w700,
                            height: 1.08,
                            letterSpacing: -.8,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Text(
                          UserConstants.LOGIN_SUBTITLE.replaceAll('\n', ' '),
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: GlassTokens.muted,
                            fontSize: 14,
                            height: 1.5,
                          ),
                        ),
                        const SizedBox(height: 22),
                        const Wrap(
                          alignment: WrapAlignment.center,
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            _Feature(
                              icon: Icons.route_rounded,
                              label: 'Live trips',
                            ),
                            _Feature(
                              icon: Icons.shield_outlined,
                              label: 'Verified drivers',
                            ),
                            _Feature(
                              icon: Icons.payments_outlined,
                              label: 'Direct payment',
                            ),
                          ],
                        ),
                        const Spacer(),
                        const SizedBox(height: 28),
                        LiquidGlassSurface(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text(
                                'Continue to your workspace',
                                style: TextStyle(
                                  color: GlassTokens.ink,
                                  fontSize: 17,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(height: 5),
                              const Text(
                                'Your saved places, rides and approved driver access stay with this Google account.',
                                style: TextStyle(
                                  color: GlassTokens.muted,
                                  fontSize: 12.5,
                                  height: 1.45,
                                ),
                              ),
                              const SizedBox(height: 16),
                              LiquidGlassButton(
                                text: UserConstants.GOOGLE_AUTH_BUTTON,
                                icon: const _GoogleMark(),
                                busy: _signingIn,
                                onPressed: _signingIn ? null : _signIn,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                        const Text(
                          UserConstants.TERMS_TEXT,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: GlassTokens.muted,
                            fontSize: 11.5,
                            height: 1.4,
                          ),
                        ),
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

class _WelcomeVisual extends StatelessWidget {
  const _WelcomeVisual();

  @override
  Widget build(BuildContext context) => LiquidGlassSurface(
    padding: const EdgeInsets.all(12),
    child: SizedBox(
      height: 178,
      child: Stack(
        children: [
          Positioned.fill(
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: CustomPaint(painter: _RouteBackdropPainter()),
            ),
          ),
          const Positioned(
            left: 24,
            top: 22,
            child: _MapPoint(icon: Icons.person_pin_circle_outlined),
          ),
          const Positioned(
            right: 24,
            bottom: 22,
            child: _MapPoint(icon: Icons.flag_outlined),
          ),
          Center(
            child: LiquidGlassSurface(
              dark: true,
              radius: 99,
              padding: const EdgeInsets.all(18),
              child: const Icon(
                Icons.directions_car_filled_rounded,
                color: Colors.white,
                size: 32,
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _MapPoint extends StatelessWidget {
  final IconData icon;
  const _MapPoint({required this.icon});

  @override
  Widget build(BuildContext context) => LiquidGlassSurface(
    radius: 99,
    padding: const EdgeInsets.all(10),
    child: Icon(icon, color: GlassTokens.accent, size: 22),
  );
}

class _Feature extends StatelessWidget {
  final IconData icon;
  final String label;
  const _Feature({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) => LiquidGlassSurface(
    radius: 99,
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 16, color: GlassTokens.accent),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            label,
            style: const TextStyle(
              color: GlassTokens.ink,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    ),
  );
}

class _GoogleMark extends StatelessWidget {
  const _GoogleMark();

  @override
  Widget build(BuildContext context) => const Text(
    'G',
    style: TextStyle(
      color: AppColors.googleBlue,
      fontSize: 19,
      fontWeight: FontWeight.w800,
    ),
  );
}

class _RouteBackdropPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final background = Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0x70FFFFFF), Color(0x426F9FE5), Color(0x34E6A8CE)],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, background);
    final road = Paint()
      ..color = Colors.white.withValues(alpha: .65)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 9
      ..strokeCap = StrokeCap.round;
    final route = Path()
      ..moveTo(34, 36)
      ..cubicTo(
        size.width * .35,
        38,
        size.width * .55,
        size.height - 26,
        size.width - 34,
        size.height - 34,
      );
    canvas.drawPath(route, road);
    canvas.drawPath(
      route,
      Paint()
        ..color = GlassTokens.accent.withValues(alpha: .62)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..strokeCap = StrokeCap.round,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

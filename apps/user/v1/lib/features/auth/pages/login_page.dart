import 'package:user/components/ui/app_error_snackbar.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/constants/user.constant.dart';
import 'package:user/features/auth/controllers/login_controller.dart';
import 'package:video_player/video_player.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> with WidgetsBindingObserver {
  late final _controller = LoginController()..addListener(_changed);
  late final _background = VideoPlayerController.asset(
    UserConstants.LOGIN_BACKGROUND_VIDEO_ASSET,
  );

  bool get _signingIn => _controller.signingIn;

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_startBackground());
  }

  Future<void> _startBackground() async {
    try {
      await _background.initialize();
      if (!mounted) return;
      await _background.setLooping(true);
      await _background.setVolume(0);
      if (!mounted) return;
      setState(() {});
      await _background.play();
    } catch (_) {
      // Keep the login controls available if this device cannot decode the clip.
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_background.value.isInitialized) return;
    if (state == AppLifecycleState.resumed) {
      unawaited(_background.play());
    } else {
      unawaited(_background.pause());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.removeListener(_changed);
    _controller.dispose();
    unawaited(_background.dispose());
    super.dispose();
  }

  Future<void> _signIn() async {
    if (_signingIn) return;
    try {
      final user = await _controller.signIn();
      if (user != null && mounted) {
        Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.gate,
          (_) => false,
          arguments: user,
        );
      }
    } catch (error) {
      if (mounted) {
        showAppError(context, ApiResult.errorMessage(error));
      }
    }
  }

  Widget _videoBackground() => Positioned.fill(
    child: ColoredBox(
      color: Colors.black,
      child: _background.value.isInitialized
          ? ClipRect(
              child: FittedBox(
                fit: BoxFit.cover,
                alignment: Alignment.center,
                child: SizedBox(
                  width: _background.value.size.width,
                  height: _background.value.size.height,
                  child: VideoPlayer(_background),
                ),
              ),
            )
          : null,
    ),
  );

  @override
  Widget build(BuildContext context) => AnnotatedRegion<SystemUiOverlayStyle>(
    value: SystemUiOverlayStyle.light.copyWith(
      statusBarColor: Colors.transparent,
      systemNavigationBarColor: Colors.transparent,
      systemNavigationBarIconBrightness: Brightness.light,
      systemStatusBarContrastEnforced: false,
      systemNavigationBarContrastEnforced: false,
    ),
    child: Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          _videoBackground(),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0x55000000),
                  Color(0x18000000),
                  Color(0x16000000),
                  Color(0x99000000),
                ],
                stops: [0, .25, .58, 1],
              ),
            ),
          ),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) => SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(22, 12, 22, 18),
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    minHeight: (constraints.maxHeight - 30)
                        .clamp(0.0, double.infinity)
                        .toDouble(),
                  ),
                  child: IntrinsicHeight(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const _FeatureStrip(),
                        const Spacer(),
                        _HeroTitle(
                          title: UserConstants.LOGIN_TITLE,
                          subtitle: UserConstants.LOGIN_SUBTITLE,
                        ),
                        const Spacer(),
                        _GoogleSignInButton(
                          busy: _signingIn,
                          onPressed: _signingIn ? null : _signIn,
                        ),
                        const SizedBox(height: 22),
                        Text(
                          UserConstants.TERMS_TEXT,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Color(0xE6FFFFFF),
                            fontSize: 12,
                            height: 1.45,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class _FeatureStrip extends StatelessWidget {
  const _FeatureStrip();

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 40,
    child: ListView(
      scrollDirection: Axis.horizontal,
      children: const [
        _FeaturePill(
          icon: Icons.directions_car_outlined,
          label: UserConstants.LOGIN_FEATURE_RIDES,
        ),
        SizedBox(width: 10),
        _FeaturePill(
          icon: Icons.location_on_outlined,
          label: UserConstants.LOGIN_FEATURE_TRACKING,
        ),
        SizedBox(width: 10),
        _FeaturePill(
          icon: Icons.payments_outlined,
          label: UserConstants.LOGIN_FEATURE_PAYMENTS,
        ),
      ],
    ),
  );
}

class _FeaturePill extends StatelessWidget {
  final IconData icon;
  final String label;

  const _FeaturePill({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
    decoration: BoxDecoration(
      color: Colors.black.withValues(alpha: .34),
      borderRadius: BorderRadius.circular(22),
      border: Border.all(color: Colors.white.withValues(alpha: .16)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 18, color: const Color(0xFF8372FF)),
        const SizedBox(width: 7),
        Text(
          label,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    ),
  );
}

class _HeroTitle extends StatelessWidget {
  final String title;
  final String subtitle;

  const _HeroTitle({required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final titleSize = (MediaQuery.sizeOf(context).width * .145)
        .clamp(44.0, 60.0)
        .toDouble();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          title,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white,
            fontFamily: 'sans-serif-condensed',
            fontSize: titleSize,
            fontWeight: FontWeight.w900,
            height: .92,
            letterSpacing: -1.2,
            shadows: const [Shadow(color: Color(0x55000000), blurRadius: 16)],
          ),
        ),
        const SizedBox(height: 20),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            height: 1.4,
            fontWeight: FontWeight.w400,
            shadows: [Shadow(color: Color(0x66000000), blurRadius: 10)],
          ),
        ),
      ],
    );
  }
}

class _GoogleSignInButton extends StatelessWidget {
  final bool busy;
  final VoidCallback? onPressed;

  const _GoogleSignInButton({required this.busy, required this.onPressed});

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(36),
    elevation: 2,
    shadowColor: Colors.black.withValues(alpha: .26),
    child: InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(36),
      child: SizedBox(
        height: 64,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (busy)
              const SizedBox.square(
                dimension: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.black,
                ),
              )
            else
              const Text(
                'G',
                style: TextStyle(
                  color: AppColors.googleBlue,
                  fontSize: 23,
                  fontWeight: FontWeight.w800,
                ),
              ),
            const SizedBox(width: 12),
            Text(
              busy ? 'Signing in…' : UserConstants.GOOGLE_AUTH_BUTTON,
              style: const TextStyle(
                color: Colors.black,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

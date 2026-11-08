import 'package:user/features/partner_program/controllers/activation_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';

class PartnerActivationPage extends StatefulWidget {
  const PartnerActivationPage({super.key});

  @override
  State<PartnerActivationPage> createState() => _PartnerActivationPageState();
}

class _PartnerActivationPageState extends State<PartnerActivationPage> {
  final _code = TextEditingController();
  late final _controller = ActivationController()..addListener(_changed);
  bool get _busy => _controller.busy;
  String? get _error => _controller.error;
  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _controller.removeListener(_changed);
    _controller.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _activate() async {
    if (await _controller.activate(_code.text) && mounted) {
      Navigator.pushNamedAndRemoveUntil(
        context,
        AppRoutes.driverHome,
        (_) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: 'Activate your driver account',
    child: ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        const DriverPageIntro(
          icon: Icons.verified_user_outlined,
          title: 'Approved — one last step',
          description:
              'Enter the six-digit code sent manually by your administrator. It has no expiry and can be used once.',
        ),
        const SizedBox(height: 24),
        LiquidGlassSurface(
          padding: EdgeInsets.zero,
          radius: 24,
          child: TextField(
            controller: _code,
            enabled: !_busy,
            autofillHints: const [AutofillHints.oneTimeCode],
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w600,
              letterSpacing: 6,
            ),
            decoration: const InputDecoration(
              labelText: 'Activation code',
              counterText: '',
              border: GlassTokens.inputBorder,
            ),
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _activate(),
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 16),
          DriverNotice(
            icon: Icons.info_outline_rounded,
            message: _error!,
            error: true,
          ),
        ],
        const SizedBox(height: 20),
        LiquidGlassButton(
          text: 'Activate and continue',
          icon: const Icon(Icons.arrow_forward_rounded),
          busy: _busy,
          onPressed: _busy || _code.text.length != 6 ? null : _activate,
        ),
        const SizedBox(height: 12),
        const DriverNotice(
          icon: Icons.security_rounded,
          message:
              'Five incorrect attempts lock activation. Contact your administrator if the code is missing or locked.',
        ),
        TextButton(
          onPressed: _busy
              ? null
              : () async {
                  await AuthRepository().signOut();
                  if (context.mounted) {
                    Navigator.pushNamedAndRemoveUntil(
                      context,
                      AppRoutes.login,
                      (_) => false,
                    );
                  }
                },
          child: const Text('Sign out'),
        ),
      ],
    ),
  );
}

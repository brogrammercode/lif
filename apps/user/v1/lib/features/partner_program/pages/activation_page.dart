import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/partner_program/controllers/activation_controller.dart';

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

  Future<void> _signOut() async {
    if (_busy) return;
    await AuthRepository().signOut();
    if (!mounted) return;
    Navigator.pushNamedAndRemoveUntil(context, AppRoutes.login, (_) => false);
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: 'Activate driver account',
    child: ListView(
      padding: const EdgeInsets.only(top: 18, bottom: 28),
      children: [
        const Text(
          'Enter your one-time six-digit activation code.',
          style: TextStyle(fontSize: 14, height: 1.4, color: RideTokens.muted),
        ),
        const SizedBox(height: 20),
        SolidTextFormField(
          controller: _code,
          enabled: !_busy,
          label: 'Activation code',
          hint: '6 digits',
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          textAlign: TextAlign.center,
          textStyle: const TextStyle(
            fontSize: 28,
            height: 1.2,
            fontWeight: FontWeight.w500,
            letterSpacing: 8,
            color: RideTokens.ink,
          ),
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(6),
          ],
          onChanged: (_) => setState(() {}),
          onFieldSubmitted: (_) => _activate(),
        ),
        if (_error != null) AppErrorNotice(message: _error),
        if (_code.text.isNotEmpty) ...[
          const SizedBox(height: 20),
          SizedBox(
            height: 60,
            child: SolidButton(
              text: 'Activate account',
              icon: const Icon(Icons.arrow_forward_rounded, size: 18),
              busy: _busy,
              minHeight: 60,
              onPressed: _busy || _code.text.length != 6 ? null : _activate,
            ),
          ),
        ],
        const SizedBox(height: 12),
        const Text(
          'Five incorrect attempts lock activation. Contact your administrator if the code is missing or locked.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, height: 1.4, color: RideTokens.muted),
        ),
        const SizedBox(height: 12),
        TextButton(
          onPressed: _busy ? null : _signOut,
          child: const Text('Sign out'),
        ),
      ],
    ),
  );
}

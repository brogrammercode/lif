import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/app_mode.repo.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';

class PartnerActivationPage extends StatefulWidget {
  const PartnerActivationPage({super.key});
  @override
  State<PartnerActivationPage> createState() => _PartnerActivationPageState();
}

class _PartnerActivationPageState extends State<PartnerActivationPage> {
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _activate() async {
    if (_busy || _code.text.length != 6) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await PartnerProgramRepository().activate(_code.text);
      try {
        final user = await AuthRepository().currentUser();
        await AppModeRepository().save(user.id, AppMode.driver);
      } catch (_) {
        // Activation is committed; preference storage must not consume the code again.
      }
      if (mounted) {
        Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.driverHome,
          (_) => false,
        );
      }
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: 'Activate your driver account',
    child: ListView(
      children: [
        const SizedBox(height: 24),
        const Icon(
          Icons.verified_user_outlined,
          size: 64,
          color: AppColors.primaryGreen,
        ),
        const SizedBox(height: 24),
        const Text(
          'You’re approved. One last step.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 12),
        const Text(
          'Enter the six-digit activation code sent manually by your administrator. It has no expiry and can be used once.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AppColors.textSecondary, height: 1.5),
        ),
        const SizedBox(height: 28),
        TextField(
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
            fontWeight: FontWeight.w800,
            letterSpacing: 12,
          ),
          decoration: const InputDecoration(
            labelText: 'Activation code',
            counterText: '',
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (_) => _activate(),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Text(
              _error!,
              style: const TextStyle(color: AppColors.googleRed),
            ),
          ),
        const SizedBox(height: 20),
        AppButton(
          text: 'Activate and continue',
          isLoading: _busy,
          onPressed: _busy || _code.text.length != 6 ? null : _activate,
        ),
        const SizedBox(height: 12),
        const Text(
          'Five incorrect attempts lock activation. Contact your administrator if the code is missing or locked.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 12, color: AppColors.textTertiary),
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

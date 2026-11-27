import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import '../controllers/wallet_controller.dart';
import 'wallet_feedback.dart';

class PayoutSetupForm extends StatefulWidget {
  const PayoutSetupForm({super.key, required this.wallet});
  final WalletController wallet;

  @override
  State<PayoutSetupForm> createState() => _PayoutSetupFormState();
}

class _PayoutSetupFormState extends State<PayoutSetupForm> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _vpa = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _vpa.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_form.currentState?.validate() != true) return;
    FocusManager.instance.primaryFocus?.unfocus();
    await widget.wallet.setupPayoutMethod(_name.text.trim(), _vpa.text.trim());
    if (mounted && widget.wallet.checkoutError == null) {
      _name.clear();
      _vpa.clear();
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.wallet,
    builder: (context, _) {
      final wallet = widget.wallet;
      return AppErrorNotice(
        message: wallet.checkoutError,
        child: Form(
          key: _form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final method in wallet.payoutMethods)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.account_balance_outlined),
                  title: Text(method.label),
                  subtitle: Text(switch (method.status) {
                    'VERIFIED' =>
                      method.isDefault ? 'Verified · Default' : 'Verified',
                    'FAILED' => 'Verification failed',
                    _ => 'Verification pending',
                  }),
                  trailing: method.status == 'PENDING'
                      ? TextButton(
                          onPressed: wallet.checkoutBusy
                              ? null
                              : () => wallet.checkPayoutMethod(method.id),
                          child: const Text('Check'),
                        )
                      : null,
                ),
              if (wallet.upiPayoutEnabled) ...[
                const SizedBox(height: 12),
                SolidTextFormField(
                  controller: _name,
                  label: 'UPI account holder',
                  enabled: !wallet.checkoutBusy,
                  validator: (value) => (value?.trim().length ?? 0) < 3
                      ? 'Enter the registered account name.'
                      : null,
                  maxLength: 50,
                ),
                const SizedBox(height: 12),
                SolidTextFormField(
                  controller: _vpa,
                  label: 'UPI ID',
                  keyboardType: TextInputType.emailAddress,
                  enabled: !wallet.checkoutBusy,
                  maxLength: 100,
                  validator: (value) =>
                      RegExp(
                        r'^[a-z0-9.-]+@[a-z0-9.-]+$',
                        caseSensitive: false,
                      ).hasMatch(value?.trim() ?? '')
                      ? null
                      : 'Enter a valid UPI ID.',
                ),
                const SizedBox(height: 16),
                SolidButton(
                  text: 'Verify UPI ID',
                  busy: wallet.checkoutBusy,
                  onPressed: wallet.checkoutBusy ? null : _submit,
                ),
              ] else if (wallet.checkoutBusy) ...[
                const WalletShimmer(height: 48),
              ] else ...[
                const Text('UPI verification is unavailable.'),
                TextButton(
                  onPressed: wallet.loadPayoutMethods,
                  child: const Text('Check again'),
                ),
              ],
              const SizedBox(height: 12),
              const Text(
                'Debit card setup is unavailable.',
                style: TextStyle(color: RideTokens.muted),
              ),
            ],
          ),
        ),
      );
    },
  );
}

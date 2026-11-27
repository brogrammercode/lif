import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:user/components/ui/solid_ui.dart';
import '../controllers/wallet_controller.dart';

enum _PayoutKind {
  bank('BANK_ACCOUNT', 'Bank account'),
  card('DEBIT_CARD', 'Debit card'),
  upi('UPI', 'UPI');

  const _PayoutKind(this.key, this.label);
  final String key, label;
}

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
  final _account = TextEditingController();
  final _ifsc = TextEditingController();
  final _lastFour = TextEditingController();
  _PayoutKind _kind = _PayoutKind.bank;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.wallet.loadPayoutMethods();
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _vpa.dispose();
    _account.dispose();
    _ifsc.dispose();
    _lastFour.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_form.currentState?.validate() != true) return;
    FocusManager.instance.primaryFocus?.unfocus();
    final saved = await widget.wallet.setupPayoutMethod({
      'kind': _kind.key,
      'name': _name.text.trim(),
      if (_kind == _PayoutKind.upi)
        'vpa': _vpa.text.trim()
      else ...{
        'account_number': _account.text.trim(),
        'ifsc': _ifsc.text.trim().toUpperCase(),
        if (_kind == _PayoutKind.card) 'card_last_four': _lastFour.text.trim(),
      },
    });
    if (!mounted || !saved) return;
    _form.currentState?.reset();
    _name.clear();
    _vpa.clear();
    _account.clear();
    _ifsc.clear();
    _lastFour.clear();
  }

  Widget _field(
    String label,
    TextEditingController controller,
    RegExp pattern,
    String error, {
    int? maxLength,
    TextInputType? keyboard,
    bool digitsOnly = false,
  }) => SolidTextFormField(
    label: label,
    controller: controller,
    maxLength: maxLength,
    enabled: !widget.wallet.checkoutBusy,
    keyboardType: keyboard,
    inputFormatters: digitsOnly
        ? [FilteringTextInputFormatter.digitsOnly]
        : null,
    validator: (value) => pattern.hasMatch(value?.trim() ?? '') ? null : error,
  );

  Widget _methodChip(_PayoutKind kind, {required bool busy}) {
    final selected = _kind == kind;
    return ChoiceChip(
      label: Text(kind.label, textAlign: TextAlign.center),
      labelStyle: TextStyle(
        color: selected ? Colors.white : RideTokens.ink,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
      color: WidgetStatePropertyAll(
        selected ? Colors.black : const Color(0xFFF5F5F5),
      ),
      side: BorderSide(color: selected ? Colors.black : RideTokens.line),
      showCheckmark: false,
      selected: selected,
      onSelected: busy ? null : (_) => setState(() => _kind = kind),
    );
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
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            spacing: 12,
            children: [
              for (final method in wallet.payoutMethods)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(switch (method.kind) {
                    'UPI' => Icons.qr_code_2,
                    'DEBIT_CARD' => Icons.credit_card_outlined,
                    _ => Icons.account_balance_outlined,
                  }),
                  title: Text(method.label),
                  subtitle: Text(
                    method.isDefault
                        ? 'Default payout account'
                        : method.selectable
                        ? 'Saved'
                        : 'Save again to use this account',
                  ),
                  trailing: method.isDefault
                      ? const Icon(Icons.check_circle_outline)
                      : null,
                  onTap:
                      wallet.checkoutBusy ||
                          method.isDefault ||
                          !method.selectable
                      ? null
                      : () => wallet.choosePayoutMethod(method.id),
                ),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  for (final kind in _PayoutKind.values)
                    _methodChip(kind, busy: wallet.checkoutBusy),
                ],
              ),
              if (_kind == _PayoutKind.card)
                const Text(
                  'Payouts go to the bank account linked to this card.',
                  style: TextStyle(color: RideTokens.muted, fontSize: 13),
                ),
              _field(
                'Account holder name',
                _name,
                RegExp(r'^.{3,50}$'),
                'Enter the account holder name.',
                maxLength: 50,
              ),
              if (_kind == _PayoutKind.upi)
                _field(
                  'UPI ID',
                  _vpa,
                  RegExp(r'^[a-z0-9.-]+@[a-z0-9.-]+$', caseSensitive: false),
                  'Enter a valid UPI ID.',
                  maxLength: 100,
                  keyboard: TextInputType.emailAddress,
                )
              else ...[
                _field(
                  'Account number',
                  _account,
                  RegExp(r'^[a-zA-Z0-9]{5,35}$'),
                  'Enter a valid account number.',
                  maxLength: 35,
                ),
                _field(
                  'IFSC',
                  _ifsc,
                  RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$', caseSensitive: false),
                  'Enter a valid IFSC.',
                  maxLength: 11,
                ),
                if (_kind == _PayoutKind.card)
                  _field(
                    'Last 4 digits of debit card',
                    _lastFour,
                    RegExp(r'^\d{4}$'),
                    'Enter the last four digits.',
                    maxLength: 4,
                    keyboard: TextInputType.number,
                    digitsOnly: true,
                  ),
              ],
              SolidButton(
                text: 'Save payout account',
                busy: wallet.checkoutBusy,
                onPressed: wallet.checkoutBusy ? null : _submit,
              ),
            ],
          ),
        ),
      );
    },
  );
}

import 'package:user/features/driver_account/controllers/payout_change_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_account/driver_account.repo.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';

class PayoutChangeForm extends StatefulWidget {
  final DriverAccountRepository repository;
  const PayoutChangeForm({super.key, required this.repository});
  @override
  State<PayoutChangeForm> createState() => _PayoutFormState();
}

class _PayoutFormState extends State<PayoutChangeForm> {
  late final _controller = PayoutChangeController()
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  final _form = GlobalKey<FormState>();
  final _holder = TextEditingController(),
      _upi = TextEditingController(),
      _bank = TextEditingController(),
      _ifsc = TextEditingController();
  String get _key => _controller.key;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool get _attempted => _controller.attempted;
  set _attempted(bool value) => _controller.attempted = value;
  String? get _error => _controller.error;
  set _error(String? value) => _controller.error = value;
  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    for (final c in [_holder, _upi, _bank, _ifsc]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    if (_upi.text.trim().isEmpty && _bank.text.isEmpty) {
      setState(() => _error = 'Provide UPI or a complete bank account.');
      return;
    }
    setState(() {
      _busy = true;
      _attempted = true;
      _error = null;
    });
    try {
      await widget.repository.requestPayout(_key, {
        'holder_name': _holder.text.trim(),
        if (_upi.text.trim().isNotEmpty) 'upi': _upi.text.trim(),
        if (_bank.text.isNotEmpty) 'account_number': _bank.text,
        if (_ifsc.text.trim().isNotEmpty)
          'ifsc': _ifsc.text.trim().toUpperCase(),
      });
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _well(Widget child) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: LiquidGlassSurface(
      radius: 20,
      padding: EdgeInsets.zero,
      child: child,
    ),
  );

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: SingleChildScrollView(
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const DriverPageIntro(
              icon: Icons.account_balance_outlined,
              title: 'New payment destination',
              description:
                  'Your approved destination stays active until this change is reviewed. Provide UPI, bank details, or both.',
            ),
            const SizedBox(height: 20),
            _well(
              TextFormField(
                controller: _holder,
                enabled: !_attempted,
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'Account holder'),
                validator: (v) => (v ?? '').trim().length < 2
                    ? 'Enter the account holder'
                    : null,
              ),
            ),
            _well(
              TextFormField(
                controller: _upi,
                enabled: !_attempted,
                maxLength: 320,
                decoration: const InputDecoration(
                  labelText: 'UPI ID (optional)',
                ),
                validator: (v) =>
                    v == null ||
                        v.trim().isEmpty ||
                        RegExp(
                          r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,62}[a-zA-Z0-9])$',
                        ).hasMatch(v.trim())
                    ? null
                    : 'Enter a valid UPI ID',
              ),
            ),
            _well(
              TextFormField(
                controller: _bank,
                enabled: !_attempted,
                maxLength: 18,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                obscureText: true,
                decoration: const InputDecoration(
                  labelText: 'Bank account number (optional)',
                ),
                validator: (v) => (v ?? '').isEmpty && _ifsc.text.trim().isEmpty
                    ? null
                    : RegExp(r'^\d{9,18}$').hasMatch(v ?? '')
                    ? null
                    : 'Enter 9 to 18 digits',
              ),
            ),
            _well(
              TextFormField(
                controller: _ifsc,
                enabled: !_attempted,
                maxLength: 11,
                textCapitalization: TextCapitalization.characters,
                onChanged: (v) {
                  final upper = v.toUpperCase();
                  if (upper != v) {
                    _ifsc.value = _ifsc.value.copyWith(text: upper);
                  }
                },
                decoration: const InputDecoration(
                  labelText: 'IFSC (required with bank)',
                ),
                validator: (v) => (v ?? '').trim().isEmpty && _bank.text.isEmpty
                    ? null
                    : RegExp(
                        r'^[A-Z]{4}0[A-Z0-9]{6}$',
                      ).hasMatch((v ?? '').trim())
                    ? null
                    : 'Enter a valid IFSC code',
              ),
            ),
            if (_attempted)
              const Padding(
                padding: EdgeInsets.only(bottom: 12),
                child: DriverNotice(
                  icon: Icons.lock_clock_outlined,
                  message:
                      'Retry preserves these exact details and request key. Close this page to start a different request.',
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: DriverNotice(
                  icon: Icons.error_outline_rounded,
                  message: _error!,
                  error: true,
                ),
              ),
            LiquidGlassButton(
              onPressed: _busy ? null : _submit,
              busy: _busy,
              text: _attempted ? 'Retry same request' : 'Submit for review',
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    ),
  );
}

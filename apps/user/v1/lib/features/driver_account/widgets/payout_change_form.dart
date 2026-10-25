import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_account/driver_account.repo.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

class PayoutChangeForm extends StatefulWidget {
  final DriverAccountRepository repository;
  const PayoutChangeForm({super.key, required this.repository});
  @override
  State<PayoutChangeForm> createState() => _PayoutFormState();
}

class _PayoutFormState extends State<PayoutChangeForm> {
  final _form = GlobalKey<FormState>();
  final _holder = TextEditingController(),
      _upi = TextEditingController(),
      _bank = TextEditingController(),
      _ifsc = TextEditingController();
  final _key = VehicleVerificationRepository.registrationKey();
  bool _busy = false, _attempted = false;
  String? _error;
  @override
  void dispose() {
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

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: SingleChildScrollView(
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Your current approved destination stays active until this change is approved. Provide UPI, bank details, or both. Keep account numbers as digits including leading zeroes.',
            ),
            TextFormField(
              controller: _holder,
              enabled: !_attempted,
              maxLength: 120,
              decoration: const InputDecoration(labelText: 'Account holder'),
              validator: (v) => (v ?? '').trim().length < 2
                  ? 'Enter the account holder'
                  : null,
            ),
            TextFormField(
              controller: _upi,
              enabled: !_attempted,
              maxLength: 320,
              decoration: const InputDecoration(labelText: 'UPI ID (optional)'),
              validator: (v) =>
                  v == null ||
                      v.trim().isEmpty ||
                      RegExp(
                        r'^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,62}[a-zA-Z0-9])$',
                      ).hasMatch(v.trim())
                  ? null
                  : 'Enter a valid UPI ID',
            ),
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
            TextFormField(
              controller: _ifsc,
              enabled: !_attempted,
              maxLength: 11,
              textCapitalization: TextCapitalization.characters,
              onChanged: (v) {
                final upper = v.toUpperCase();
                if (upper != v) _ifsc.value = _ifsc.value.copyWith(text: upper);
              },
              decoration: const InputDecoration(
                labelText: 'IFSC (required with bank)',
              ),
              validator: (v) => (v ?? '').trim().isEmpty && _bank.text.isEmpty
                  ? null
                  : RegExp(r'^[A-Z]{4}0[A-Z0-9]{6}$').hasMatch((v ?? '').trim())
                  ? null
                  : 'Enter a valid IFSC code',
            ),
            if (_attempted)
              const Text(
                'Retry preserves the same details and request key. Close and start a new request to change the entered values.',
              ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: Text(
                _busy
                    ? 'Submitting...'
                    : _attempted
                    ? 'Retry same request'
                    : 'Submit for review',
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

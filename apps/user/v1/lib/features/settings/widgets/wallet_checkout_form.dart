import 'dart:async';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney;
import '../controllers/wallet_controller.dart';

class StandaloneWalletCheckoutForm extends StatefulWidget {
  const StandaloneWalletCheckoutForm({super.key});

  @override
  State<StandaloneWalletCheckoutForm> createState() =>
      _StandaloneWalletCheckoutFormState();
}

class _StandaloneWalletCheckoutFormState
    extends State<StandaloneWalletCheckoutForm> {
  final _wallet = WalletController(driver: false);

  @override
  void initState() {
    super.initState();
    unawaited(_wallet.loadTopUps());
  }

  @override
  void dispose() {
    _wallet.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => WalletCheckoutForm(wallet: _wallet);
}

class WalletCheckoutForm extends StatefulWidget {
  const WalletCheckoutForm({super.key, required this.wallet});
  final WalletController wallet;

  @override
  State<WalletCheckoutForm> createState() => _WalletCheckoutFormState();
}

class _WalletCheckoutFormState extends State<WalletCheckoutForm> {
  final _amount = TextEditingController();
  String? _error;
  String? _creatingId;

  @override
  void dispose() {
    _amount.dispose();
    super.dispose();
  }

  Future<void> _open(WalletTopUp? topUp) async {
    final url = topUp?.checkout;
    if (url == null ||
        url.scheme != 'https' ||
        !const {
          'rzp.io',
          'razorpay.com',
          'pay.razorpay.com',
        }.contains(url.host)) {
      if (mounted && topUp?.pending == true) {
        setState(
          () => _error = 'Checkout is being prepared. Check its status again.',
        );
      }
      return;
    }
    try {
      if (await launchUrl(url, mode: LaunchMode.externalApplication)) return;
    } catch (_) {}
    if (mounted) {
      setState(
        () =>
            _error = 'Could not open checkout. You can retry from this screen.',
      );
    }
  }

  Future<void> _submit() async {
    final value = _amount.text.trim();
    if (!RegExp(r'^\d{1,5}(\.\d{1,2})?$').hasMatch(value)) {
      setState(() => _error = 'Enter an amount with up to two decimal places.');
      return;
    }
    final parts = value.split('.');
    final paise =
        int.parse(parts.first) * 100 +
        (parts.length == 2 ? int.parse(parts.last.padRight(2, '0')) : 0);
    if (paise < 100 || paise > 1000000) {
      setState(() => _error = 'Enter an amount between ₹1 and ₹10,000.');
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _error = null);
    final topUp = await widget.wallet.startTopUp(paise);
    if (!mounted) return;
    setState(() => _creatingId = topUp?.id);
    await _open(topUp);
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.wallet,
    builder: (context, _) {
      final wallet = widget.wallet;
      final pending = wallet.topUps.where((row) => row.pending).firstOrNull;
      final resolved = wallet.topUps
          .where((row) => row.id == _creatingId)
          .firstOrNull;
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_error ?? wallet.checkoutError case final message?) ...[
            Text(message, style: const TextStyle(color: Colors.red)),
            const SizedBox(height: 12),
          ],
          if (pending != null) ...[
            Text('${rideMoney(pending.paise / 100)} · ${pending.label}'),
            const SizedBox(height: 12),
            if (pending.checkout?.hasAuthority == true)
              SolidButton(
                text: 'Open Razorpay checkout',
                onPressed: wallet.checkoutBusy ? null : () => _open(pending),
              ),
            TextButton(
              onPressed: wallet.checkoutBusy
                  ? null
                  : () async {
                      setState(() {
                        _creatingId = pending.id;
                        _error = null;
                      });
                      await wallet.checkTopUp(pending.id);
                    },
              child: const Text('Check payment status'),
            ),
          ] else if (resolved != null) ...[
            Text('${rideMoney(resolved.paise / 100)} · ${resolved.label}'),
            const SizedBox(height: 12),
          ],
          if (pending == null && wallet.topUpsEnabled) ...[
            SolidTextFormField(
              controller: _amount,
              label: 'Amount (₹)',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              enabled: !wallet.checkoutBusy,
            ),
            const SizedBox(height: 12),
            SolidButton(
              text: 'Continue to Razorpay',
              busy: wallet.checkoutBusy,
              onPressed: wallet.checkoutBusy ? null : _submit,
            ),
          ] else if (pending == null && !wallet.checkoutBusy) ...[
            const Text('Wallet top-ups are unavailable.'),
            TextButton(
              onPressed: wallet.loadTopUps,
              child: const Text('Check again'),
            ),
          ],
          if (wallet.checkoutBusy && pending != null)
            const LinearProgressIndicator(minHeight: 2),
        ],
      );
    },
  );
}

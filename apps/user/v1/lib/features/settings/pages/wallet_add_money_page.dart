import 'package:user/components/ui/app_error_snackbar.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import '../controllers/wallet_controller.dart';
import '../widgets/wallet_feedback.dart';
import '../widgets/wallet_payment_progress.dart';

Future<void> showWalletAddMoney(
  BuildContext context, {
  WalletController? wallet,
}) => Navigator.of(context).push<void>(
  MaterialPageRoute<void>(builder: (_) => WalletAddMoneyPage(wallet: wallet)),
);

class WalletAddMoneyPage extends StatefulWidget {
  const WalletAddMoneyPage({super.key, this.wallet});
  final WalletController? wallet;

  @override
  State<WalletAddMoneyPage> createState() => _WalletAddMoneyState();
}

class _WalletAddMoneyState extends State<WalletAddMoneyPage> {
  static final _amountPattern = RegExp(r'^\d{0,5}(\.\d{0,2})?$');
  static const _presets = [100, 200, 500, 1000];
  late final _wallet = widget.wallet ?? WalletController(driver: false);
  String _amount = '';
  int? _preset;
  String? _error;
  bool _showingProgress = false;

  @override
  void initState() {
    super.initState();
    unawaited(_wallet.loadTopUps());
  }

  @override
  void dispose() {
    if (widget.wallet == null) _wallet.dispose();
    super.dispose();
  }

  Future<void> _showProgress({WalletTopUp? topUp, int? amountPaise}) async {
    if (_showingProgress) return;
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _showingProgress = true;
      _error = null;
    });
    final action = await showWalletPaymentProgress(
      context,
      wallet: _wallet,
      item: topUp == null ? null : WalletHistoryItem(topUp: topUp),
      amountPaise: amountPaise,
      doneLabel: widget.wallet == null ? 'Done' : 'Back to wallet',
    );
    if (!mounted) return;
    setState(() {
      _showingProgress = false;
      if (action == WalletProgressAction.addMore) {
        _amount = '';
        _preset = null;
      }
    });
    if (action == WalletProgressAction.done) Navigator.pop(context);
  }

  Future<void> _submit() async {
    final parts = _amount.split('.');
    final paise =
        (int.tryParse(parts.first) ?? 0) * 100 +
        (parts.length == 2 ? int.parse(parts.last.padRight(2, '0')) : 0);
    if (paise < 100 || paise > 1000000) {
      setState(() => _error = 'Enter an amount between ?1 and ?10,000.');
      return;
    }
    await _showProgress(amountPaise: paise);
  }

  void _press(String key) {
    final next = switch (key) {
      'delete' =>
        _amount.isEmpty ? '' : _amount.substring(0, _amount.length - 1),
      '.' => _amount.isEmpty ? '0.' : '$_amount.',
      _ => _amount == '0' ? key : '$_amount$key',
    };
    if (!_amountPattern.hasMatch(next)) return;
    setState(() {
      _amount = next;
      _preset = null;
      _error = null;
    });
  }

  Widget _amountEntry(bool busy) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      SolidSurface(
        radius: 16,
        padding: const EdgeInsets.all(20),
        tint: const Color(0xFFF0F2FA),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Amount to add',
              style: TextStyle(color: RideTokens.muted),
            ),
            const SizedBox(height: 12),
            Text(
              _amount.isEmpty ? '₹0' : '₹$_amount',
              style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
      const SizedBox(height: 24),
      const Text('Quick amount', style: TextStyle(fontSize: 16)),
      const SizedBox(height: 10),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final preset in _presets)
            ChoiceChip(
              label: Text('+₹$preset'),
              selected: _preset == preset,
              showCheckmark: false,
              selectedColor: RideTokens.ink,
              backgroundColor: Colors.white,
              labelStyle: TextStyle(
                fontWeight: FontWeight.w500,
                color: _preset == preset ? Colors.white : RideTokens.ink,
              ),
              onSelected: busy
                  ? null
                  : (_) => setState(() {
                      _preset = preset;
                      _amount = '$preset';
                      _error = null;
                    }),
            ),
        ],
      ),
    ],
  );

  Widget _keypad(bool busy) => Container(
    decoration: const BoxDecoration(
      color: Colors.white,
      border: Border(top: BorderSide(color: RideTokens.line)),
    ),
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 6,
      children: [
        if ((double.tryParse(_amount) ?? 0) > 0) ...[
          SolidButton(
            text: 'Continue to Razorpay',
            onPressed: busy ? null : _submit,
          ),
          const SizedBox(height: 10),
        ],
        for (final row in const [
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['.', '0', 'delete'],
        ])
          Row(
            spacing: 6,
            children: [
              for (final key in row)
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      backgroundColor: const Color(0xFFF7F7F8),
                      minimumSize: const Size.fromHeight(48),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                    ),
                    onPressed: busy ? null : () => _press(key),
                    child: key == 'delete'
                        ? const Tooltip(
                            message: 'Delete digit',
                            child: Icon(Icons.backspace_outlined, size: 19),
                          )
                        : Text(key, style: const TextStyle(fontSize: 18)),
                  ),
                ),
            ],
          ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: _wallet,
    builder: (context, _) {
      final wallet = _wallet;
      final pending = wallet.topUps.where((row) => row.pending).firstOrNull;
      final busy = wallet.checkoutBusy || _showingProgress;
      final enterAmount =
          (pending == null || _showingProgress) && wallet.topUpsEnabled;
      final form = Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (pending != null && !_showingProgress) ...[
              SolidButton(
                text: 'View payment progress',
                onPressed: busy ? null : () => _showProgress(topUp: pending),
              ),
            ],
            if (enterAmount) ...[
              _amountEntry(busy),
            ] else if (pending == null && busy) ...[
              const WalletShimmer(height: 96),
              const SizedBox(height: 24),
              const WalletShimmer(width: 156, height: 20),
            ] else if (pending == null) ...[
              const Text('Wallet top-ups are unavailable.'),
              TextButton(
                onPressed: wallet.loadTopUps,
                child: const Text('Check again'),
              ),
            ],
          ],
        ),
      );
      return PopScope(
        canPop: !busy,
        child: AppErrorNotice(
          message: _error ?? (_showingProgress ? null : wallet.checkoutError),
          child: SolidPage(
            title: 'Add money',
            bodyColor: const Color(0xFFF6F7F8),
            onBack: () {
              if (!busy) Navigator.maybePop(context);
            },
            child: LayoutBuilder(
              builder: (context, constraints) {
                if (!enterAmount) return ListView(children: [form]);
                final keypad = _keypad(busy);
                if (constraints.maxHeight < 460 ||
                    MediaQuery.textScalerOf(context).scale(16) > 23) {
                  return ListView(children: [form, keypad]);
                }
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: SingleChildScrollView(child: form)),
                    keypad,
                  ],
                );
              },
            ),
          ),
        ),
      );
    },
  );
}

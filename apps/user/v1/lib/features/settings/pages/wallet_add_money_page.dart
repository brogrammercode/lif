import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney;
import '../controllers/wallet_controller.dart';
import '../widgets/wallet_feedback.dart';

Future<void> showWalletAddMoney(
  BuildContext context, {
  WalletController? wallet,
  String? topUpId,
}) => Navigator.of(context).push<void>(
  MaterialPageRoute<void>(
    builder: (_) => WalletAddMoneyPage(wallet: wallet, topUpId: topUpId),
  ),
);

class WalletAddMoneyPage extends StatefulWidget {
  const WalletAddMoneyPage({super.key, this.wallet, this.topUpId});
  final WalletController? wallet;
  final String? topUpId;

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
  late String? _creatingId = widget.topUpId;
  Razorpay? _checkout;
  WalletTopUp? _activeTopUp;

  bool get _supportsSdk =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  void initState() {
    super.initState();
    unawaited(_wallet.loadTopUps());
  }

  @override
  void dispose() {
    _checkout?.clear();
    if (widget.wallet == null) _wallet.dispose();
    super.dispose();
  }

  Future<void> _open(WalletTopUp? topUp) async {
    if (topUp == null || !topUp.pending || _activeTopUp != null) return;
    if (topUp.checkoutKey case final key?) {
      final orderId = topUp.orderId;
      if (_supportsSdk && orderId != null) {
        await _openSdk(topUp, key, orderId);
        return;
      }
    }
    // Only older top-ups use a hosted link. Keep the payment page within the
    // platform's in-app browser so bank and UPI app redirects can still work.
    final url = topUp.checkout;
    if (url == null ||
        url.scheme != 'https' ||
        !const {
          'rzp.io',
          'razorpay.com',
          'pay.razorpay.com',
        }.contains(url.host)) {
      if (mounted) {
        setState(
          () => _error = 'Checkout is being prepared. Check its status again.',
        );
      }
      return;
    }
    try {
      if (await supportsLaunchMode(LaunchMode.inAppBrowserView) &&
          await launchUrl(url, mode: LaunchMode.inAppBrowserView)) {
        return;
      }
    } catch (_) {}
    if (mounted) {
      setState(
        () =>
            _error = 'Could not open checkout. You can retry from this screen.',
      );
    }
  }

  Future<void> _openSdk(WalletTopUp topUp, String key, String orderId) async {
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() {
      _activeTopUp = topUp;
      _creatingId = topUp.id;
      _error = null;
    });
    final phone = await _wallet.checkoutPhone();
    if (!mounted) return;
    final checkout = _checkout = Razorpay();
    runZonedGuarded(
      () {
        checkout
          ..on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse result) {
            if (result.orderId == null || result.orderId == orderId) {
              unawaited(_returned(topUp));
            }
          })
          ..on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse result) {
            unawaited(
              _returned(
                topUp,
                cancelled: result.code == Razorpay.PAYMENT_CANCELLED,
                error: result.code == Razorpay.PAYMENT_CANCELLED
                    ? null
                    : 'Checkout could not finish. You can check the payment status or retry.',
              ),
            );
          })
          ..on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse _) {
            unawaited(_returned(topUp));
          })
          ..open({
            'key': key,
            'order_id': orderId,
            'amount': topUp.paise,
            'currency': 'INR',
            'name': '1More',
            'description': 'Wallet top-up',
            if (phone != null) 'prefill': {'contact': phone},
          });
      },
      (_, _) {
        unawaited(
          _returned(
            topUp,
            error: 'Could not open Razorpay checkout. Try again.',
          ),
        );
      },
    );
  }

  Future<void> _returned(
    WalletTopUp topUp, {
    String? error,
    bool cancelled = false,
  }) async {
    if (!mounted || !identical(_activeTopUp, topUp) || _checkout == null) {
      return;
    }
    _checkout?.clear();
    _checkout = null;
    final checked = await _wallet.checkTopUp(topUp.id, cancelled: cancelled);
    if (!mounted) return;
    setState(() {
      _activeTopUp = null;
      _error = switch (checked?.status) {
        'CAPTURED' || 'CANCELLED' => null,
        'FAILED' => checked?.failureReason ?? error,
        _ => error,
      };
    });
  }

  Future<void> _submit() async {
    final parts = _amount.split('.');
    final paise =
        (int.tryParse(parts.first) ?? 0) * 100 +
        (parts.length == 2 ? int.parse(parts.last.padRight(2, '0')) : 0);
    if (paise < 100 || paise > 1000000) {
      setState(() => _error = 'Enter an amount between ₹1 and ₹10,000.');
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => _error = null);
    final topUp = await _wallet.startTopUp(paise, nativeCheckout: _supportsSdk);
    if (!mounted) return;
    setState(() => _creatingId = topUp?.id);
    await _open(topUp);
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
            busy: busy,
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
      final resolved = wallet.topUps
          .where((row) => row.id == _creatingId)
          .firstOrNull;
      final busy = wallet.checkoutBusy || _activeTopUp != null;
      final enterAmount = pending == null && wallet.topUpsEnabled;
      final form = Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (pending != null) ...[
              Text('${rideMoney(pending.paise / 100)} · ${pending.label}'),
              const SizedBox(height: 12),
              if (pending.orderId != null ||
                  pending.checkout?.hasAuthority == true)
                SolidButton(
                  text: 'Open Razorpay checkout',
                  onPressed: busy ? null : () => _open(pending),
                ),
              TextButton(
                onPressed: busy
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
              if (!busy)
                TextButton(
                  onPressed: () async {
                    setState(() {
                      _creatingId = pending.id;
                      _error = null;
                    });
                    await wallet.checkTopUp(pending.id, cancelled: true);
                  },
                  child: const Text('Cancel top-up'),
                ),
            ] else if (resolved != null) ...[
              Text('${rideMoney(resolved.paise / 100)} · ${resolved.label}'),
              const SizedBox(height: 12),
            ],
            if (enterAmount) ...[
              if (resolved != null) const SizedBox(height: 16),
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
            if (busy && pending != null) const WalletShimmer(height: 4),
          ],
        ),
      );
      return PopScope(
        canPop: !busy,
        child: WalletErrorNotice(
          message: _error ?? wallet.checkoutError,
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

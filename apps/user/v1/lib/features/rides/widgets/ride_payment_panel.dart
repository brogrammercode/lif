import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/rides/controllers/ride_payment_controller.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:user/features/settings/controllers/wallet_controller.dart';
import 'package:user/features/settings/pages/wallet_add_money_page.dart';
import 'package:user/features/settings/pages/wallet_transaction_flow.dart';
import 'package:user/features/settings/widgets/wallet_payment_progress.dart';
import 'package:user/features/settings/widgets/wallet_sheet.dart';

class RidePaymentPanel extends StatefulWidget {
  const RidePaymentPanel({
    super.key,
    required this.rideId,
    required this.data,
    required this.repository,
    required this.onChanged,
  });

  final String rideId;
  final Map<String, dynamic> data;
  final DriverOperationsRepository repository;
  final Future<void> Function() onChanged;

  @override
  State<RidePaymentPanel> createState() => _RidePaymentPanelState();
}

class _RidePaymentPanelState extends State<RidePaymentPanel> {
  bool _open = false;
  String? _promptedMethod;
  bool get _driver => widget.data['is_driver'] == true;
  Map<String, dynamic> get _payment => rideMap(widget.data['payment']);
  String? get _method => _payment['method'] as String?;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _promptDriver();
  }

  @override
  void didUpdateWidget(covariant RidePaymentPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    _promptDriver();
  }

  void _promptDriver() {
    if (!_driver || _promptedMethod == (_method ?? '') || _open) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted &&
          !_open &&
          ModalRoute.isCurrentOf(context) == true &&
          _promptedMethod != (_method ?? '')) {
        _promptedMethod = _method ?? '';
        unawaited(_show());
      }
    });
  }

  Future<void> _show([String? method]) async {
    if (_open) return;
    _open = true;
    final controller = RidePaymentController(
      repository: widget.repository,
      rideId: widget.rideId,
      driver: _driver,
      data: widget.data,
      selectedMethod: method,
    );
    try {
      await showWalletSheet<void>(
        context,
        title: 'Payment progress',
        dismissible: false,
        header: ListenableBuilder(
          listenable: controller,
          builder: (context, _) => RideArrivalStrip(
            label: 'Payment progress',
            value: controller.status.label,
          ),
        ),
        content: _RidePaymentProgress(
          controller: controller,
          selection: method,
        ),
      );
      if (mounted) await widget.onChanged();
    } finally {
      controller.dispose();
      _open = false;
    }
  }

  Widget _methodTile(
    String label,
    String? detail,
    IconData icon,
    VoidCallback? action,
  ) => SolidSurface(
    padding: EdgeInsets.zero,
    child: ListTile(
      dense: true,
      leading: Icon(icon, size: 21),
      title: Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
      subtitle: detail == null ? null : Text(detail),
      trailing: const Icon(Icons.chevron_right, size: 20),
      enabled: action != null,
      onTap: action,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final options = rideMap(widget.data['payment_options']);
    final balance = int.tryParse('${options['wallet_available_paise']}');
    final providerManaged = _payment['provider_managed'] == true;
    final currencyAmount =
        rideNumber(_payment['amount']) ??
        rideNumber(rideMap(widget.data['trip'])['final_fare']) ??
        0;
    final short = balance != null && balance < (currencyAmount * 100).round();
    final demo = DataSourceScope.of(context)?.isDemo == true;
    final canSelectUpi =
        demo ||
        (!kIsWeb &&
            (defaultTargetPlatform == TargetPlatform.android ||
                defaultTargetPlatform == TargetPlatform.iOS));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      spacing: 10,
      children: [
        if (_driver || providerManaged)
          SolidButton(text: 'View payment progress', onPressed: () => _show())
        else ...[
          const Text(
            'Choose a payment method',
            style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
          ),
          _methodTile(
            'Cash',
            'Pay your driver directly',
            Icons.payments_outlined,
            options['cash'] == true ? () => _show('CASH') : null,
          ),
          _methodTile(
            'UPI',
            'Pay securely with Razorpay',
            Icons.qr_code_2,
            options['razorpay_upi'] == true && canSelectUpi
                ? () => _show('UPI')
                : null,
          ),
          _methodTile(
            'Wallet',
            balance == null ? null : 'Balance ${rideMoney(balance / 100)}',
            Icons.account_balance_wallet_outlined,
            options['wallet'] == true && !short ? () => _show('WALLET') : null,
          ),
          if (!demo && options['wallet'] == true && short)
            TextButton(
              onPressed: () async {
                await showWalletAddMoney(context);
                if (mounted) await widget.onChanged();
              },
              child: const Text('Add money to Wallet'),
            ),
        ],
      ],
    );
  }
}

class _RidePaymentProgress extends StatefulWidget {
  const _RidePaymentProgress({required this.controller, this.selection});
  final RidePaymentController controller;
  final String? selection;

  @override
  State<_RidePaymentProgress> createState() => _RidePaymentProgressState();
}

class _RidePaymentProgressState extends State<_RidePaymentProgress> {
  RidePaymentController get _payment => widget.controller;
  Timer? _poll;
  Razorpay? _checkout;
  Listenable? _source;
  bool get _demo => DataSourceScope.read(context)?.isDemo == true;
  late bool _busy = widget.selection != null;
  bool _checking = false;
  bool _cancelled = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      switch (widget.selection) {
        case 'CASH':
          unawaited(_run(_payment.selectCash));
        case 'WALLET':
          unawaited(_run(_payment.payWallet));
        case 'UPI':
          unawaited(_run(_openCheckout));
        default:
          unawaited(_refresh());
      }
    });
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (ModalRoute.isCurrentOf(context) == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        unawaited(_refresh());
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final changes = DataSourceScope.of(context)?.changes;
    if (_source == changes) return;
    _source?.removeListener(_sourceChanged);
    _source = changes;
    _source?.addListener(_sourceChanged);
  }

  void _sourceChanged() {
    if (ModalRoute.isCurrentOf(context) == true) unawaited(_refresh());
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _cancelled = false;
      _error = null;
    });
    try {
      await action();
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = _checkout != null);
    }
  }

  Future<void> _refresh() async {
    if (_checking || _busy || _payment.resolved) return;
    _checking = true;
    try {
      await _payment.refresh();
      if (mounted) setState(() => _error = null);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      _checking = false;
    }
  }

  Future<void> _openCheckout() async {
    if (_demo) {
      await _payment.openUpi();
      return;
    }
    if (kIsWeb ||
        ![
          TargetPlatform.android,
          TargetPlatform.iOS,
        ].contains(defaultTargetPlatform)) {
      throw StateError('Open Razorpay on the Android or iOS app.');
    }
    final result = await _payment.openUpi();
    if (!mounted || _payment.resolved) return;
    final sdk = rideMap(result['sdk_checkout']);
    final amount = int.tryParse('${result['amount_paise']}');
    if (sdk['key_id'] == null || sdk['order_id'] == null || amount == null) {
      throw StateError(
        'Checkout is still being prepared. Check again shortly.',
      );
    }
    final checkout = _checkout = Razorpay();
    runZonedGuarded(() {
      checkout
        ..on(Razorpay.EVENT_PAYMENT_SUCCESS, (PaymentSuccessResponse _) {
          unawaited(_returned());
        })
        ..on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse response) {
          unawaited(
            _returned(cancelled: response.code == Razorpay.PAYMENT_CANCELLED),
          );
        })
        ..on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse _) {
          unawaited(_returned());
        })
        ..open({
          'key': sdk['key_id'],
          'order_id': sdk['order_id'],
          'amount': amount,
          'currency': 'INR',
          'name': '1More',
          'description': 'Ride fare',
          'config': {
            'display': {
              'blocks': {
                'upi_only': {
                  'name': 'Pay using UPI',
                  'instruments': [
                    {'method': 'upi'},
                  ],
                },
              },
              'sequence': ['block.upi_only'],
              'preferences': {'show_default_blocks': false},
            },
          },
        });
    }, (_, _) => unawaited(_returned(failedToOpen: true)));
  }

  Future<void> _returned({
    bool cancelled = false,
    bool failedToOpen = false,
  }) async {
    if (!mounted || _checkout == null) return;
    _checkout!.clear();
    _checkout = null;
    await _run(_payment.refresh);
    if (!mounted || _payment.resolved) return;
    setState(() {
      _cancelled = cancelled;
      if (failedToOpen) _error = 'Could not open Razorpay. Try again.';
    });
  }

  @override
  void dispose() {
    _source?.removeListener(_sourceChanged);
    _poll?.cancel();
    _checkout?.clear();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: _payment,
    builder: (context, _) {
      final status = _cancelled && !_payment.resolved
          ? WalletHistoryStatus.cancelled
          : _payment.status;
      final label = switch (_payment.method) {
        'CASH' =>
          _payment.driver
              ? 'Confirm cash received'
              : 'Waiting for driver verification',
        'UPI' || 'WALLET' => 'Verifying rider payment',
        _ => 'Waiting for rider to choose a payment method',
      };
      return PopScope(
        canPop: !_busy,
        child: AppErrorNotice(
          message: _error,
          child: WalletPaymentTimeline.ride(
            _payment.amount,
            status: status,
            waitingLabel: label,
            failureReason: _payment.provider['failure_reason'] as String?,
            actions: [
              if (_cancelled && !_payment.resolved)
                const Text(
                  'The fare is still unpaid. Reopen Razorpay to continue.',
                  style: TextStyle(color: RideTokens.muted),
                ),
              if (!_busy && _payment.canConfirmCash)
                RideSwipeButton(
                  enabled: true,
                  label: 'Slide to confirm payment',
                  onSwipe: () => _run(_payment.confirmCash),
                ),
              if (!_demo &&
                  !_busy &&
                  !_payment.resolved &&
                  !_payment.driver &&
                  _payment.razorpay)
                SolidButton(
                  text: 'Open Razorpay checkout',
                  onPressed: () => _run(_openCheckout),
                ),
              if (!_busy && _payment.resolved)
                SolidButton(
                  text: 'Continue to receipt',
                  onPressed: () => Navigator.pop(context),
                ),
              if (!_busy && !_payment.resolved)
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Back to ride'),
                ),
            ],
          ),
        ),
      );
    },
  );
}

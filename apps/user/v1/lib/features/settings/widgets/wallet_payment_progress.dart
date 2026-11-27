import 'package:user/components/ui/app_error_snackbar.dart';
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney;
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import '../controllers/wallet_controller.dart';
import '../pages/wallet_transaction_flow.dart' show WalletHistoryStatusUi;
import 'wallet_sheet.dart';

enum WalletProgressAction { addMore, done }

Future<WalletProgressAction?> showWalletPaymentProgress(
  BuildContext context, {
  required WalletController wallet,
  WalletHistoryItem? item,
  int? amountPaise,
  String doneLabel = 'Back to wallet',
}) async {
  assert((item == null) != (amountPaise == null));
  final attempt = ValueNotifier<WalletHistoryItem?>(item);
  WalletHistoryItem? current() {
    final original = attempt.value;
    if (original == null) return null;
    return wallet.history
            .where(
              (row) => original.topUpReference == null
                  ? row.reference == original.reference
                  : row.topUpReference == original.topUpReference,
            )
            .firstOrNull ??
        original;
  }

  try {
    return await showWalletSheet<WalletProgressAction>(
      context,
      title: 'Payment progress',
      dismissible: false,
      header: ListenableBuilder(
        listenable: Listenable.merge([wallet, attempt]),
        builder: (context, _) => RideArrivalStrip(
          label: 'Payment progress',
          value:
              current()?.status.label ??
              (wallet.checkoutError == null ? 'Preparing' : 'Not started'),
        ),
      ),
      content: _PaymentProgressBody(
        wallet: wallet,
        current: current,
        onUpdate: (topUp) => attempt.value = WalletHistoryItem(topUp: topUp),
        amountPaise: amountPaise,
        doneLabel: doneLabel,
      ),
    );
  } finally {
    attempt.dispose();
  }
}

class _PaymentProgressBody extends StatefulWidget {
  const _PaymentProgressBody({
    required this.wallet,
    required this.current,
    required this.onUpdate,
    required this.amountPaise,
    required this.doneLabel,
  });

  final WalletController wallet;
  final WalletHistoryItem? Function() current;
  final ValueChanged<WalletTopUp> onUpdate;
  final int? amountPaise;
  final String doneLabel;

  @override
  State<_PaymentProgressBody> createState() => _PaymentProgressBodyState();
}

class _PaymentProgressBodyState extends State<_PaymentProgressBody> {
  Timer? _refresh;
  Razorpay? _checkout;
  int _checks = 0;
  late bool _working = widget.amountPaise != null;
  late bool _autoOpen = widget.amountPaise != null;
  String? _checkoutError;

  bool get _supportsSdk =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.android ||
          defaultTargetPlatform == TargetPlatform.iOS);

  @override
  void initState() {
    super.initState();
    if (widget.amountPaise != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_start());
      });
    }
    _refresh = Timer.periodic(const Duration(seconds: 8), (timer) {
      final topUp = widget.current()?.topUp;
      if (topUp != null && !topUp.pending || _checks >= 6) {
        timer.cancel();
        return;
      }
      final lifecycle = WidgetsBinding.instance.lifecycleState;
      if (topUp == null ||
          _working ||
          widget.wallet.checkoutBusy ||
          ModalRoute.isCurrentOf(context) != true ||
          (lifecycle != null && lifecycle != AppLifecycleState.resumed)) {
        return;
      }
      _checks++;
      unawaited(_check(topUp));
    });
  }

  @override
  void dispose() {
    _refresh?.cancel();
    _checkout?.clear();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() {
      _working = true;
      _checkoutError = null;
    });
    final topUp = await widget.wallet.startTopUp(
      widget.amountPaise!,
      nativeCheckout: _supportsSdk,
    );
    if (!mounted) return;
    if (topUp != null) widget.onUpdate(topUp);
    if (topUp != null && topUp.pending && _canOpen(topUp)) {
      await _open(topUp);
    } else {
      setState(() => _working = false);
    }
  }

  Uri? _hostedCheckout(WalletTopUp topUp) {
    final url = topUp.checkout;
    return url != null &&
            url.scheme == 'https' &&
            const {
              'rzp.io',
              'razorpay.com',
              'pay.razorpay.com',
            }.contains(url.host)
        ? url
        : null;
  }

  bool _canOpen(WalletTopUp topUp) =>
      (_supportsSdk && topUp.checkoutKey != null && topUp.orderId != null) ||
      _hostedCheckout(topUp) != null;

  Future<void> _open(WalletTopUp topUp) async {
    setState(() {
      _working = true;
      _autoOpen = false;
      _checkoutError = null;
    });

    if (_supportsSdk && topUp.checkoutKey != null && topUp.orderId != null) {
      final phone = await widget.wallet.checkoutPhone();
      if (!mounted) return;
      final checkout = _checkout = Razorpay();
      final orderId = topUp.orderId;
      runZonedGuarded(
        () {
          checkout
            ..on(Razorpay.EVENT_PAYMENT_SUCCESS, (
              PaymentSuccessResponse result,
            ) {
              if (result.orderId == null || result.orderId == orderId) {
                unawaited(_returned(topUp));
              }
            })
            ..on(Razorpay.EVENT_PAYMENT_ERROR, (PaymentFailureResponse result) {
              final cancelled = result.code == Razorpay.PAYMENT_CANCELLED;
              unawaited(
                _returned(
                  topUp,
                  cancelled: cancelled,
                  error: cancelled
                      ? null
                      : 'Checkout could not finish. Checking your payment status.',
                ),
              );
            })
            ..on(Razorpay.EVENT_EXTERNAL_WALLET, (ExternalWalletResponse _) {
              unawaited(_returned(topUp));
            })
            ..open({
              'key': topUp.checkoutKey,
              'order_id': orderId,
              'amount': topUp.paise,
              'currency': 'INR',
              'name': '1More',
              'description': 'Wallet top-up',
              if (phone != null) 'prefill': {'contact': phone},
            });
        },
        (_, _) => unawaited(
          _returned(
            topUp,
            error: 'Could not open Razorpay checkout. Try again.',
          ),
        ),
      );
      return;
    }

    // Legacy hosted payments still use the platform in-app browser.
    final url = _hostedCheckout(topUp);
    var opened = false;
    try {
      if (url != null &&
          await supportsLaunchMode(LaunchMode.inAppBrowserView)) {
        opened = await launchUrl(url, mode: LaunchMode.inAppBrowserView);
      }
    } catch (_) {}
    if (!mounted) return;
    setState(() {
      _working = false;
      if (!opened) {
        _checkoutError = 'Could not open Razorpay checkout. Try again.';
      }
    });
  }

  Future<void> _returned(
    WalletTopUp topUp, {
    bool cancelled = false,
    String? error,
  }) async {
    if (!mounted || _checkout == null) return;
    _checkout!.clear();
    _checkout = null;
    await _check(topUp, cancelled: cancelled, checkoutError: error);
  }

  Future<void> _check(
    WalletTopUp topUp, {
    bool cancelled = false,
    String? checkoutError,
  }) async {
    setState(() => _working = true);
    final checked = await widget.wallet.checkTopUp(
      topUp.id,
      cancelled: cancelled,
    );
    if (!mounted) return;
    if (checked != null) widget.onUpdate(checked);
    if (_autoOpen &&
        !cancelled &&
        checked != null &&
        checked.pending &&
        _canOpen(checked)) {
      await _open(checked);
      return;
    }
    setState(() {
      _working = false;
      _checkoutError = checked?.pending == false ? null : checkoutError;
    });
  }

  List<Widget> _actions(WalletHistoryItem? item, bool busy) {
    final topUp = item?.topUp;
    final pending = item?.status == WalletHistoryStatus.pending;
    return [
      if (item == null && !busy) SolidButton(text: 'Retry', onPressed: _start),
      if (pending && topUp != null && !_working) ...[
        if (_canOpen(topUp))
          SolidButton(
            text: 'Open Razorpay checkout',
            onPressed: busy ? null : () => _open(topUp),
          ),
        SolidButton(
          text: 'Check payment status',
          onPressed: busy ? null : () => _check(topUp),
        ),
        TextButton(
          onPressed: busy ? null : () => _check(topUp, cancelled: true),
          child: const Text('Cancel top-up'),
        ),
      ],
      if (!busy) ...[
        if (!pending && (topUp != null || widget.amountPaise != null))
          SolidButton(
            text: 'Add more money',
            onPressed: () =>
                Navigator.pop(context, WalletProgressAction.addMore),
          ),
        TextButton(
          onPressed: () => Navigator.pop(context, WalletProgressAction.done),
          child: Text(widget.doneLabel),
        ),
      ],
    ];
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.wallet,
    builder: (context, _) {
      final item = widget.current();
      final busy = _working || widget.wallet.checkoutBusy;
      final actions = _actions(item, busy);
      return PopScope(
        canPop: !busy,
        child: AppErrorNotice(
          message: widget.wallet.checkoutError ?? _checkoutError,
          child: item == null
              ? WalletPaymentTimeline.preparing(
                  widget.amountPaise!,
                  failed: !busy,
                  actions: actions,
                )
              : WalletPaymentTimeline(item, actions: actions),
        ),
      );
    },
  );
}

class WalletPaymentTimeline extends StatelessWidget {
  const WalletPaymentTimeline(this.item, {super.key, this.actions = const []})
    : _amountPaise = null,
      _startFailed = false,
      rideStatus = null,
      waitingLabel = null,
      failureReason = null;

  const WalletPaymentTimeline.preparing(
    int amountPaise, {
    super.key,
    required bool failed,
    required this.actions,
  }) : item = null,
       _amountPaise = amountPaise,
       _startFailed = failed,
       rideStatus = null,
       waitingLabel = null,
       failureReason = null;

  const WalletPaymentTimeline.ride(
    int amountPaise, {
    super.key,
    required WalletHistoryStatus status,
    required this.waitingLabel,
    this.failureReason,
    this.actions = const [],
  }) : item = null,
       _amountPaise = amountPaise,
       _startFailed = false,
       rideStatus = status;

  final WalletHistoryItem? item;
  final int? _amountPaise;
  final bool _startFailed;
  final WalletHistoryStatus? rideStatus;
  final String? waitingLabel;
  final String? failureReason;
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final item = this.item;
    final status =
        rideStatus ??
        item?.status ??
        (_startFailed
            ? WalletHistoryStatus.failed
            : WalletHistoryStatus.pending);
    final pending = status == WalletHistoryStatus.pending;
    final completed = status == WalletHistoryStatus.completed;
    final startedAt = item?.topUp?.createdAt ?? item?.date;
    final finishedAt = pending
        ? null
        : item?.transaction?.completedAt ?? item?.topUp?.updatedAt;
    final completionLabel = pending || completed
        ? 'Payment completed'
        : status.label;
    final title = item == null && rideStatus == null
        ? (_startFailed ? 'Could not start payment' : 'Preparing payment')
        : switch (status) {
            WalletHistoryStatus.pending => waitingLabel ?? 'Processing payment',
            WalletHistoryStatus.completed => 'Payment successful',
            WalletHistoryStatus.failed => 'Payment failed',
            WalletHistoryStatus.cancelled => 'Payment cancelled',
            WalletHistoryStatus.refunded => 'Payment refunded',
            WalletHistoryStatus.review => 'Payment under review',
          };
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 14,
      children: [
        Center(
          child: Column(
            spacing: 8,
            children: [
              _ProgressMark(status: status),
              AnimatedSwitcher(
                duration: MediaQuery.disableAnimationsOf(context)
                    ? Duration.zero
                    : const Duration(milliseconds: 240),
                child: Text(
                  title,
                  key: ValueKey(status),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              Text(
                rideMoney((item?.paise ?? _amountPaise!).abs() / 100),
                style: const TextStyle(fontSize: 18),
              ),
            ],
          ),
        ),
        if ((failureReason ?? item?.failureReason) case final reason?)
          SolidSurface(
            tint: status.fill,
            child: Text(reason, style: TextStyle(color: status.ink)),
          ),
        const Text(
          'Payment timeline',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w500),
        ),
        SolidSurface(
          radius: 14,
          child: Column(
            children: [
              _TimelineRow(
                'Payment initiated',
                date: startedAt,
                status: item == null && rideStatus == null
                    ? status
                    : WalletHistoryStatus.completed,
              ),
              _TimelineRow(
                waitingLabel ?? 'Processing payment',
                status: item == null && rideStatus == null
                    ? null
                    : (pending ? status : WalletHistoryStatus.completed),
              ),
              _TimelineRow(
                completionLabel,
                date: finishedAt,
                status: pending ? null : status,
                last: item?.topUpReference == null || (!pending && !completed),
              ),
              if (item?.topUpReference != null && (pending || completed))
                _TimelineRow(
                  'Wallet credited',
                  date: item?.transaction?.completedAt,
                  status: completed ? status : null,
                  last: true,
                ),
            ],
          ),
        ),
        if (item != null)
          SolidSurface(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              spacing: 4,
              children: [
                const Text(
                  'Reference',
                  style: TextStyle(color: RideTokens.muted, fontSize: 12),
                ),
                SelectableText(item.topUpReference ?? item.reference),
                if (item.transaction?.balanceAfterPaise case final paise?)
                  Text('Wallet balance after · ${rideMoney(paise / 100)}'),
              ],
            ),
          ),
        ...actions,
      ],
    );
  }
}

class _ProgressMark extends StatefulWidget {
  const _ProgressMark({required this.status});
  final WalletHistoryStatus status;

  @override
  State<_ProgressMark> createState() => _ProgressMarkState();
}

class _ProgressMarkState extends State<_ProgressMark>
    with SingleTickerProviderStateMixin {
  late final _turns = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1500),
  );
  bool _reduceMotion = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _reduceMotion = MediaQuery.disableAnimationsOf(context);
    _syncRotation();
  }

  @override
  void didUpdateWidget(covariant _ProgressMark oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncRotation();
  }

  void _syncRotation() {
    if (widget.status != WalletHistoryStatus.pending || _reduceMotion) {
      _turns.stop();
    } else if (!_turns.isAnimating) {
      _turns.repeat();
    }
  }

  @override
  void dispose() {
    _turns.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final status = widget.status;
    final rotating = status == WalletHistoryStatus.pending;
    final color = rotating ? RideTokens.accent : status.ink;
    final ring = CustomPaint(
      painter: _DottedRing(color, rotating: rotating),
      child: const SizedBox.square(dimension: 106),
    );
    return ExcludeSemantics(
      child: AnimatedSwitcher(
        duration: _reduceMotion
            ? Duration.zero
            : const Duration(milliseconds: 280),
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: ScaleTransition(
            scale: Tween<double>(begin: .88, end: 1).animate(animation),
            child: child,
          ),
        ),
        child: Stack(
          key: ValueKey(status),
          alignment: Alignment.center,
          children: [
            if (rotating)
              RotationTransition(turns: _turns, child: ring)
            else
              ring,
            Icon(
              status == WalletHistoryStatus.completed
                  ? Icons.verified_rounded
                  : rotating
                  ? Icons.timelapse_rounded
                  : status.icon,
              color: color,
              size: 46,
            ),
          ],
        ),
      ),
    );
  }
}

class _DottedRing extends CustomPainter {
  const _DottedRing(this.color, {required this.rotating});
  final Color color;
  final bool rotating;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final paint = Paint();
    for (var index = 0; index < 36; index++) {
      final angle = index * 2 * math.pi / 36;
      paint.color = rotating
          ? color.withValues(alpha: .2 + .8 * index / 35)
          : color;
      canvas.drawCircle(
        center + Offset(math.cos(angle), math.sin(angle)) * 50,
        1.7,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DottedRing old) =>
      color != old.color || rotating != old.rotating;
}

class _TimelineRow extends StatelessWidget {
  const _TimelineRow(this.label, {this.date, this.status, this.last = false});
  final String label;
  final DateTime? date;
  final WalletHistoryStatus? status;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final step = status;
    final local = date?.toLocal();
    final locale = MaterialLocalizations.of(context);
    final timestamp = local == null
        ? step?.label ?? 'Pending'
        : '${locale.formatMediumDate(local)} · ${locale.formatTimeOfDay(TimeOfDay.fromDateTime(local), alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context))}';
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 24,
            child: Column(
              children: [
                Icon(
                  step?.icon ?? Icons.radio_button_unchecked,
                  color: step?.ink ?? RideTokens.muted,
                  size: 22,
                ),
                if (!last)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: step == WalletHistoryStatus.completed
                          ? const Color(0xFF87B79A)
                          : RideTokens.line,
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: last ? 0 : 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    timestamp,
                    style: const TextStyle(
                      color: RideTokens.muted,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (local != null)
            Align(
              alignment: Alignment.topRight,
              child: TextButton(
                onPressed: () => showWalletSheet(
                  context,
                  title: label,
                  value: step?.label,
                  content: Text(timestamp),
                ),
                child: const Text('Details'),
              ),
            ),
        ],
      ),
    );
  }
}

import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney;
import 'package:user/features/settings/controllers/settings_controller.dart';
import 'package:user/features/settings/widgets/wallet_identity_card.dart';

class WalletAddMoneyPage extends StatefulWidget {
  final SettingsController controller;
  const WalletAddMoneyPage({super.key, required this.controller});

  @override
  State<WalletAddMoneyPage> createState() => _WalletAddMoneyState();
}

class _WalletAddMoneyState extends State<WalletAddMoneyPage> {
  static final _amountPattern = RegExp(r'^\d{0,5}(\.\d{0,2})?$');
  static const _presets = [100, 200, 500, 1000];
  String _input = '';
  int? _preset;
  bool _submitted = false;
  String _paymentMethod = '1More Wallet';
  int get _paise => ((double.tryParse(_input) ?? 0) * 100).round();

  Future<void> _selectPaymentMethod() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => SolidSheet(
        child: StatefulBuilder(
          builder: (context, setSheetState) => Padding(
            padding: const EdgeInsets.fromLTRB(18, 8, 18, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Padding(
                  padding: EdgeInsets.only(bottom: 14),
                  child: Text(
                    'Payment method',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
                  ),
                ),
                for (final method in const [
                  ('1More Wallet', Icons.account_balance_wallet_outlined),
                  ('UPI', Icons.account_balance_outlined),
                  ('Debit or credit card', Icons.credit_card_outlined),
                ])
                  _PaymentMethodOption(
                    label: method.$1,
                    icon: method.$2,
                    selected: _paymentMethod == method.$1,
                    subtitle: method.$1 == '1More Wallet'
                        ? 'Balance ${rideMoney(widget.controller.summary['wallet'])}'
                        : null,
                    onTap: () {
                      setSheetState(() => _paymentMethod = method.$1);
                      Navigator.pop(sheetContext, method.$1);
                    },
                  ),
                if (_paymentMethod == '1More Wallet') ...[
                  const SizedBox(height: 14),
                  WalletIdentityCard(
                    walletId: widget.controller.walletId,
                    cardholder: widget.controller.walletCardholder,
                    expiry: widget.controller.walletExpiry,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
    if (selected != null && mounted) {
      setState(() => _paymentMethod = selected);
    }
  }

  void _press(String key) {
    final next = key == 'delete'
        ? (_input.isEmpty ? '' : _input.substring(0, _input.length - 1))
        : key == '.'
        ? (_input.isEmpty ? '0.' : '$_input.')
        : _input == '0'
        ? key
        : '$_input$key';
    if (!_amountPattern.hasMatch(next)) return;
    setState(() {
      _input = next;
      _preset = null;
    });
  }

  void _continue() {
    if (_submitted) return;
    final reference = widget.controller.addPreviewMoney(_paise);
    if (reference == null) return;
    _submitted = true;
    Navigator.pushReplacement(
      context,
      MaterialPageRoute<void>(
        builder: (_) => WalletProgressPage(
          controller: widget.controller,
          reference: reference,
        ),
      ),
    );
  }

  Widget _entryForm() => ListenableBuilder(
    listenable: widget.controller,
    builder: (context, _) => Column(
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
                _input.isEmpty ? rideMoney(0) : '₹$_input',
                semanticsLabel:
                    'Amount to add: ${_input.isEmpty ? '0' : _input} rupees',
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: _selectPaymentMethod,
            borderRadius: BorderRadius.circular(16),
            child: SolidSurface(
              radius: 16,
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  Icon(
                    _paymentMethod == '1More Wallet'
                        ? Icons.account_balance_wallet_outlined
                        : _paymentMethod == 'UPI'
                        ? Icons.account_balance_outlined
                        : Icons.credit_card_outlined,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _paymentMethod,
                          style: const TextStyle(fontSize: 16),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _paymentMethod == '1More Wallet'
                              ? 'Balance: ${rideMoney(widget.controller.summary['wallet'])}'
                              : 'Preview payment method',
                          style: const TextStyle(
                            fontSize: 13,
                            color: RideTokens.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.expand_more_rounded,
                    color: RideTokens.muted,
                  ),
                ],
              ),
            ),
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
                onSelected: (_) => setState(() {
                  _preset = preset;
                  _input = '$preset';
                }),
              ),
          ],
        ),
        const SizedBox(height: 12),
        const Text(
          'Preview top-up',
          style: TextStyle(fontSize: 12, color: RideTokens.muted),
        ),
      ],
    ),
  );

  Widget _keypad() => Container(
    decoration: const BoxDecoration(
      color: Colors.white,
      border: Border(top: BorderSide(color: RideTokens.line)),
    ),
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_paise > 0) ...[
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.black,
              foregroundColor: Colors.white,
              minimumSize: const Size.fromHeight(48),
            ),
            onPressed: _submitted ? null : _continue,
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Continue'),
                SizedBox(width: 8),
                Icon(Icons.arrow_forward, size: 18),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],
        for (final (index, row) in const [
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['.', '0', 'delete'],
        ].indexed) ...[
          if (index > 0) const SizedBox(height: 6),
          Row(
            children: [
              for (final (column, key) in row.indexed) ...[
                if (column > 0) const SizedBox(width: 6),
                Expanded(
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      backgroundColor: const Color(0xFFF7F7F8),
                      minimumSize: const Size.fromHeight(48),
                      padding: const EdgeInsets.symmetric(vertical: 8),
                    ),
                    onPressed: () => _press(key),
                    child: key == 'delete'
                        ? const Tooltip(
                            message: 'Delete digit',
                            child: Icon(Icons.backspace_outlined, size: 19),
                          )
                        : Text(
                            key,
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ],
    ),
  );

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'Add money',
    child: LayoutBuilder(
      builder: (context, constraints) {
        const formBackground = Color(0xFFF6F7F8);
        final form = Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 24),
          child: _entryForm(),
        );
        final keypad = _keypad();
        if (constraints.maxHeight < 460 ||
            MediaQuery.textScalerOf(context).scale(16) > 23) {
          return ColoredBox(
            color: formBackground,
            child: CustomScrollView(
              slivers: [
                SliverToBoxAdapter(child: form),
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: Align(
                    alignment: Alignment.bottomCenter,
                    child: keypad,
                  ),
                ),
              ],
            ),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: ColoredBox(
                color: formBackground,
                child: SingleChildScrollView(child: form),
              ),
            ),
            keypad,
          ],
        );
      },
    ),
  );
}

class WalletProgressPage extends StatelessWidget {
  final SettingsController controller;
  final String reference;
  const WalletProgressPage({
    super.key,
    required this.controller,
    required this.reference,
  });

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: controller,
    builder: (context, _) {
      final transaction = controller.walletTransaction(reference);
      if (transaction == null) {
        return const SolidPage(
          title: 'Transaction',
          child: Center(child: Text('Transaction unavailable')),
        );
      }
      final completed = transaction.completedAt;
      final isTopUp = transaction.paise > 0;
      return SolidPage(
        title: completed == null ? 'Processing' : 'Complete',
        bodyColor: Colors.black,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
                child: Column(
                  children: [
                    _ProgressMark(completed: completed != null),
                    const SizedBox(height: 20),
                    AnimatedSwitcher(
                      duration: MediaQuery.disableAnimationsOf(context)
                          ? Duration.zero
                          : const Duration(milliseconds: 240),
                      child: Text(
                        completed == null
                            ? 'Processing preview top-up'
                            : 'Preview top-up complete',
                        key: ValueKey(completed != null),
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 19,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverFillRemaining(
              hasScrollBody: false,
              child: Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                padding: const EdgeInsets.fromLTRB(16, 22, 16, 28),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    WalletTransactionCard(transaction),
                    const SizedBox(height: 26),
                    const Text(
                      'Payment timeline',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 14),
                    SolidSurface(
                      radius: 14,
                      child: Column(
                        children: [
                          _TimelineRow(
                            'Payment initiated',
                            transaction.date,
                            true,
                          ),
                          _TimelineRow(
                            'Processing payment',
                            transaction.date,
                            completed != null,
                            current: completed == null,
                          ),
                          _TimelineRow(
                            'Payment completed',
                            completed,
                            completed != null,
                            last: !isTopUp,
                          ),
                          if (isTopUp) ...[
                            _TimelineRow(
                              'Wallet credited',
                              completed,
                              completed != null,
                              last: true,
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (transaction.balanceAfterPaise case final balance?) ...[
                      const SizedBox(height: 14),
                      Text(
                        'Balance after transaction: ${rideMoney(balance / 100)}',
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    },
  );
}

class _ProgressMark extends StatefulWidget {
  final bool completed;
  const _ProgressMark({required this.completed});

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
    if (widget.completed || _reduceMotion) {
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
    final completed = widget.completed;
    final color = completed ? const Color(0xFF64DA94) : const Color(0xFFB0BBFF);
    final ring = CustomPaint(
      painter: _DottedRing(color, completed: completed),
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
          key: ValueKey(completed),
          alignment: Alignment.center,
          children: [
            if (completed)
              ring
            else
              RotationTransition(turns: _turns, child: ring),
            Icon(
              completed ? Icons.verified_rounded : Icons.timelapse_rounded,
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
  final Color color;
  final bool completed;
  const _DottedRing(this.color, {required this.completed});

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final paint = Paint();
    for (var index = 0; index < 36; index++) {
      final angle = index * 2 * math.pi / 36;
      paint.color = completed
          ? color
          : color.withValues(alpha: .2 + .8 * index / 35);
      canvas.drawCircle(
        center + Offset(math.cos(angle), math.sin(angle)) * 50,
        1.7,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _DottedRing oldDelegate) =>
      color != oldDelegate.color || completed != oldDelegate.completed;
}

class _TimelineRow extends StatelessWidget {
  final String label;
  final DateTime? date;
  final bool done, current, last;
  const _TimelineRow(
    this.label,
    this.date,
    this.done, {
    this.current = false,
    this.last = false,
  });

  @override
  Widget build(BuildContext context) {
    const green = Color(0xFF176443);
    final timestamp = date == null ? 'Pending' : _timestamp(context, date!);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 24,
            child: Column(
              children: [
                Icon(
                  done
                      ? Icons.check_circle_rounded
                      : current
                      ? Icons.timelapse_rounded
                      : Icons.radio_button_unchecked,
                  size: 22,
                  color: done
                      ? green
                      : current
                      ? RideTokens.accent
                      : RideTokens.muted,
                ),
                if (!last)
                  Expanded(
                    child: Container(
                      width: 2,
                      margin: const EdgeInsets.symmetric(vertical: 4),
                      color: done ? const Color(0xFF87B79A) : RideTokens.line,
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
          if (date != null)
            Align(
              alignment: Alignment.topRight,
              child: TextButton(
                style: TextButton.styleFrom(
                  foregroundColor: done ? green : RideTokens.accent,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (dialogContext) => LiquidGlassDialog(
                    title: Text(
                      label,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    content: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              done
                                  ? Icons.check_circle_rounded
                                  : Icons.timelapse_rounded,
                              size: 20,
                              color: done ? green : RideTokens.accent,
                            ),
                            const SizedBox(width: 9),
                            Text(
                              done ? 'Completed' : 'In progress',
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Text(
                          timestamp,
                          style: const TextStyle(
                            color: RideTokens.muted,
                            fontSize: 14,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                    actions: [
                      TextButton(
                        onPressed: () => Navigator.pop(dialogContext),
                        child: const Text('Close'),
                      ),
                    ],
                  ),
                ),
                child: const Text('Details'),
              ),
            ),
        ],
      ),
    );
  }
}

String _timestamp(BuildContext context, DateTime date) {
  final labels = MaterialLocalizations.of(context);
  final local = date.toLocal();
  return '${labels.formatMediumDate(local)} · ${labels.formatTimeOfDay(TimeOfDay.fromDateTime(local), alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context))}';
}

class WalletTransactionCard extends StatelessWidget {
  final WalletTransaction transaction;
  final VoidCallback? onTap;
  const WalletTransactionCard(this.transaction, {super.key, this.onTap});

  @override
  Widget build(BuildContext context) {
    final credit = transaction.paise > 0;
    final color = credit && !transaction.processing
        ? const Color(0xFF176443)
        : RideTokens.ink;
    return Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      shape: const RoundedRectangleBorder(
        side: BorderSide(color: RideTokens.line),
        borderRadius: BorderRadius.all(Radius.circular(14)),
      ),
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
          child: Row(
            children: [
              CircleAvatar(
                radius: 19,
                backgroundColor: const Color(0xFFF5F5F5),
                foregroundColor: RideTokens.ink,
                child: Icon(
                  credit
                      ? Icons.account_balance_wallet_outlined
                      : Icons.receipt_long_outlined,
                  size: 19,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 3,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      transaction.title,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _timestamp(context, transaction.date),
                      style: const TextStyle(
                        fontSize: 12,
                        color: RideTokens.muted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                flex: 2,
                child: Align(
                  alignment: Alignment.centerRight,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${credit ? '+' : '-'}${rideMoney(transaction.paise.abs() / 100)}',
                        textAlign: TextAlign.end,
                        style: TextStyle(
                          color: color,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        transaction.processing
                            ? 'Processing'
                            : credit
                            ? 'Credit'
                            : 'Debit',
                        textAlign: TextAlign.end,
                        style: const TextStyle(
                          fontSize: 12,
                          color: RideTokens.muted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PaymentMethodOption extends StatelessWidget {
  final String label;
  final IconData icon;
  final String? subtitle;
  final bool selected;
  final VoidCallback onTap;

  const _PaymentMethodOption({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Material(
      color: selected ? const Color(0xFFF3F4F6) : Colors.white,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: RideTokens.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 12),
          child: Row(
            children: [
              Icon(icon, size: 20, color: RideTokens.ink),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(fontWeight: FontWeight.w500),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 3),
                      Text(
                        subtitle!,
                        style: const TextStyle(
                          color: RideTokens.muted,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(
                selected
                    ? Icons.radio_button_checked_rounded
                    : Icons.radio_button_unchecked_rounded,
                size: 20,
                color: selected ? RideTokens.accent : RideTokens.muted,
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

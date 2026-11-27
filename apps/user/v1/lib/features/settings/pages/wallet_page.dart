import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney;
import 'package:user/features/rides/widgets/ride_history_layout.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'wallet_transaction_flow.dart';
import 'package:user/features/settings/controllers/settings_controller.dart';
import 'package:user/features/settings/controllers/wallet_controller.dart';
import 'package:user/features/settings/widgets/wallet_identity_card.dart';
import 'wallet_add_money_page.dart';
import 'package:user/features/settings/widgets/wallet_sheet.dart';
import 'package:user/features/settings/widgets/payout_setup_form.dart';
import 'package:user/features/settings/widgets/wallet_feedback.dart';
import 'package:user/features/settings/widgets/wallet_payment_progress.dart';

class WalletPage extends StatefulWidget {
  final SettingsController controller;
  final bool driver;
  const WalletPage({super.key, required this.controller, required this.driver});

  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage> {
  final _history = GlobalKey();
  bool _showPayouts = false;
  late final _wallet = WalletController(
    driver: widget.driver,
    client: widget.controller.repository.walletClient,
  );

  @override
  void initState() {
    super.initState();
    _wallet.refreshHistory();
  }

  @override
  void dispose() {
    _wallet.dispose();
    super.dispose();
  }

  Future<void> _showTransaction(WalletHistoryItem item) async {
    if (item.status == WalletHistoryStatus.pending) {
      final action = await showWalletPaymentProgress(
        context,
        wallet: _wallet,
        item: item,
      );
      if (mounted && action == WalletProgressAction.addMore) {
        await showWalletAddMoney(context, wallet: _wallet);
      }
      return;
    }
    final rideId = item.transaction?.rideId;
    final payoutId = item.transaction?.payoutId;
    Widget? action;
    if (rideId != null) {
      action = Builder(
        builder: (sheetContext) => SolidButton(
          text: 'View ride',
          onPressed: () {
            Navigator.pop(sheetContext);
            showRideHistorySheet(
              context,
              rideId: rideId,
              driverHistory: widget.driver,
            );
          },
        ),
      );
    }

    await _showWalletSheet(
      title: 'Transaction details',
      value: item.status.label,
      content: payoutId == null
          ? WalletTransactionDetails(item, action: action)
          : _PayoutTransactionDetails(
              item: item,
              load: () => _wallet.payoutDetail(payoutId),
            ),
    );
  }

  Future<void> _openPaymentMethods() async {
    await Navigator.pushNamed(context, AppRoutes.paymentMethods);
    if (mounted) await _wallet.refreshHistory();
  }

  void _selectHistory(bool payouts) {
    if (_showPayouts == payouts) {
      _scrollToHistory();
      return;
    }
    setState(() => _showPayouts = payouts);
    if (payouts) _wallet.loadPayouts();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToHistory());
  }

  void _scrollToHistory() {
    final history = _history.currentContext;
    if (!mounted || history == null) return;
    Scrollable.ensureVisible(
      history,
      duration: MediaQuery.disableAnimationsOf(context)
          ? Duration.zero
          : const Duration(milliseconds: 250),
    );
  }

  Widget _driverActions() => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: _WalletAction(
          icon: Icons.account_balance_outlined,
          label: 'Setup payout',
          onPressed: () => _showWalletSheet(
            title: 'Setup payout',
            content: PayoutSetupForm(wallet: _wallet),
          ),
        ),
      ),
      Expanded(
        child: _WalletAction(
          icon: Icons.receipt_long_outlined,
          label: 'Ledger',
          onPressed: () => _selectHistory(false),
        ),
      ),
      Expanded(
        child: _WalletAction(
          icon: Icons.calendar_month_outlined,
          label: 'Payout cycle',
          onPressed: () => _selectHistory(true),
        ),
      ),
    ],
  );

  Widget _payoutSchedule(BuildContext context) {
    final next = _wallet.nextPayoutAt;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SolidSurface(
          radius: 14,
          child: Row(
            children: [
              const Icon(Icons.event_outlined, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  spacing: 6,
                  children: [
                    const Text(
                      'Next scheduled payout',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (_wallet.payoutsLoading && !_wallet.payoutsLoaded)
                      const WalletShimmer(width: 140, height: 16)
                    else
                      Text(
                        !_wallet.payoutsLoaded
                            ? 'Schedule unavailable'
                            : next == null
                            ? 'No payout scheduled'
                            : walletTimestamp(context, next),
                        style: const TextStyle(
                          fontSize: 13,
                          color: RideTokens.muted,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const RideHistoryHeading('Previous payouts'),
        const SizedBox(height: 10),
      ],
    );
  }

  Widget _payoutFooter() {
    if (_wallet.payoutsError != null) {
      return TextButton(
        onPressed: _wallet.loadPayouts,
        child: const Text('Retry'),
      );
    }
    if (_wallet.payoutsLoading) return const WalletShimmer(height: 64);
    if (_wallet.hasMorePayouts) {
      return TextButton(
        onPressed: () => _wallet.loadPayouts(more: true),
        child: const Text('Load more'),
      );
    }
    if (_wallet.payoutsLoaded && _wallet.payouts.isEmpty) {
      return const SolidSurface(child: Text('No payouts credited yet.'));
    }
    return const SizedBox.shrink();
  }

  Future<void> _showWalletSheet({
    required String title,
    required Widget content,
    String? value,
  }) => showWalletSheet(context, title: title, content: content, value: value);

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'My Wallet',
    bodyColor: Colors.black,
    child: ListenableBuilder(
      listenable: _wallet,
      builder: (context, _) {
        final scroll = CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      widget.driver ? 'Available balance' : 'Wallet balance',
                      style: const TextStyle(
                        color: Color(0xFFBBC0CA),
                        fontSize: 14,
                      ),
                    ),
                    const SizedBox(height: 6),
                    if (!_wallet.loaded && _wallet.error == null)
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: WalletShimmer(width: 96, height: 42),
                      )
                    else
                      Text(
                        !_wallet.loaded
                            ? 'Unavailable'
                            : _wallet.availablePaise == 0
                            ? '₹0'
                            : rideMoney(_wallet.availablePaise / 100),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 38,
                          height: 1.1,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    if (widget.driver && _wallet.cashCollectedPaise > 0) ...[
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: _CashSettledChip(_wallet.cashCollectedPaise),
                      ),
                    ],
                    if (widget.driver && _wallet.heldPaise > 0)
                      Text(
                        'Processing payout · ${rideMoney(_wallet.heldPaise / 100)}',
                        style: const TextStyle(
                          color: Color(0xFFBBC0CA),
                          fontSize: 14,
                        ),
                      ),
                    const SizedBox(height: 22),
                    WalletIdentityCard(
                      walletId: _wallet.walletId,
                      loading: !_wallet.loaded && _wallet.error == null,
                      cardholder: widget.controller.walletCardholder,
                      expiry: '',
                    ),
                    const SizedBox(height: 24),
                    if (widget.driver)
                      _driverActions()
                    else
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: _WalletAction(
                              icon: Icons.add,
                              label: 'Add money',
                              onPressed: () =>
                                  showWalletAddMoney(context, wallet: _wallet),
                            ),
                          ),
                          Expanded(
                            child: _WalletAction(
                              icon: Icons.credit_card_outlined,
                              label: 'Payment methods',
                              onPressed: _openPaymentMethods,
                            ),
                          ),
                          Expanded(
                            child: _WalletAction(
                              icon: Icons.history_rounded,
                              label: 'Activity',
                              onPressed: _scrollToHistory,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),

            _transactionHistory(context),
          ],
        );
        return AppErrorNotice(
          message: widget.driver
              ? (_showPayouts ? _wallet.payoutsError : _wallet.error)
              : _wallet.error ?? _wallet.checkoutError,
          child: widget.driver
              ? RefreshIndicator(
                  onRefresh: () => _showPayouts
                      ? _wallet.loadPayouts()
                      : _wallet.refreshHistory(),
                  child: scroll,
                )
              : scroll,
        );
      },
    ),
  );

  Widget _transactionHistory(BuildContext context) {
    return DecoratedSliver(
      decoration: const BoxDecoration(
        color: Color(0xFFF6F7F8),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      sliver: SliverPadding(
        padding: const EdgeInsets.fromLTRB(12, 14, 12, 24),
        sliver: SliverMainAxisGroup(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                key: _history,
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: const RideHistoryHeading('Transaction history'),
              ),
            ),
            if (_showPayouts) ...[
              SliverToBoxAdapter(child: _payoutSchedule(context)),
              _historyCards(_wallet.payouts),
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.only(
                    top: _wallet.payouts.isEmpty ? 0 : 10,
                  ),
                  child: _payoutFooter(),
                ),
              ),
            ] else
              ..._ledgerSlivers(),
            const SliverFillRemaining(
              hasScrollBody: false,
              child: SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _ledgerSlivers() {
    final history = _wallet.history;
    return [
      if ((_wallet.loading && !_wallet.loaded) ||
          (!widget.driver && !_wallet.topUpsLoaded && _wallet.checkoutBusy))
        const SliverToBoxAdapter(child: WalletShimmer(height: 64)),
      if (_wallet.error != null ||
          (!widget.driver &&
              !_wallet.topUpsLoaded &&
              _wallet.checkoutError != null))
        SliverToBoxAdapter(
          child: TextButton(
            onPressed: _wallet.loading || _wallet.checkoutBusy
                ? null
                : _wallet.refreshHistory,
            child: const Text('Retry'),
          ),
        ),
      if (_wallet.loaded &&
          (widget.driver || _wallet.topUpsLoaded) &&
          history.isEmpty)
        const SliverToBoxAdapter(child: _EmptyWalletHistory()),
      _historyCards(history),
      if (_wallet.hasMore)
        SliverToBoxAdapter(
          child: TextButton(
            onPressed: _wallet.loading ? null : () => _wallet.load(more: true),
            child: const Text('Load more'),
          ),
        ),
    ];
  }

  Widget _historyCards(List<WalletHistoryItem> entries) => SliverList.separated(
    itemCount: entries.length,
    itemBuilder: (context, index) {
      final item = entries[index];
      return WalletTransactionCard(
        item,
        key: ValueKey(item.reference),
        onTap: () => _showTransaction(item),
      );
    },
    separatorBuilder: (context, index) => const SizedBox(height: 10),
  );
}

class _PayoutTransactionDetails extends StatefulWidget {
  const _PayoutTransactionDetails({required this.item, required this.load});

  final WalletHistoryItem item;
  final Future<DriverPayoutDetail> Function() load;

  @override
  State<_PayoutTransactionDetails> createState() =>
      _PayoutTransactionDetailsState();
}

class _PayoutTransactionDetailsState extends State<_PayoutTransactionDetails> {
  late Future<DriverPayoutDetail> _details = widget.load();

  @override
  Widget build(BuildContext context) => FutureBuilder<DriverPayoutDetail>(
    future: _details,
    builder: (context, snapshot) {
      final waiting = snapshot.connectionState == ConnectionState.waiting;
      return AppErrorNotice(
        message: waiting || !snapshot.hasError
            ? null
            : 'Could not load payout details.',
        child: WalletTransactionDetails(
          widget.item,
          payout: snapshot.data,
          action: waiting
              ? const WalletShimmer(height: 42)
              : snapshot.hasError
              ? SolidButton(
                  text: 'Retry',
                  onPressed: () {
                    setState(() => _details = widget.load());
                  },
                )
              : null,
        ),
      );
    },
  );
}

class _CashSettledChip extends StatelessWidget {
  const _CashSettledChip(this.paise);

  final int paise;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: const Color(0xFF222222),
      borderRadius: BorderRadius.circular(20),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        spacing: 5,
        children: [
          const Icon(
            Icons.payments_outlined,
            size: 13,
            color: Color(0xFFA6DEB5),
          ),
          Flexible(
            child: Text.rich(
              TextSpan(
                text: rideMoney(paise / 100),
                style: const TextStyle(
                  color: Color(0xFFA6DEB5),
                  fontWeight: FontWeight.w500,
                ),
                children: const [
                  TextSpan(
                    text: ' already settled through cash',
                    style: TextStyle(
                      color: Color(0xFFBBC0CA),
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                ],
              ),
              style: const TextStyle(fontSize: 11, height: 1.3),
            ),
          ),
        ],
      ),
    ),
  );
}

class _EmptyWalletHistory extends StatelessWidget {
  const _EmptyWalletHistory();

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(12, 26, 12, 22),
    child: Column(
      children: [
        ExcludeSemantics(
          child: SizedBox(
            width: 112,
            height: 100,
            child: Stack(
              alignment: Alignment.center,
              children: [
                const DecoratedBox(
                  decoration: BoxDecoration(
                    color: Color(0xFFE8ECFA),
                    shape: BoxShape.circle,
                  ),
                  child: SizedBox.square(dimension: 88),
                ),
                Transform.rotate(
                  angle: -.15,
                  child: const Icon(
                    Icons.account_balance_wallet_outlined,
                    color: RideTokens.accent,
                    size: 54,
                  ),
                ),
                const Positioned(
                  right: 7,
                  bottom: 8,
                  child: CircleAvatar(
                    radius: 17,
                    backgroundColor: Colors.white,
                    child: Icon(
                      Icons.receipt_long_outlined,
                      color: RideTokens.ink,
                      size: 18,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'No transactions yet',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ],
    ),
  );
}

class _WalletAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback? onPressed;

  const _WalletAction({
    required this.icon,
    required this.label,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.transparent,
    child: InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onPressed,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 3, vertical: 4),
        child: Column(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: const Color(0xFF20222A),
              foregroundColor: Colors.white,
              child: Icon(icon, size: 21),
            ),
            const SizedBox(height: 8),
            Text(
              label,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: onPressed == null
                    ? const Color(0xFFBBC0CA)
                    : Colors.white,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

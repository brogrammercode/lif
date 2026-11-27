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
  late final _wallet = WalletController(
    driver: widget.driver,
    client: widget.controller.repository.walletClient,
  );

  @override
  void initState() {
    super.initState();
    _wallet.refreshHistory();
    if (widget.driver) {
      _wallet.loadPayoutMethods();
    }
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
    final payoutDetails = payoutId == null
        ? null
        : _wallet.payoutDetail(payoutId);
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
      content: payoutDetails == null
          ? WalletTransactionDetails(item, action: action)
          : FutureBuilder<DriverPayoutDetail>(
              future: payoutDetails,
              builder: (context, snapshot) => AppErrorNotice(
                message: snapshot.hasError
                    ? 'Could not load payout details. Reopen the transaction to try again.'
                    : null,
                child: WalletTransactionDetails(
                  item,
                  payout: snapshot.data,
                  action: snapshot.connectionState == ConnectionState.waiting
                      ? const WalletShimmer(height: 42)
                      : action,
                ),
              ),
            ),
    );
  }

  Future<void> _openPaymentMethods() async {
    await Navigator.pushNamed(context, AppRoutes.paymentMethods);
    if (mounted) await _wallet.refreshHistory();
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
        final history = _wallet.history;
        return AppErrorNotice(
          message:
              _wallet.error ?? (widget.driver ? null : _wallet.checkoutError),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        widget.driver ? 'Available earnings' : 'Wallet balance',
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
                      if (widget.driver && _wallet.loaded)
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
                        Center(
                          child: _WalletAction(
                            icon: Icons.account_balance_outlined,
                            label: 'Setup payout',
                            onPressed: () => _showWalletSheet(
                              title: 'Setup payout',
                              content: PayoutSetupForm(wallet: _wallet),
                            ),
                          ),
                        )
                      else
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: _WalletAction(
                                icon: Icons.add,
                                label: 'Add money',
                                onPressed: () => showWalletAddMoney(
                                  context,
                                  wallet: _wallet,
                                ),
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
                                onPressed: () {
                                  final history = _history.currentContext;
                                  if (history != null) {
                                    Scrollable.ensureVisible(
                                      history,
                                      alignment: 0,
                                      duration:
                                          MediaQuery.disableAnimationsOf(
                                            context,
                                          )
                                          ? Duration.zero
                                          : const Duration(milliseconds: 250),
                                    );
                                  }
                                },
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              ),

              DecoratedSliver(
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
                          child: const RideHistoryHeading(
                            'Transaction history',
                          ),
                        ),
                      ),
                      if ((_wallet.loading && !_wallet.loaded) ||
                          (!widget.driver &&
                              !_wallet.topUpsLoaded &&
                              _wallet.checkoutBusy))
                        const SliverToBoxAdapter(
                          child: WalletShimmer(height: 64),
                        ),
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
                      SliverList.separated(
                        itemCount: history.length,
                        itemBuilder: (context, index) {
                          final item = history[index];
                          return WalletTransactionCard(
                            item,
                            key: ValueKey(item.reference),
                            onTap: () => _showTransaction(item),
                          );
                        },
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 10),
                      ),
                      if (_wallet.hasMore)
                        SliverToBoxAdapter(
                          child: TextButton(
                            onPressed: _wallet.loading
                                ? null
                                : () => _wallet.load(more: true),
                            child: const Text('Load more'),
                          ),
                        ),
                      const SliverFillRemaining(
                        hasScrollBody: false,
                        child: SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
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

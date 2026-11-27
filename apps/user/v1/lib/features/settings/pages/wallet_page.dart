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
import 'package:user/features/settings/widgets/wallet_checkout_form.dart';
import 'package:user/features/settings/widgets/wallet_sheet.dart';
import 'package:user/features/settings/widgets/payout_setup_form.dart';

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
    _wallet.load();
    if (widget.driver) {
      _wallet.loadPayoutMethods();
    } else {
      _wallet.loadTopUps();
    }
  }

  @override
  void dispose() {
    _wallet.dispose();
    super.dispose();
  }

  Future<void> _showTransaction(WalletTransaction transaction) async {
    if (transaction.payoutId case final id?) {
      await _showWalletSheet(
        title: 'Payout details',
        content: FutureBuilder<DriverPayoutDetail>(
          future: _wallet.payoutDetail(id),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return const Text(
                'Could not load this payout. Reopen it to try again.',
              );
            }
            final detail = snapshot.data;
            if (detail == null) {
              return const Center(child: CircularProgressIndicator.adaptive());
            }
            return Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Text('Payout amount · ${rideMoney(detail.amountPaise / 100)}'),
                Text('Status · ${detail.status}'),
                if (detail.grossPaise case final gross?)
                  Text('Gross fares · ${rideMoney(gross / 100)}'),
                if (detail.commissionPaise case final commission?)
                  Text('Commission · −${rideMoney(commission / 100)}'),
                if (detail.netPaise case final net?)
                  Text('Net ride earnings · ${rideMoney(net / 100)}'),
                if (detail.adjustmentsPaise != 0)
                  Text(
                    'Adjustments · ${rideMoney(detail.adjustmentsPaise / 100)}',
                  ),
                if (detail.maskedDestination case final label?)
                  Text('Destination · $label'),
                if (detail.utr case final utr?) SelectableText('UTR · $utr'),
              ],
            );
          },
        ),
      );
      return;
    }
    final rideId = transaction.rideId;
    final gross = transaction.grossPaise;
    final commission = transaction.commissionPaise;
    if (gross != null && commission != null) {
      await _showWalletSheet(
        title: 'Ride earnings',
        value: rideMoney(transaction.paise / 100),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Gross fare · ${rideMoney(gross / 100)}'),
            const SizedBox(height: 8),
            Text(
              'Commission (${transaction.commissionPercent ?? '0'}%) · −${rideMoney(commission / 100)}',
            ),
            const SizedBox(height: 8),
            Text('Net earnings · ${rideMoney(transaction.paise / 100)}'),
            if (rideId != null) ...[
              const SizedBox(height: 16),
              SolidButton(
                text: 'View ride',
                onPressed: () {
                  Navigator.pop(context);
                  showRideHistorySheet(
                    context,
                    rideId: rideId,
                    driverHistory: true,
                  );
                },
              ),
            ],
          ],
        ),
      );
      return;
    }
    if (rideId != null) {
      await showRideHistorySheet(
        context,
        rideId: rideId,
        driverHistory: widget.driver,
      );
      return;
    }
    await _showWalletSheet(
      title: transaction.title,
      value: rideMoney(transaction.paise / 100),
      content: SelectableText('Reference: ${transaction.reference}'),
    );
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
      builder: (context, _) => CustomScrollView(
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
                  Text(
                    _wallet.availablePaise == 0
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
                  if (_wallet.walletId case final id?) ...[
                    const SizedBox(height: 22),
                    WalletIdentityCard(
                      walletId: id.length > 12
                          ? id.substring(id.length - 12)
                          : id,
                      cardholder: widget.controller.walletCardholder,
                      expiry: '',
                    ),
                  ],
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
                            onPressed: () => _showWalletSheet(
                              title: 'Add money',
                              content: WalletCheckoutForm(wallet: _wallet),
                            ),
                          ),
                        ),
                        Expanded(
                          child: _WalletAction(
                            icon: Icons.credit_card_outlined,
                            label: 'Payment methods',
                            onPressed: () => Navigator.pushNamed(
                              context,
                              AppRoutes.paymentMethods,
                            ),
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
                                      MediaQuery.disableAnimationsOf(context)
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
          SliverFillRemaining(
            hasScrollBody: false,
            child: Container(
              decoration: const BoxDecoration(
                color: Color(0xFFF6F7F8),
                borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
              ),
              padding: const EdgeInsets.fromLTRB(12, 14, 12, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    key: _history,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: const RideHistoryHeading('Transaction history'),
                  ),
                  if (_wallet.loading && !_wallet.loaded)
                    const Center(child: CircularProgressIndicator.adaptive()),
                  if (_wallet.error case final message?)
                    ListTile(
                      title: Text(message),
                      trailing: TextButton(
                        onPressed: _wallet.loading
                            ? null
                            : () => _wallet.load(),
                        child: const Text('Retry'),
                      ),
                    ),
                  for (final topUp in _wallet.topUps.where(
                    (item) => item.status != 'CAPTURED',
                  ))
                    ListTile(
                      title: Text(topUp.label),
                      subtitle: Text(
                        MaterialLocalizations.of(
                          context,
                        ).formatShortDate(topUp.createdAt.toLocal()),
                      ),
                      trailing: Text(rideMoney(topUp.paise / 100)),
                      onTap: topUp.pending
                          ? () => _showWalletSheet(
                              title: 'Top-up status',
                              content: WalletCheckoutForm(wallet: _wallet),
                            )
                          : null,
                    ),
                  if (_wallet.loaded &&
                      _wallet.transactions.isEmpty &&
                      _wallet.topUps.isEmpty)
                    const _EmptyWalletHistory(),
                  for (final transaction in _wallet.transactions)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: WalletTransactionCard(
                        transaction,
                        onTap: () => _showTransaction(transaction),
                      ),
                    ),
                  if (_wallet.hasMore)
                    TextButton(
                      onPressed: _wallet.loading
                          ? null
                          : () => _wallet.load(more: true),
                      child: const Text('Load more'),
                    ),
                ],
              ),
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

import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney;
import 'package:user/features/rides/widgets/ride_history_layout.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'wallet_transaction_flow.dart';
import 'package:user/features/settings/controllers/settings_controller.dart';
import 'package:user/features/settings/widgets/wallet_identity_card.dart';

class WalletPage extends StatefulWidget {
  final SettingsController controller;
  const WalletPage({super.key, required this.controller});

  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage> {
  final _history = GlobalKey();

  void _addMoney() => Navigator.push(
    context,
    MaterialPageRoute<void>(
      builder: (_) => WalletAddMoneyPage(controller: widget.controller),
    ),
  );

  Future<void> _showTransaction(WalletTransaction transaction) async {
    final rideId = transaction.rideId;
    if (transaction.processing || rideId == null) {
      await Navigator.push(
        context,
        MaterialPageRoute<void>(
          builder: (_) => WalletProgressPage(
            controller: widget.controller,
            reference: transaction.reference,
          ),
        ),
      );
      return;
    }
    final demo = widget.controller.walletRidePreview(transaction);
    try {
      await showRideHistorySheet(
        context,
        rideId: rideId,
        repository: UserAppRepository(client: demo.transport),
        operationsRepository: DriverOperationsRepository(
          client: demo.transport,
        ),
        preview: true,
      );
    } finally {
      demo.dispose();
    }
  }

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'My Wallet',
    bodyColor: Colors.black,
    child: ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) => CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 22),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Wallet balance',
                    style: TextStyle(color: Color(0xFFBBC0CA), fontSize: 14),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    rideMoney(widget.controller.summary['wallet']),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 38,
                      height: 1.1,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 22),
                  WalletIdentityCard(
                    walletId: widget.controller.walletId,
                    cardholder: widget.controller.walletCardholder,
                    expiry: widget.controller.walletExpiry,
                  ),
                  const SizedBox(height: 24),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _WalletAction(
                          icon: Icons.add,
                          label: 'Add money',
                          onPressed: _addMoney,
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
                  if (widget.controller.walletTransactions.isEmpty)
                    const _EmptyWalletHistory(),
                  for (final transaction
                      in widget.controller.walletTransactions)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: WalletTransactionCard(
                        transaction,
                        onTap: () => _showTransaction(transaction),
                      ),
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
  final VoidCallback onPressed;

  const _WalletAction({
    required this.icon,
    required this.label,
    required this.onPressed,
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
              style: const TextStyle(color: Colors.white, fontSize: 12),
            ),
          ],
        ),
      ),
    ),
  );
}

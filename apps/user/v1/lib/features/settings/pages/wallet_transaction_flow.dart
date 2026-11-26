import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney;
import 'package:user/features/settings/controllers/settings_controller.dart';

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
    final credit = transaction.paise > 0 || transaction.grossPaise != null;
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
                            : transaction.grossPaise != null
                            ? 'Net earnings'
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

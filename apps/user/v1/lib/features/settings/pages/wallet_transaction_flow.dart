import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/ride_display.dart' show rideMoney;
import 'package:user/features/settings/controllers/wallet_controller.dart';

String _timestamp(BuildContext context, DateTime date) {
  final labels = MaterialLocalizations.of(context);
  final local = date.toLocal();
  return '${labels.formatMediumDate(local)} · ${labels.formatTimeOfDay(TimeOfDay.fromDateTime(local), alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context))}';
}

extension WalletHistoryStatusUi on WalletHistoryStatus {
  String get label => switch (this) {
    WalletHistoryStatus.completed => 'Successful',
    WalletHistoryStatus.pending => 'Pending',
    WalletHistoryStatus.failed => 'Failed',
    WalletHistoryStatus.cancelled => 'Cancelled',
    WalletHistoryStatus.refunded => 'Refunded',
    WalletHistoryStatus.review => 'Under review',
  };

  Color get ink => switch (this) {
    WalletHistoryStatus.completed => const Color(0xFF176443),
    WalletHistoryStatus.failed => const Color(0xFF9C2825),
    WalletHistoryStatus.pending ||
    WalletHistoryStatus.review => const Color(0xFF744700),
    WalletHistoryStatus.refunded => const Color(0xFF3155A4),
    WalletHistoryStatus.cancelled => const Color(0xFF50555F),
  };

  Color get fill => switch (this) {
    WalletHistoryStatus.completed => const Color(0xFFEAF5EF),
    WalletHistoryStatus.failed => const Color(0xFFFBEDED),
    WalletHistoryStatus.pending ||
    WalletHistoryStatus.review => const Color(0xFFFFF4E1),
    WalletHistoryStatus.refunded => const Color(0xFFEDF2FC),
    WalletHistoryStatus.cancelled => const Color(0xFFF0F1F3),
  };

  IconData get icon => switch (this) {
    WalletHistoryStatus.completed => Icons.check_rounded,
    WalletHistoryStatus.pending => Icons.schedule_outlined,
    WalletHistoryStatus.failed => Icons.error_outline,
    WalletHistoryStatus.cancelled => Icons.close_rounded,
    WalletHistoryStatus.refunded => Icons.replay_rounded,
    WalletHistoryStatus.review => Icons.info_outline,
  };
}

String _amount(WalletHistoryItem item) {
  final sign = !item.balanceChanged || item.paise == 0
      ? ''
      : item.paise < 0
      ? '−'
      : '+';
  return '$sign${rideMoney(item.paise.abs() / 100)}';
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final WalletHistoryStatus status;

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      color: status.fill,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Text(
        status.label,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: status.ink,
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
      ),
    ),
  );
}

class WalletTransactionCard extends StatelessWidget {
  const WalletTransactionCard(this.item, {super.key, required this.onTap});

  final WalletHistoryItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    clipBehavior: Clip.antiAlias,
    shape: const RoundedRectangleBorder(
      side: BorderSide(color: RideTokens.line),
      borderRadius: BorderRadius.all(Radius.circular(14)),
    ),
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
        child: Row(
          children: [
            CircleAvatar(
              radius: 19,
              backgroundColor: item.status.fill,
              foregroundColor: item.status.ink,
              child: Icon(item.status.icon, size: 19),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 3,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                spacing: 4,
                children: [
                  Text(
                    item.title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  Text(
                    _timestamp(context, item.date),
                    style: const TextStyle(
                      fontSize: 12,
                      color: RideTokens.muted,
                    ),
                  ),
                  if (item.failureReason case final reason?)
                    Text(
                      reason,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 12, color: item.status.ink),
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
                  spacing: 5,
                  children: [
                    Text(
                      _amount(item),
                      textAlign: TextAlign.end,
                      style: TextStyle(
                        color: item.balanceChanged && item.paise > 0
                            ? const Color(0xFF176443)
                            : RideTokens.ink,
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    _StatusChip(item.status),
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

class WalletTransactionDetails extends StatelessWidget {
  const WalletTransactionDetails(
    this.item, {
    super.key,
    this.payout,
    this.action,
  });
  final WalletHistoryItem item;
  final DriverPayoutDetail? payout;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final entry = item.transaction;
    final provider = payout;
    final updated = item.topUp?.updatedAt;
    final reference = item.topUpReference ?? item.reference;
    final rows = <(String, String)>[
      ('Date & time', _timestamp(context, item.date)),
      if (updated != null && updated.isAfter(item.date) && entry == null)
        ('Last updated', _timestamp(context, updated)),
      if (entry?.balanceAfterPaise case final balance?)
        ('Wallet balance after', rideMoney(balance / 100)),
      if (provider?.maskedDestination case final destination?)
        ('Destination', destination),
      if (provider?.utr case final utr?) ('UTR', utr),
      if (provider != null) ...[
        ('Payout amount', rideMoney(provider.amountPaise / 100)),
        ('Payout status', provider.status),
        if (provider.adjustmentsPaise != 0)
          ('Adjustments', rideMoney(provider.adjustmentsPaise / 100)),
      ],
      if ((provider?.grossPaise ?? entry?.grossPaise) case final gross?)
        ('Gross fare', rideMoney(gross / 100)),
      if ((provider?.commissionPaise ?? entry?.commissionPaise)
          case final commission?)
        (
          entry?.commissionPercent == null
              ? 'Commission'
              : 'Commission (${entry!.commissionPercent}%)',
          rideMoney(commission / 100),
        ),
      if ((provider?.netPaise ??
              (entry?.grossPaise == null ? null : entry?.paise))
          case final net?)
        ('Net earnings', rideMoney(net / 100)),
      if (entry?.topUpId != null) ('Ledger entry', item.reference),
      if (item.topUp?.orderId case final order?) ('Checkout order', order),
    ];
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 14,
      children: [
        SolidSurface(
          radius: 14,
          child: Column(
            spacing: 8,
            children: [
              CircleAvatar(
                radius: 23,
                backgroundColor: item.status.fill,
                foregroundColor: item.status.ink,
                child: Icon(item.status.icon, size: 24),
              ),
              Text(
                _amount(item),
                style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(item.title, style: const TextStyle(fontSize: 14)),
              _StatusChip(item.status),
            ],
          ),
        ),
        if (item.failureReason case final reason?)
          SolidSurface(
            tint: item.status.fill,
            padding: const EdgeInsets.all(12),
            child: Text(
              reason,
              style: TextStyle(color: item.status.ink, fontSize: 13),
            ),
          ),
        SolidSurface(
          radius: 14,
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 10,
            children: [
              for (final row in rows) _DetailRow(label: row.$1, value: row.$2),
              const Divider(height: 1),
              Row(
                children: [
                  Expanded(
                    child: _DetailRow(label: 'Reference', value: reference),
                  ),
                  IconButton(
                    tooltip: 'Copy reference',
                    onPressed: () =>
                        Clipboard.setData(ClipboardData(text: reference)),
                    icon: const Icon(Icons.copy_outlined, size: 18),
                  ),
                ],
              ),
            ],
          ),
        ),
        ?action,
      ],
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Expanded(
        child: Text(
          label,
          style: const TextStyle(color: RideTokens.muted, fontSize: 13),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        flex: 2,
        child: Text(
          value,
          textAlign: TextAlign.end,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
        ),
      ),
    ],
  );
}

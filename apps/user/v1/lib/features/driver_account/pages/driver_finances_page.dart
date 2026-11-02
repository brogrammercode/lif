import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_account/driver_account.repo.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';
import 'package:user/features/rides/ride_display.dart';

class DriverFinancesPage extends StatefulWidget {
  final DriverAccountRepository? repository;
  const DriverFinancesPage({super.key, this.repository});
  @override
  State<DriverFinancesPage> createState() => _FinanceState();
}

class _FinanceState extends State<DriverFinancesPage>
    with WidgetsBindingObserver {
  late final repo = widget.repository ?? DriverAccountRepository();
  Map<String, dynamic>? _data;
  String? _error, _from, _to;
  String _section = 'trips';
  int _page = 1;
  bool _loading = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState s) {
    if (s == AppLifecycleState.resumed &&
        ModalRoute.of(context)?.isCurrent == true) {
      _load();
    }
  }

  Future<void> _load() async {
    if (_loading || !mounted) return;
    setState(() => _loading = true);
    try {
      final v = await repo.finances(
        from: _from,
        to: _to,
        page: _page,
        section: _section,
      );
      if (mounted) {
        setState(() {
          _data = v;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _range() async {
    final now = DateTime.now();
    final range = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: now,
      initialDateRange: DateTimeRange(
        start: now.subtract(const Duration(days: 29)),
        end: now,
      ),
    );
    if (range == null || !mounted) return;
    if (range.duration.inDays >= 93) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Choose up to 93 days.')));
      return;
    }
    String day(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    setState(() {
      _from = day(range.start);
      _to = day(range.end);
      _page = 1;
      _data = null;
    });
    await _load();
  }

  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: 'Earnings & transactions',
    action: IconButton(
      tooltip: 'Refresh statement',
      onPressed: _loading ? null : _load,
      icon: const Icon(Icons.refresh),
    ),
    child: Column(
      children: [
        Wrap(
          spacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: _loading ? null : _range,
              icon: const Icon(Icons.date_range),
              label: const Text('Date range'),
            ),
            for (final s in ['trips', 'charges'])
              LiquidGlassChip(
                label: s == 'trips' ? 'Trips' : 'Reviewed charges',
                selected: _section == s,
                onPressed: _loading
                    ? null
                    : () {
                        setState(() {
                          _section = s;
                          _page = 1;
                          _data = null;
                        });
                        _load();
                      },
              ),
          ],
        ),
        const SizedBox(height: 14),
        if (_error != null && _data != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: DriverNotice(
              icon: Icons.sync_problem_rounded,
              message: '$_error. Pull to refresh or retry.',
              error: true,
            ),
          ),
        Expanded(
          child: _data == null
              ? (_loading
                    ? const DriverListSkeleton(rows: 5)
                    : AppLoadError(
                        message: _error ?? 'Statement unavailable',
                        onRetry: _load,
                      ))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: 24),
                    children: [
                      DriverPageIntro(
                        icon: Icons.account_balance_wallet_outlined,
                        title: _section == 'trips'
                            ? 'Direct fare collection'
                            : 'Reviewed obligations',
                        description:
                            '${_data!['from']} to ${_data!['to']} · Last checked ${rideTime(_data!['as_of'])}. You receive cash and direct UPI fares yourself; this is not a platform wallet.',
                      ),
                      const SizedBox(height: 12),
                      const DriverNotice(
                        icon: Icons.info_outline_rounded,
                        message:
                            'This statement records direct collections and reviewed charges. There is no withdrawable platform balance.',
                      ),
                      const SizedBox(height: 16),
                      if ((rideNumber(
                                rideMap(_data!['summary'])['unpriced_trips'],
                              ) ??
                              0) >
                          0)
                        DriverNotice(
                          icon: Icons.warning_amber_rounded,
                          message:
                              '${rideMap(_data!['summary'])['unpriced_trips']} completed trips have no recorded final fare. Totals exclude them; contact Support.',
                          warning: true,
                        ),
                      const SizedBox(height: 12),
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'Statement summary',
                              style: TextStyle(
                                color: GlassTokens.ink,
                                fontSize: 17,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 10),
                            for (final e in {
                              'gross_fares': 'Completed fares',
                              'cash_received': 'Cash received',
                              'upi_received': 'Direct UPI received',
                              'collection_pending': 'Fares pending receipt',
                              'receipt_unrecorded': 'Receipt not recorded',
                              'other_received': 'Other confirmed receipt',
                              'waived': 'Fares waived',
                              'provider_resolved': 'Refund/provider managed',
                              'approved_charges_due': 'Approved charges due',
                              'charges_received': 'Reviewed charges received',
                              'charges_under_review': 'Charges awaiting review',
                              'commission': 'Commission',
                              'platform_payout': 'Platform payout',
                            }.entries)
                              DriverInfoRow(
                                label: e.value,
                                value: rideMoney(
                                  rideMap(_data!['summary'])[e.key],
                                ),
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      const AppSectionLabel('Transaction records'),
                      if (rideMaps(_data!['rows']).isEmpty)
                        const AppEmptyState(
                          icon: Icons.receipt_long_outlined,
                          title: 'No transaction records',
                          subtitle: 'No records fall inside this date range.',
                        ),
                      for (final row in rideMaps(_data!['rows']))
                        AppCard(
                          child: ListTile(
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              _section == 'trips'
                                  ? '${row['pickup_address']} to ${row['dropoff_address']}'
                                  : '${row['kind']} - ${row['status']}',
                            ),
                            subtitle: Text(
                              _section == 'trips'
                                  ? '${rideMoney(row['final_fare'])} - ${ridePaymentLabel(rideMap(row['payment'])['status'])}\n${rideTime(row['completed_at'])}'
                                  : '${rideMoney(row['fee_amount'])} - ${row['resolution_note'] ?? row['reason']}',
                            ),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () async {
                              await Navigator.pushNamed(
                                context,
                                AppRoutes.driverRideDetail,
                                arguments: _section == 'trips'
                                    ? row['id']
                                    : row['ride_id'],
                              );
                              if (mounted) _load();
                            },
                          ),
                        ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          TextButton(
                            onPressed: _loading || _page <= 1
                                ? null
                                : () {
                                    setState(() => _page--);
                                    _load();
                                  },
                            child: const Text('Previous'),
                          ),
                          Text('Page ${_data!['page']}'),
                          TextButton(
                            onPressed:
                                _loading ||
                                    _page * 20 >=
                                        (rideNumber(_data!['total']) ?? 0)
                                ? null
                                : () {
                                    setState(() => _page++);
                                    _load();
                                  },
                            child: const Text('Next'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
        ),
      ],
    ),
  );
}

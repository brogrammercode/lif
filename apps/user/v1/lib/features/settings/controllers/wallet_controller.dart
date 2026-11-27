import 'dart:math';

import 'package:user/core/network/api_result.dart';
import 'package:user/core/network/checkout_phone.dart' as checkout;
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/state/feature_controller.dart';
import 'settings_controller.dart';

class WalletController extends FeatureController {
  WalletController({required this.driver, DioClient? client})
    : _client = client ?? DioClient();

  final bool driver;
  final DioClient _client;
  int availablePaise = 0;
  int heldPaise = 0;
  int cashCollectedPaise = 0;
  bool payoutsLoading = false;
  bool payoutsLoaded = false;
  bool hasMorePayouts = false;
  String? payoutsError;
  DateTime? nextPayoutAt;
  List<WalletHistoryItem> payouts = const [];
  int _payoutPage = 0;
  String? walletId;
  String? error;
  bool loading = false;
  bool loaded = false;
  bool hasMore = false;
  int _page = 0;
  List<WalletTransaction> transactions = const [];
  bool topUpsEnabled = false;
  List<DriverPayoutDestination> payoutMethods = const [];
  bool checkoutBusy = false;
  String? checkoutError;
  List<WalletTopUp> topUps = const [];
  bool topUpsLoaded = false;

  Iterable<WalletTopUp> get topUpsWithoutLedgerCredit {
    final credited = transactions.map((row) => row.topUpId).toSet();
    return topUps.where(
      (row) => row.status != 'CAPTURED' || !credited.contains(row.id),
    );
  }

  List<WalletHistoryItem> get history {
    final attempts = {for (final topUp in topUps) topUp.id: topUp};
    return [
      for (final transaction in transactions)
        WalletHistoryItem(
          transaction: transaction,
          topUp: attempts[transaction.topUpId],
        ),
      for (final topUp in topUpsWithoutLedgerCredit)
        WalletHistoryItem(topUp: topUp),
    ]..sort((left, right) {
      final date = right.date.compareTo(left.date);
      return date != 0 ? date : right.reference.compareTo(left.reference);
    });
  }

  Future<void> refreshHistory() async {
    if (driver) {
      await load();
      return;
    }
    await Future.wait([load(), loadTopUps()]);
    if (isDisposed || checkoutError != null) return;
    final pending = topUps.where((row) => row.status == 'PENDING').firstOrNull;
    if (pending != null) await checkTopUp(pending.id);
  }

  String? _requestKey;
  int? _requestedPaise;

  Future<void> loadPayoutMethods() async {
    if (!driver || checkoutBusy) return;
    await _checkout(() async {
      final data = _payload(
        await _client.getData('/driver/wallet/payout-methods'),
      );
      update(() {
        payoutMethods = (data['rows'] as List)
            .cast<Map>()
            .map(DriverPayoutDestination.fromMap)
            .toList();
      });
    });
  }

  Future<bool> setupPayoutMethod(Map<String, String> fields) async {
    if (checkoutBusy || isDisposed) return false;
    await _checkout(() async {
      final data = _payload(
        await _client.postData('/driver/wallet/payout-methods', data: fields),
      );
      _adoptPayoutMethod(data);
    });
    return checkoutError == null;
  }

  Future<void> choosePayoutMethod(String id) async {
    await _checkout(() async {
      final data = _payload(
        await _client.patchData(
          '/driver/wallet/payout-methods/${Uri.encodeComponent(id)}/default',
        ),
      );
      _adoptPayoutMethod(data);
    });
  }

  void _adoptPayoutMethod(Map data) {
    final chosen = DriverPayoutDestination.fromMap(data);
    update(() {
      payoutMethods = [
        chosen,
        for (final method in payoutMethods)
          if (method.id != chosen.id) method.withoutDefault(),
      ];
    });
  }

  Future<void> loadTopUps() async {
    if (driver || checkoutBusy) return;
    await _checkout(() async {
      final data = _payload(await _client.getData('/wallet/topups'));
      update(() {
        topUpsEnabled = data['enabled'] == true;
        topUps = (data['rows'] as List)
            .cast<Map>()
            .where((row) => WalletTopUp.isServerId(row['id']))
            .map(WalletTopUp.fromMap)
            .toList();
        topUpsLoaded = true;
      });
    });
  }

  Future<WalletTopUp?> startTopUp(
    int paise, {
    required bool nativeCheckout,
  }) async {
    if (_requestedPaise != paise || _requestKey == null) {
      final random = Random.secure();
      final bytes = List.generate(16, (_) => random.nextInt(256));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
      _requestKey =
          '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
      _requestedPaise = paise;
    }
    return _requestTopUp(
      '/wallet/topups',
      data: {
        'amount_paise': paise,
        'request_key': _requestKey,
        if (nativeCheckout) 'checkout_kind': 'SDK',
      },
    );
  }

  Future<String?> checkoutPhone() => checkout.checkoutPhone(_client);

  Future<WalletTopUp?> checkTopUp(String id, {bool cancelled = false}) async {
    if (!WalletTopUp.isServerId(id)) {
      await loadTopUps();
      update(() {
        checkoutError ??=
            'This top-up is unavailable. Reopen it from wallet history.';
      });
      return null;
    }
    return _requestTopUp(
      '/wallet/topups/${Uri.encodeComponent(id)}/check',
      data: cancelled ? {'cancelled': true} : null,
    );
  }

  Future<WalletTopUp?> _requestTopUp(String path, {Object? data}) async {
    WalletTopUp? result;
    await _checkout(() async {
      final row = _payload(await _client.postData(path, data: data));
      if (!WalletTopUp.isServerId(row['id'])) {
        throw const FormatException('Invalid wallet top-up reference.');
      }
      final entry = WalletTopUp.fromMap(row);
      update(() {
        result = entry;
        topUps = [entry, ...topUps.where((row) => row.id != entry.id)];
        if (path == '/wallet/topups' || !entry.pending) {
          _requestKey = null;
          _requestedPaise = null;
        }
      });
    });
    if (result?.status == 'CAPTURED') await load();
    if (result == null) {
      final message = checkoutError;
      await loadTopUps();
      update(() => checkoutError = message ?? checkoutError);
    }
    return result;
  }

  Future<void> _checkout(Future<void> Function() action) async {
    if (checkoutBusy || isDisposed) return;
    update(() {
      checkoutBusy = true;
      checkoutError = null;
    });
    try {
      await action();
    } catch (error) {
      update(() => checkoutError = ApiResult.errorMessage(error));
    } finally {
      update(() => checkoutBusy = false);
    }
  }

  static Map _payload(dynamic response) => ApiResult.unwrap(response) as Map;

  Future<void> load({bool more = false}) async {
    if (loading || (more && !hasMore)) return;
    final page = more ? _page + 1 : 1;
    update(() {
      loading = true;
      error = null;
    });
    try {
      final data = Map<String, dynamic>.from(
        ApiResult.unwrap(
              await _client.getData(
                '/wallet',
                queryParameters: {
                  'kind': driver ? 'DRIVER' : 'RIDER',
                  'page': page,
                },
              ),
            )
            as Map,
      );
      final rows = (data['rows'] as List)
          .cast<Map>()
          .map(_transaction)
          .toList();
      update(() {
        walletId = data['id'] as String?;
        availablePaise = driver
            ? int.parse(data['payout_available_paise'] as String)
            : int.parse(data['available_paise'] as String);
        heldPaise = int.parse(data['held_paise'] as String);
        cashCollectedPaise =
            int.tryParse('${data['cash_collected_paise']}') ?? 0;
        hasMore = data['has_more'] == true;
        _page = page;
        transactions = more
            ? [
                ...transactions,
                ...rows.where(
                  (row) => !transactions.any(
                    (existing) => existing.reference == row.reference,
                  ),
                ),
              ]
            : rows;
        loaded = true;
      });
    } catch (exception) {
      update(() => error = ApiResult.errorMessage(exception));
    } finally {
      update(() => loading = false);
    }
  }

  Future<void> loadPayouts({bool more = false}) async {
    if (payoutsLoading || (more && !hasMorePayouts)) return;
    final page = more ? _payoutPage + 1 : 1;
    update(() {
      payoutsLoading = true;
      payoutsError = null;
    });
    try {
      final data = _payload(
        await _client.getData(
          '/driver/wallet/payouts',
          queryParameters: {'page': page},
        ),
      );
      final rows = (data['rows'] as List).cast<Map>().map(
        (row) => WalletHistoryItem(
          transaction: _transaction(row, payoutCredit: true),
        ),
      );
      update(() {
        nextPayoutAt = DateTime.tryParse('${data['next_run_at']}');
        final combined = {
          if (more)
            for (final item in payouts) item.reference: item,
          for (final item in rows) item.reference: item,
        };
        payouts = combined.values.toList();
        hasMorePayouts = data['has_more'] == true;
        _payoutPage = page;
        payoutsLoaded = true;
      });
    } catch (exception) {
      update(() => payoutsError = ApiResult.errorMessage(exception));
    } finally {
      update(() => payoutsLoading = false);
    }
  }

  static WalletTransaction _transaction(
    Map entry, {
    bool payoutCredit = false,
  }) {
    final date = DateTime.parse(entry['created_at'] as String);
    final available = int.parse(entry['available_delta_paise'] as String);
    final held = int.parse(entry['held_delta_paise'] as String);
    return WalletTransaction(
      reference: entry['id'] as String,
      title: switch (entry['kind']) {
        'TOP_UP' => 'Money added',
        'CASH_PAYMENT' => 'Cash payment',
        'RIDE_DEBIT' => 'Ride payment',
        'RIDE_EARNING' => 'Ride earnings',
        'REFUND' => 'Refund',
        'ADJUSTMENT' => 'Adjustment',
        'PAYOUT_HOLD' => 'Reserved for payout',
        'PAYOUT_SETTLED' => 'Payout paid',
        'PAYOUT_RELEASE' => 'Payout funds released',
        _ => 'Wallet activity',
      },
      paise: payoutCredit
          ? held.abs()
          : int.tryParse('${entry['external_amount_paise']}') ??
                (available == 0 ? held : available),
      balanceAfterPaise: int.parse(entry['available_after_paise'] as String),
      grossPaise: int.tryParse('${entry['gross_paise']}'),
      commissionPaise: int.tryParse('${entry['commission_paise']}'),
      commissionPercent: entry['commission_percent'] as String?,
      date: date,
      completedAt: date,
      rideId: entry['ride_id'] as String?,
      payoutId: entry['payout_id'] as String?,
      topUpId: entry['kind'] == 'TOP_UP' ? entry['topup_id'] as String? : null,
      balanceNeutral: entry['kind'] == 'CASH_PAYMENT',
    );
  }

  Future<DriverPayoutDetail> payoutDetail(String id) async =>
      DriverPayoutDetail.fromMap(
        _payload(
          await _client.getData(
            '/driver/wallet/payouts/${Uri.encodeComponent(id)}',
          ),
        ),
      );
}

class DriverPayoutDetail {
  final String status;
  final String? maskedDestination, utr;
  final int amountPaise, adjustmentsPaise;
  final int? grossPaise, commissionPaise, netPaise;

  DriverPayoutDetail.fromMap(Map row)
    : status = (row['status'] as String).toLowerCase().replaceAll('_', ' '),
      maskedDestination = row['masked_destination'] as String?,
      utr = row['utr'] as String?,
      amountPaise = int.parse(row['amount_paise'] as String),
      adjustmentsPaise = int.parse(row['adjustments_paise'] as String),
      grossPaise = int.tryParse(
        '${(row['ride_earnings'] as Map?)?['gross_paise']}',
      ),
      commissionPaise = int.tryParse(
        '${(row['ride_earnings'] as Map?)?['commission_paise']}',
      ),
      netPaise = int.tryParse(
        '${(row['ride_earnings'] as Map?)?['driver_net_paise']}',
      );
}

class WalletTopUp {
  static final _serverId = RegExp(r'^[A-Za-z0-9_-]{1,40}$');

  static bool isServerId(Object? value) =>
      value is String && _serverId.hasMatch(value);

  final String id, status;
  final int paise;
  final Uri? checkout;
  final String? failureReason;
  final String? checkoutKey, orderId;
  final DateTime createdAt;
  final DateTime? updatedAt;

  WalletTopUp.fromMap(Map row)
    : id = row['id'] as String,
      status = row['status'] as String,
      failureReason = row['failure_reason'] as String?,
      paise = int.parse(row['amount_paise'] as String),
      createdAt = DateTime.parse(row['created_at'] as String),
      updatedAt = DateTime.tryParse(row['updated_at'] as String? ?? ''),
      checkoutKey = (row['sdk_checkout'] as Map?)?['key_id'] as String?,
      orderId = (row['sdk_checkout'] as Map?)?['order_id'] as String?,
      checkout = Uri.tryParse(row['checkout_url'] as String? ?? '');

  bool get pending => status == 'CREATING' || status == 'PENDING';
  String get label => switch (status) {
    'CAPTURED' => 'Money added',
    'FAILED' => 'Payment failed',
    'CANCELLED' => 'Top-up cancelled',
    'REFUNDED' => 'Refunded',
    'REVIEW_REQUIRED' => 'Under review',
    _ => 'Payment pending',
  };
}

enum WalletHistoryStatus {
  completed,
  pending,
  failed,
  cancelled,
  refunded,
  review,
}

class WalletHistoryItem {
  const WalletHistoryItem({this.transaction, this.topUp})
    : assert(transaction != null || topUp != null);

  final WalletTransaction? transaction;
  final WalletTopUp? topUp;

  String get reference => transaction?.reference ?? topUp!.id;
  String get title => transaction?.title ?? 'Wallet top-up';
  DateTime get date => transaction?.date ?? topUp!.createdAt;
  int get paise => transaction?.paise ?? topUp!.paise;
  String? get failureReason =>
      transaction == null ? topUp?.failureReason : null;
  String? get topUpReference => transaction?.topUpId ?? topUp?.id;
  bool get balanceChanged => transaction != null
      ? !transaction!.balanceNeutral
      : status == WalletHistoryStatus.completed;

  WalletHistoryStatus get status {
    if (transaction case final entry?) {
      return entry.processing
          ? WalletHistoryStatus.pending
          : WalletHistoryStatus.completed;
    }
    return switch (topUp!.status) {
      'CAPTURED' => WalletHistoryStatus.completed,
      'FAILED' => WalletHistoryStatus.failed,
      'CANCELLED' => WalletHistoryStatus.cancelled,
      'REFUNDED' => WalletHistoryStatus.refunded,
      'REVIEW_REQUIRED' => WalletHistoryStatus.review,
      _ => WalletHistoryStatus.pending,
    };
  }
}

class DriverPayoutDestination {
  final String id, kind, status, label;
  final bool isDefault, selectable;
  const DriverPayoutDestination._(
    this.id,
    this.kind,
    this.status,
    this.label,
    this.isDefault,
    this.selectable,
  );
  DriverPayoutDestination.fromMap(Map row)
    : id = row['id'] as String,
      kind = row['kind'] as String,
      status = row['status'] as String,
      label = row['masked_label'] as String,
      isDefault = row['is_default'] == true,
      selectable = row['selectable'] == true;

  DriverPayoutDestination withoutDefault() =>
      DriverPayoutDestination._(id, kind, status, label, false, selectable);
}

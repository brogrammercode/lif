import 'dart:math';

import 'package:user/core/network/api_result.dart';
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
  String? walletId;
  String? error;
  bool loading = false;
  bool loaded = false;
  bool hasMore = false;
  int _page = 0;
  List<WalletTransaction> transactions = const [];
  bool topUpsEnabled = false;
  bool upiPayoutEnabled = false;
  List<DriverPayoutDestination> payoutMethods = const [];
  bool checkoutBusy = false;
  String? checkoutError;
  List<WalletTopUp> topUps = const [];
  String? _requestKey;
  int? _requestedPaise;

  Future<void> loadPayoutMethods() async {
    if (!driver || checkoutBusy) return;
    await _checkout(() async {
      final data = _payload(
        await _client.getData('/driver/wallet/payout-methods'),
      );
      update(() {
        upiPayoutEnabled = data['upi_enabled'] == true;
        payoutMethods = (data['rows'] as List)
            .cast<Map>()
            .map(DriverPayoutDestination.fromMap)
            .toList();
      });
    });
  }

  Future<void> setupPayoutMethod(String name, String vpa) async {
    await _checkout(() async {
      ApiResult.unwrap(
        await _client.postData(
          '/driver/wallet/payout-methods',
          data: {'name': name, 'vpa': vpa},
        ),
      );
    });
    final message = checkoutError;
    await loadPayoutMethods();
    if (message != null) update(() => checkoutError = message);
  }

  Future<void> checkPayoutMethod(String id) async {
    await _checkout(() async {
      ApiResult.unwrap(
        await _client.postData(
          '/driver/wallet/payout-methods/${Uri.encodeComponent(id)}/check',
        ),
      );
    });
    if (checkoutError == null) await loadPayoutMethods();
  }

  Future<void> loadTopUps() async {
    if (driver || checkoutBusy) return;
    await _checkout(() async {
      final data = _payload(await _client.getData('/wallet/topups'));
      update(() {
        topUpsEnabled = data['enabled'] == true;
        topUps = (data['rows'] as List)
            .cast<Map>()
            .map(WalletTopUp.fromMap)
            .toList();
      });
    });
  }

  Future<WalletTopUp?> startTopUp(int paise) async {
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
      data: {'amount_paise': paise, 'request_key': _requestKey},
    );
  }

  Future<WalletTopUp?> checkTopUp(String id) =>
      _requestTopUp('/wallet/topups/${Uri.encodeComponent(id)}/check');

  Future<WalletTopUp?> _requestTopUp(String path, {Object? data}) async {
    WalletTopUp? result;
    await _checkout(() async {
      final entry = WalletTopUp.fromMap(
        _payload(await _client.postData(path, data: data)),
      );
      update(() {
        result = entry;
        topUps = [entry, ...topUps.where((row) => row.id != entry.id)];
        _requestKey = null;
        _requestedPaise = null;
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
        availablePaise = int.parse(data['available_paise'] as String);
        heldPaise = int.parse(data['held_paise'] as String);
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

  static WalletTransaction _transaction(Map entry) {
    final date = DateTime.parse(entry['created_at'] as String);
    final available = int.parse(entry['available_delta_paise'] as String);
    final held = int.parse(entry['held_delta_paise'] as String);
    return WalletTransaction(
      reference: entry['id'] as String,
      title: switch (entry['kind']) {
        'TOP_UP' => 'Money added',
        'RIDE_DEBIT' => 'Ride payment',
        'RIDE_EARNING' => 'Ride earnings',
        'REFUND' => 'Refund',
        'ADJUSTMENT' => 'Adjustment',
        'PAYOUT_HOLD' => 'Reserved for payout',
        'PAYOUT_SETTLED' => 'Payout paid',
        'PAYOUT_RELEASE' => 'Payout funds released',
        _ => 'Wallet activity',
      },
      paise: available == 0 ? held : available,
      balanceAfterPaise: int.parse(entry['available_after_paise'] as String),
      grossPaise: int.tryParse('${entry['gross_paise']}'),
      commissionPaise: int.tryParse('${entry['commission_paise']}'),
      commissionPercent: entry['commission_percent'] as String?,
      date: date,
      completedAt: date,
      rideId: entry['ride_id'] as String?,
      payoutId: entry['payout_id'] as String?,
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
  final String id, status;
  final int paise;
  final Uri? checkout;
  final DateTime createdAt;

  WalletTopUp.fromMap(Map row)
    : id = row['id'] as String,
      status = row['status'] as String,
      paise = int.parse(row['amount_paise'] as String),
      createdAt = DateTime.parse(row['created_at'] as String),
      checkout = Uri.tryParse(row['checkout_url'] as String? ?? '');

  bool get pending => status == 'CREATING' || status == 'PENDING';
  String get label => switch (status) {
    'CAPTURED' => 'Money added',
    'FAILED' => 'Expired or cancelled',
    'REFUNDED' => 'Refunded',
    'REVIEW_REQUIRED' => 'Under review',
    _ => 'Payment pending',
  };
}

class DriverPayoutDestination {
  final String id, status, label;
  final bool isDefault;
  DriverPayoutDestination.fromMap(Map row)
    : id = row['id'] as String,
      status = row['status'] as String,
      label = row['masked_label'] as String,
      isDefault = row['is_default'] == true;
}

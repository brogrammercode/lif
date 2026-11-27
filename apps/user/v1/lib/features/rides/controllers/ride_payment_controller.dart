import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/settings/controllers/wallet_controller.dart';

class RidePaymentController extends FeatureController {
  RidePaymentController({
    required this.repository,
    required this.rideId,
    required this.driver,
    required this.data,
    String? selectedMethod,
  }) : _requestedMethod = selectedMethod;

  final DriverOperationsRepository repository;
  final String rideId;
  final bool driver;
  final String? _requestedMethod;
  Map<String, dynamic> data;
  Map<String, dynamic> provider = const {};
  int _refreshVersion = 0;

  Map<String, dynamic> get payment => rideMap(data['payment']);
  String? get method => _requestedMethod ?? payment['method'] as String?;
  bool get razorpay =>
      payment['razorpay_checkout'] == true ||
      (!driver && _requestedMethod == 'UPI');
  WalletHistoryStatus get status {
    final tripStatus = payment['status'];
    // A webhook can commit capture between checks while the cached provider
    // response still says pending or failed.
    final latestStatus =
        const {
          'CAPTURED',
          'CANCELLED',
          'REFUNDED',
          'PARTIALLY_REFUNDED',
        }.contains(tripStatus)
        ? tripStatus
        : provider['status'] ?? tripStatus;
    return switch (latestStatus) {
      'CAPTURED' => WalletHistoryStatus.completed,
      'FAILED' => WalletHistoryStatus.failed,
      'CANCELLED' => WalletHistoryStatus.cancelled,
      'REFUNDED' || 'PARTIALLY_REFUNDED' => WalletHistoryStatus.refunded,
      _ => WalletHistoryStatus.pending,
    };
  }

  bool get resolved => [
    WalletHistoryStatus.completed,
    WalletHistoryStatus.cancelled,
    WalletHistoryStatus.refunded,
  ].contains(status);
  bool get canConfirmCash =>
      driver &&
      (method == 'CASH' || method == 'UPI' && !razorpay) &&
      data['direct_collection_allowed'] != false &&
      !resolved;
  int get amount =>
      ((rideNumber(payment['amount']) ??
                  rideNumber(rideMap(data['trip'])['final_fare']) ??
                  0) *
              100)
          .round();

  Future<void> refresh() async {
    final version = ++_refreshVersion;
    final next = await repository.context(rideId);
    if (isDisposed || version != _refreshVersion) return;
    update(() => data = next);
    if (razorpay && payment['razorpay_checkout'] == true && !resolved) {
      final verified = await repository.rideUpi(rideId);
      if (version == _refreshVersion) update(() => provider = verified);
    }
  }

  Future<Map<String, dynamic>> openUpi() async {
    final checkout = await repository.rideUpi(rideId, open: true);
    update(() => provider = checkout);
    return checkout;
  }

  Future<void> selectCash() async {
    final next = await repository.payment(rideId, 'CASH');
    update(() => data = next);
  }

  Future<void> payWallet() async {
    final next = await repository.payment(rideId, 'WALLET');
    update(() => data = next);
    if (resolved) return;
    await repository.payWithWallet(rideId);
    await refresh();
  }

  Future<void> confirmCash() async {
    await repository.collection(rideId, method!, true, null);
    await refresh();
  }
}

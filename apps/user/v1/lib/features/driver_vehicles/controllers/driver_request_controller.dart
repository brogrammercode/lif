import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/rides/ride_display.dart';
import 'dart:async';

class DriverRequestController extends FeatureController {
  final DriverOperationsRepository repository;
  Map<String, dynamic> offer;
  bool busy = false, loading = false;
  bool _responding = false;
  String? error;
  static const requestWindow = Duration(seconds: 30);
  final DateTime receivedAt = DateTime.now();
  bool dismissed = false;
  int get secondsRemaining =>
      (requestWindow.inSeconds -
              DateTime.now().difference(receivedAt).inSeconds)
          .clamp(0, requestWindow.inSeconds);
  double get remainingFraction => secondsRemaining / requestWindow.inSeconds;
  void tick() {
    if (isDisposed || dismissed) return;
    update(() {
      if (secondsRemaining == 0) dismissed = true;
    });
  }

  DriverRequestController(this.repository, this.offer);
  bool get valid =>
      !dismissed &&
      offer['can_accept'] == true &&
      (DateTime.tryParse('${offer['expires_at']}')?.isAfter(DateTime.now()) ??
          false);
  Future<void> refresh() async {
    if (loading || busy || isDisposed) return;
    loading = true;
    try {
      final data = await repository.dashboard();
      final current = rideMaps(
        data['offers'],
      ).where((row) => row['id'] == offer['id']).firstOrNull;
      if (!isDisposed) {
        update(() {
          offer = current ?? {...offer, 'can_accept': false};
          error = null;
        });
      }
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
    } finally {
      loading = false;
    }
  }

  Future<String?> respond(bool accept) async {
    if (busy || _responding || loading || isDisposed) return null;
    _responding = true;
    try {
      await refresh();
      if (error != null || !valid || isDisposed) return null;
      update(() => busy = true);
      if (accept) return await repository.accept('${offer['id']}');
      await repository.reject('${offer['id']}');
      return '';
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
      return null;
    } finally {
      _responding = false;
      if (!isDisposed) update(() => busy = false);
    }
  }
}

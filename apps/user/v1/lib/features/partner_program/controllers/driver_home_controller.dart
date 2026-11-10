import 'package:user/core/network/api_result.dart';
import 'package:user/core/state/feature_controller.dart';
import 'dart:async';

import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverHomeController extends FeatureController {
  final repo = DriverOperationsRepository();
  final tracking = DriverTrackingService.instance;
  Map<String, dynamic>? data;
  final Set<String> presentedOfferIds = {};
  String? error;
  Completer<void>? readDone;
  bool loading = false, busy = false, opening = false, foreground = true;

  Future<void> load() async {
    if (loading || isDisposed) return;
    loading = true;
    final readDone = this.readDone = Completer<void>();
    try {
      final data = await repo.dashboard();
      if (isDisposed) return;
      update(() {
        this.data = data;
        error = null;
      });
      if (data['availability'] == 'AVAILABLE' && data['eligible'] == true) {
        try {
          await tracking.ensureStarted();
        } catch (error) {
          if (!isDisposed) {
            update(() => this.error = ApiResult.errorMessage(error));
          }
        }
      } else if (!['EN_ROUTE', 'ON_TRIP'].contains(data['availability'])) {
        await tracking.stop();
      }
    } catch (error) {
      if (!isDisposed) update(() => this.error = ApiResult.errorMessage(error));
    } finally {
      loading = false;
      readDone.complete();
      this.readDone = null;
    }
  }
}

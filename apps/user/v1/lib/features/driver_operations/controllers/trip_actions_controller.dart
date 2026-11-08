import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class TripActionsController extends FeatureController {
  TripActionsController(this.repo, this.rideId);
  final String rideId;
  final DriverOperationsRepository repo;
  Map<String, dynamic>? data;
  Completer<void>? readDone;
  String? error;
  bool busy = false, reading = false;
  String? method;
  Future<void> load() async {
    if (reading || isDisposed) return;
    reading = true;
    final done = readDone = Completer<void>();
    try {
      final data = await repo.context(rideId);
      if (!isDisposed) {
        update(() {
          this.data = data;
          error = null;
        });
      }
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
    } finally {
      reading = false;
      done.complete();
      readDone = null;
    }
  }
}

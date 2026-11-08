import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverVehiclesController extends FeatureController {
  DriverVehiclesController(this.repo, Map<String, dynamic>? initial) {
    data = initial == null ? repo.mine() : Future.value(initial);
  }
  final VehicleVerificationRepository repo;
  late Future<Map<String, dynamic>> data;
  bool busy = false;
  Future<void> reload() async {
    if (isDisposed) return;
    update(() {
      data = repo.mine();
    });
    try {
      await data;
    } catch (_) {}
  }
}

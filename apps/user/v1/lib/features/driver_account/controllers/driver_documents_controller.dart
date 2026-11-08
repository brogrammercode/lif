import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverDocumentsController extends FeatureController {
  DriverDocumentsController(this.repo);
  final VehicleVerificationRepository repo;
  late Future<Map<String, dynamic>> data = repo.documents();
  bool busy = false;
  Future<void> reload() async {
    if (isDisposed) return;
    update(() {
      data = repo.documents();
    });
    try {
      await data;
    } catch (_) {}
  }
}

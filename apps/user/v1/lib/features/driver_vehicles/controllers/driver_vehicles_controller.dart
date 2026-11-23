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
  String? selectedBrandId;

  void selectBrand(String id) {
    if (selectedBrandId == id) return;
    update(() => selectedBrandId = id);
  }

  void ensureSelectedBrand(List<Map<String, dynamic>> brands) {
    if (brands.isEmpty) {
      selectedBrandId = null;
    } else if (!brands.any((brand) => brand['id'] == selectedBrandId)) {
      selectedBrandId = '${brands.first['id']}';
    }
  }

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

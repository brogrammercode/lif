import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverVehicleGateController extends FeatureController {
  DriverVehicleGateController(this.repository, this.loadUser);
  final VehicleVerificationRepository repository;
  final Future<UserModel> Function() loadUser;
  Map<String, dynamic>? registration;
  bool homeAllowed = false;
  bool checking = false;
  late Future<bool> ready = check();
  Future<bool> check() async {
    checking = true;
    homeAllowed = false;
    try {
      final user = await loadUser();
      if (isDisposed) return false;
      if (user.partnerStatus == 'EXITED') return homeAllowed = true;
      final data = await repository.mine();
      if (isDisposed) return false;
      registration = data;
      return homeAllowed = vehicleMaps(
        data['vehicles'],
      ).any((v) => v['is_eligible'] == true);
    } finally {
      checking = false;
    }
  }
}

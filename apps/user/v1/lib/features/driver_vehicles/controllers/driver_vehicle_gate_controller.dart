import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

enum DriverVehicleAccess { home, registration, rider }

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverVehicleGateController extends FeatureController {
  DriverVehicleGateController(this.repository, this.loadUser);
  final VehicleVerificationRepository repository;
  final Future<UserModel> Function() loadUser;
  Map<String, dynamic>? registration;
  UserModel? exitedUser;
  bool homeAllowed = false;
  bool checking = false;
  late Future<DriverVehicleAccess> ready = check();
  Future<DriverVehicleAccess> check() async {
    checking = true;
    homeAllowed = false;
    try {
      final user = await loadUser();
      if (isDisposed) return DriverVehicleAccess.registration;
      if (user.partnerStatus == 'EXITED') {
        exitedUser = user;
        return DriverVehicleAccess.rider;
      }
      final data = await repository.mine();
      if (isDisposed) return DriverVehicleAccess.registration;
      registration = data;
      homeAllowed = vehicleMaps(
        data['vehicles'],
      ).any((v) => v['is_eligible'] == true);
      return homeAllowed
          ? DriverVehicleAccess.home
          : DriverVehicleAccess.registration;
    } finally {
      checking = false;
    }
  }
}

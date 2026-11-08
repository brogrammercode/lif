import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class PayoutChangeController extends FeatureController {
  final key = VehicleVerificationRepository.registrationKey();
  bool busy = false, attempted = false;
  String? error;
}

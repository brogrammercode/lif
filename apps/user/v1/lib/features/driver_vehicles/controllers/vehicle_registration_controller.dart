import 'package:user/core/state/feature_controller.dart';
import 'dart:typed_data';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class VehicleRegistrationController extends FeatureController {
  VehicleRegistrationController(this.repo);
  final VehicleVerificationRepository repo;
  Map<String, dynamic>? vehicle;
  final documents = <String, String>{};
  final local = <String, Uint8List>{};
  final paths = <String, String>{};
  final names = <String, String>{};
  final obsoleteUploads = <String>{};
  Map<String, dynamic>? brand;
  Map<String, dynamic>? model;
  List<Map<String, dynamic>> categories = [];
  String? categoryId;
  String? draftKey;
  String? pendingCapture;
  String? error;
  String? progress;
  String registrationKey = VehicleVerificationRepository.registrationKey();
  int version = 0;
  bool loading = true;
  bool busy = false;
  bool submitted = false;
  bool needsReload = false;
  bool loadFailed = false;
}

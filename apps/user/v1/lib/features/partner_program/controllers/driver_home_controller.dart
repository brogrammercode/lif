import 'package:user/core/network/api_result.dart';
import 'package:user/core/state/feature_controller.dart';
import 'dart:async';

import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/auth/auth.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverHomeController extends FeatureController {
  final repo = DriverOperationsRepository();
  final tracking = DriverTrackingService.instance;
  final vehicleRepository = VehicleVerificationRepository();
  final authRepository = AuthRepository();
  String? avatarUrl;
  bool _avatarLoaded = false;
  Map<String, dynamic>? data;
  List<Map<String, dynamic>> ownedVehicles = [];
  String? selectedVehicleId, vehiclesError;
  bool vehiclesLoading = false, _vehiclesLoaded = false;
  Future<void>? _vehiclesRead;
  final Set<String> presentedOfferIds = {};
  String? error;
  Completer<void>? readDone;
  bool loading = false, busy = false, opening = false, foreground = true;

  Map<String, dynamic>? get selectedVehicle {
    for (final vehicle in ownedVehicles) {
      if (vehicle['id'] == selectedVehicleId) return vehicle;
    }
    return null;
  }

  bool get canGoOnline => selectedVehicle?['is_eligible'] == true;

  void selectVehicle(String id) {
    if (ownedVehicles.any((vehicle) => vehicle['id'] == id)) {
      update(() => selectedVehicleId = id);
    }
  }

  Future<void> loadOwnedVehicles({bool force = false}) async {
    if (isDisposed || (_vehiclesLoaded && !force)) return;
    if (vehiclesLoading) {
      await _vehiclesRead;
      return;
    }
    vehiclesLoading = true;
    final done = Completer<void>();
    _vehiclesRead = done.future;
    update(() => vehiclesError = null);
    try {
      final response = await vehicleRepository.mine();
      if (isDisposed) return;
      final vehicles = vehicleMaps(response['vehicles']);
      update(() {
        ownedVehicles = vehicles;
        _vehiclesLoaded = true;
        final selectedExists = vehicles.any(
          (vehicle) => vehicle['id'] == selectedVehicleId,
        );
        if (!selectedExists) {
          final activeVehicle = data?['vehicle'];
          final activeId = activeVehicle is Map
              ? '${activeVehicle['id'] ?? ''}'
              : '';
          selectedVehicleId =
              vehicles.any((vehicle) => vehicle['id'] == activeId)
              ? activeId
              : null;
          if (selectedVehicleId == null) {
            for (final vehicle in vehicles) {
              if (vehicle['is_eligible'] == true) {
                selectedVehicleId = '${vehicle['id']}';
                break;
              }
            }
          }
        }
      });
    } catch (error) {
      if (!isDisposed) {
        update(() => vehiclesError = ApiResult.errorMessage(error));
      }
    } finally {
      vehiclesLoading = false;
      done.complete();
      _vehiclesRead = null;
    }
  }

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
        final activeVehicle = data['vehicle'];
        final activeId = activeVehicle is Map
            ? '${activeVehicle['id'] ?? ''}'
            : '';
        if (selectedVehicleId == null && activeId.isNotEmpty) {
          selectedVehicleId = activeId;
        }
      });
      if (!_avatarLoaded) unawaited(_loadAvatar());
      if (data['exited'] != true && !_vehiclesLoaded) {
        unawaited(loadOwnedVehicles());
      }
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

  Future<void> _loadAvatar() async {
    try {
      final user = await authRepository.currentUser();
      if (isDisposed) return;
      update(() {
        avatarUrl = user.avatarUrl;
        _avatarLoaded = true;
      });
    } catch (_) {
      // The driver home remains usable with the person icon fallback.
      _avatarLoaded = true;
    }
  }
}

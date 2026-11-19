import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/features/demos/controllers/ride_demo_controller.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';

enum DriverDemoPhase {
  goOnline,
  request,
  arriving,
  waiting,
  inProgress,
  payment,
  completed,
}

class DriverDemoController extends RideDemoController {
  DriverDemoController() {
    previewDriver(DriverDemoPhase.goOnline);
  }
  DriverDemoPhase phase = DriverDemoPhase.goOnline;
  String selectedVehicleId = 'demo-driver-maruti';
  final expiresAt = DateTime.now().add(const Duration(minutes: 15));
  final tracking = DemoDriverTracking();
  List<Map<String, dynamic>> get ownedVehicles => [
    {
      'id': 'demo-driver-maruti',
      'make': 'Maruti Suzuki',
      'model': 'Dzire',
      'plate_number': 'BR10 AB1234',
      'type': 'SEDAN',
      'is_eligible': true,
      'brand': {
        'name': 'Maruti Suzuki',
        'logo_url':
            'https://res.cloudinary.com/drxuvrw65/image/upload/v1792684132/1more-admin/vehicle-brands/74618f08-2e02-44c2-a9d5-42213978f227.webp',
      },
    },
    {
      'id': 'demo-driver-tata',
      'make': 'Tata',
      'model': 'Nexon',
      'plate_number': 'BR10 CD5678',
      'type': 'SUV',
      'is_eligible': true,
      'brand': {'name': 'Tata'},
    },
    {
      'id': 'demo-driver-hyundai',
      'make': 'Hyundai',
      'model': 'Aura',
      'plate_number': 'BR10 EF9012',
      'type': 'SEDAN',
      'is_eligible': true,
      'brand': {'name': 'Hyundai'},
    },
  ];
  Map<String, dynamic> get activeVehicle => ownedVehicles.firstWhere(
    (vehicle) => vehicle['id'] == selectedVehicleId,
    orElse: () => ownedVehicles.first,
  );
  @override
  Map<String, dynamic> get vehicle => {
    ...super.vehicle,
    ...activeVehicle,
    'brand': activeVehicle['brand'],
  };

  static String label(DriverDemoPhase phase) => switch (phase) {
    DriverDemoPhase.goOnline => 'Go online',
    DriverDemoPhase.request => 'Ride request',
    DriverDemoPhase.arriving => 'Arriving',
    DriverDemoPhase.waiting => 'At pickup / QR',
    DriverDemoPhase.inProgress => 'In progress',
    DriverDemoPhase.payment => 'Payment',
    DriverDemoPhase.completed => 'Completed',
  };
  void previewDriver(DriverDemoPhase value) {
    phase = value;
    status = switch (value) {
      DriverDemoPhase.goOnline => 'OFFLINE',
      DriverDemoPhase.request => 'SEARCHING',
      DriverDemoPhase.arriving => 'DRIVER_ARRIVING',
      DriverDemoPhase.waiting => 'DRIVER_WAITING',
      DriverDemoPhase.inProgress => 'IN_PROGRESS',
      DriverDemoPhase.payment || DriverDemoPhase.completed => 'COMPLETED',
    };
    riderConfirmed = true;
    changed();
  }

  void selectVehicle(String id) {
    if (ownedVehicles.any((vehicle) => vehicle['id'] == id)) {
      selectedVehicleId = id;
      changed();
    }
  }

  void goOnline() => previewDriver(DriverDemoPhase.request);

  Map<String, dynamic> get offer => {
    'id': 'demo-driver-offer',
    'can_accept': phase == DriverDemoPhase.request,
    'expires_at': expiresAt.toIso8601String(),
    'ride': contextData['trip'],
    'vehicle': vehicle,
  };
  @override
  Map<String, dynamic> get contextData {
    final data = super.contextData;
    return {
      ...data,
      'is_driver': true,
      'driver_availability': switch (phase) {
        DriverDemoPhase.goOnline => 'OFFLINE',
        DriverDemoPhase.request => 'AVAILABLE',
        DriverDemoPhase.arriving || DriverDemoPhase.waiting => 'EN_ROUTE',
        DriverDemoPhase.inProgress => 'ON_TRIP',
        DriverDemoPhase.payment || DriverDemoPhase.completed => 'AVAILABLE',
      },
      'driver_has_active_trip': !['SEARCHING', 'COMPLETED'].contains(status),
      'trip': {
        ...data['trip'] as Map,
        'rider': profile,
        'vehicle': vehicle,
        'driver': driver,
      },
      'payment': {
        ...data['payment'] as Map,
        'status': phase == DriverDemoPhase.completed ? 'CAPTURED' : 'PENDING',
      },
      'direct_collection_allowed': true,
    };
  }

  @override
  Future<dynamic> request(
    String methodName,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    Map<String, dynamic>? headers,
  }) async {
    if (isDisposed) throw StateError('This demo has ended.');
    dynamic result;
    final data = body is Map ? body : const {};
    if (methodName == 'GET' && path == '/driver/operations') {
      result = {
        'offers': phase == DriverDemoPhase.request ? [offer] : [],
        'availability': phase == DriverDemoPhase.goOnline
            ? 'OFFLINE'
            : 'AVAILABLE',
      };
    } else if (methodName == 'GET' &&
        path == '/trips/${RideDemoController.tripId}/context') {
      result = contextData;
    } else if (methodName == 'GET' && path.endsWith('/navigation')) {
      result = {
        ...route,
        'target': status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP',
        'steps': [
          {
            'instruction': 'Continue along the highlighted route',
            'distance_m': 620,
          },
        ],
      };
    } else if (methodName == 'POST' &&
        path == '/driver/offers/demo-driver-offer/accept') {
      previewDriver(DriverDemoPhase.arriving);
      result = {'ride_id': RideDemoController.tripId};
    } else if (methodName == 'POST' && path.endsWith('/reject')) {
      result = {};
    } else if (methodName == 'POST' && path.endsWith('/arrive')) {
      previewDriver(DriverDemoPhase.waiting);
      result = contextData;
    } else if (methodName == 'POST' && path.endsWith('/start')) {
      if (data['code'] != '162904' || status != 'DRIVER_WAITING') {
        throw StateError('Use demo trip code 162904 after arrival.');
      }
      previewDriver(DriverDemoPhase.inProgress);
      result = contextData;
    } else if (methodName == 'POST' && path.endsWith('/complete')) {
      previewDriver(DriverDemoPhase.payment);
      result = contextData;
    } else if (methodName == 'POST' && path.endsWith('/collection')) {
      method = '${data['method']}';
      if (data['received'] == true) previewDriver(DriverDemoPhase.completed);
      result = contextData;
    } else {
      return super.request(
        methodName,
        path,
        body: body,
        query: query,
        headers: headers,
      );
    }
    return {'status': 'success', 'data': result};
  }

  @override
  void dispose() {
    tracking.position.dispose();
    tracking.error.dispose();
    super.dispose();
  }
}

/// No GPS, platform services, real client, uploads or singleton fallthrough.
class DemoDriverTracking implements DriverTrackingService {
  @override
  final position = ValueNotifier<Position?>(
    Position(
      latitude: 25.2541,
      longitude: 86.9822,
      timestamp: DateTime.now(),
      accuracy: 8,
      altitude: 0,
      heading: 0,
      speed: 0,
      speedAccuracy: 0,
      altitudeAccuracy: 0,
      headingAccuracy: 0,
    ),
  );
  @override
  final error = ValueNotifier<String?>(null);
  @override
  Future<void> syncTrip({
    required bool activeTrip,
    required String? availability,
  }) async {}
  @override
  Future<void> freshFix() async {}
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw StateError('Device services are disabled in this demo.');
}

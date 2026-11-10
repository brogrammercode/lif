import 'package:user/core/state/feature_controller.dart';

enum DemoFlowId { rideBooking, driverRide }

class DemoFlowDefinition {
  final DemoFlowId id;
  final String title, description;
  const DemoFlowDefinition(this.id, this.title, this.description);
}

class DemoRegistryController extends FeatureController {
  final List<DemoFlowDefinition> flows = const [
    DemoFlowDefinition(
      DemoFlowId.driverRide,
      'Driver ride flow',
      'Request, pickup QR, progress, collection and completion',
    ),
    DemoFlowDefinition(
      DemoFlowId.rideBooking,
      'Ride booking flow',
      'Production screens with local sample data and manual stages',
    ),
  ];
}

import 'package:user/core/state/feature_controller.dart';

class RideRatingController extends FeatureController {
  int? score;
  void select(int value) {
    if (value >= 1 && value <= 5) update(() => score = value);
  }
}

class TripCancellationController extends FeatureController {
  String code = 'CHANGED_PLANS';
  static const reasons = {
    'CHANGED_PLANS': 'My plans changed',
    'WRONG_PICKUP': 'Pickup is incorrect',
    'SAFETY': 'Driver or vehicle safety concern',
    'DRIVER_LATE': 'Driver is significantly late',
    'DRIVER_REFUSED': 'Driver refused the ride',
    'OTHER': 'Other reason',
  };
  void select(String value) {
    if (reasons.containsKey(value)) update(() => code = value);
  }
}

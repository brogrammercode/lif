import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/rides/ride_display.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class PlaceReviewController extends FeatureController {
  PlaceReviewController(this.initial);
  final Map<String, dynamic> initial;
  late int score = (rideNumber(initial['score']) ?? 0).toInt();
  bool busy = false;
  String? error;
}

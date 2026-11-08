import 'package:user/core/state/feature_controller.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class SupportRequestController extends FeatureController {
  final String requestKey =
      'support-mobile-${DateTime.now().microsecondsSinceEpoch}';
  String priority = 'NORMAL';
  bool sending = false;
  String? error;
}

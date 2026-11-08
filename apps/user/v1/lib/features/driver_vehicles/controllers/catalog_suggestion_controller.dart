import 'package:user/core/state/feature_controller.dart';
import 'dart:typed_data';

/// Owns feature records, query state and asynchronous loading independently of its view.
class CatalogSuggestionController extends FeatureController {
  String type = 'BIKE';
  String fuel = 'PETROL';
  Uint8List? logo;
  String logoName = 'logo.jpg';
  String? error;
  bool busy = false;
}

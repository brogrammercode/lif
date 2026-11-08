import 'package:user/core/state/feature_controller.dart';
import 'package:image_picker/image_picker.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class PlaceSaveController extends FeatureController {
  PlaceSaveController(this.initial, this.photos);
  final Map<String, dynamic> initial;
  final List<XFile> photos;
  late String type = '${initial['place_type'] ?? 'OTHER'}';
  late final keys = List.generate(
    photos.length,
    (i) => 'place-photo-${DateTime.now().microsecondsSinceEpoch}-$i',
  );
  String? savedId, error;
  bool busy = false, attempted = false;
  int uploaded = 0;
}

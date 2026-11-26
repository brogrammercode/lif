import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/features/saved_places/places.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class PlaceSaveController extends FeatureController {
  PlaceSaveController(this.initial, this.photos, this.repository) {
    keys.addAll(_newKeys(photos.length));
  }

  final Map<String, dynamic> initial;
  final List<XFile> photos;
  final PlacesRepository repository;
  final Set<String> removedPhotoIds = {};
  late String type = '${initial['place_type'] ?? 'OTHER'}';
  final List<String> keys = [];
  String? savedId, error;
  bool busy = false, attempted = false;
  int uploaded = 0;

  void removeExistingPhoto(String id) => update(() => removedPhotoIds.add(id));

  void removeNewPhoto(XFile photo) => update(() {
    final index = photos.indexOf(photo);
    if (index < 0) return;
    photos.removeAt(index);
    keys.removeAt(index);
  });

  void addPhoto(XFile photo) => update(() {
    photos.add(photo);
    keys.addAll(_newKeys(1));
  });

  Future<void> removePlace() async {
    final id = '${initial['id'] ?? ''}';
    final version = initial['version'];
    if (id.isEmpty || version is! num || busy) return;
    update(() {
      busy = true;
      error = null;
    });
    try {
      await repository.remove(id, version.toInt());
    } catch (exception) {
      update(() => error = ApiResult.errorMessage(exception));
      rethrow;
    } finally {
      update(() => busy = false);
    }
  }

  List<String> _newKeys(int count) => List.generate(
    count,
    (i) => 'place-photo-${DateTime.now().microsecondsSinceEpoch}-$i',
  );
}

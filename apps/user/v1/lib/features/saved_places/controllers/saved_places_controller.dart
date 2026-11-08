import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/saved_places/places.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class SavedPlacesController extends FeatureController {
  SavedPlacesController(this.repo);
  final PlacesRepository repo;
  List<Map<String, dynamic>> places = [];
  String scope = 'all', query = '';
  String? selected, error, type;
  int page = 1, total = 0, generation = 0, recenter = 0;
  bool loading = false, loaded = false;

  Future<void> load({bool changed = false}) async {
    if (loading && !changed) return;
    final generation = ++this.generation;
    update(() {
      loading = true;
      if (changed) {
        places = [];
        loaded = false;
        error = null;
      }
    });
    try {
      final result = await repo.list(
        page: page,
        query: query,
        scope: scope,
        type: type,
      );
      if (isDisposed || generation != this.generation) return;
      final rows = rideMaps(result['rows']);
      update(() {
        places = rows;
        total = (rideNumber(result['total']) ?? 0).toInt();
        selected = rows.any((p) => '${p['id']}' == selected)
            ? selected
            : rows.firstOrNull?['id'] as String?;
        if (changed || !loaded) recenter++;
        loaded = true;
        error = null;
      });
    } catch (error) {
      if (!isDisposed && generation == this.generation) {
        update(() => this.error = ApiResult.errorMessage(error));
      }
    } finally {
      if (!isDisposed && generation == this.generation) {
        update(() => loading = false);
      }
    }
  }
}

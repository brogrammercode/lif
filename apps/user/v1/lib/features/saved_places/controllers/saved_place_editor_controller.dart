import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class SavedPlaceEditorController extends FeatureController {
  SavedPlaceEditorController(this.initial, this.repository);
  final Map<String, dynamic>? initial;
  final UserAppRepository repository;
  late String type = '${initial?['place_type'] ?? 'OTHER'}';
  late LatLng? selected = ridePoint(
    initial?['latitude'],
    initial?['longitude'],
  );
  int generation = 0;
  bool searching = false;
  String? error;
  List<Map<String, dynamic>> results = [];
  Future<void> search(String query, int generation) async {
    if (isDisposed || generation != this.generation) return;
    update(() => searching = true);
    try {
      final results = await repository.searchPlaces(query);
      if (isDisposed || generation != this.generation) return;
      update(
        () => this.results = results
            .where((v) => ridePoint(v['lat'], v['lon']) != null)
            .toList(),
      );
    } catch (e) {
      if (!isDisposed && generation == this.generation) {
        update(() => error = ApiResult.errorMessage(e));
      }
    } finally {
      if (!isDisposed && generation == this.generation) {
        update(() => searching = false);
      }
    }
  }
}

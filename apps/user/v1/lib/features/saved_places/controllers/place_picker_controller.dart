import 'dart:async';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/saved_places/places.repo.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:image_picker/image_picker.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/features/rides/ride_display.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class PlacePickerController extends FeatureController {
  final Map<String, dynamic>? initial;
  PlacePickerController(this.initial, this.repository);
  final PlacesRepository repository;
  Timer? _searchTimer, _reverseTimer;
  late LatLng? point = ridePoint(initial?['latitude'], initial?['longitude']);
  late Map<String, dynamic> selected = {...?initial};
  final photos = <XFile>[];
  List<Map<String, dynamic>> results = [];
  int searchGeneration = 0, reverseGeneration = 0;
  bool searching = false, resolving = false, picking = false;
  String? error;

  void find(String value) {
    _searchTimer?.cancel();
    final generation = ++searchGeneration;
    update(() {
      results = [];
      searching = false;
      error = null;
    });
    if (value.trim().length < 3) return;
    _searchTimer = Timer(const Duration(seconds: 3), () async {
      if (isDisposed) return;
      update(() => searching = true);
      try {
        final rows = await repository.search(value.trim());
        if (!isDisposed && generation == searchGeneration) {
          update(
            () => results = rows
                .where((p) => ridePoint(p['lat'], p['lon']) != null)
                .toList(),
          );
        }
      } catch (error) {
        if (!isDisposed && generation == searchGeneration) {
          update(() => this.error = ApiResult.errorMessage(error));
        }
      } finally {
        if (!isDisposed && generation == searchGeneration) {
          update(() => searching = false);
        }
      }
    });
  }

  void choose(Map<String, dynamic> place) {
    final point = ridePoint(place['lat'], place['lon']);
    if (point == null) return;
    _searchTimer?.cancel();
    _reverseTimer?.cancel();
    searchGeneration++;
    reverseGeneration++;
    final address = '${place['display_name'] ?? ''}';
    update(() {
      this.point = point;
      selected = {
        ...selected,
        'name': '${place['name'] ?? address.split(',').first}',
        'address': address,
        'place_type': 'OTHER',
      };
      results = [];
      searching = false;
      resolving = false;
      error = null;
    });
  }

  void picked(LatLng point) {
    if (this.point != null &&
        (point.latitude - this.point!.latitude).abs() < .00001 &&
        (point.longitude - this.point!.longitude).abs() < .00001) {
      return;
    }
    _reverseTimer?.cancel();
    final generation = ++reverseGeneration;
    update(() {
      this.point = point;
      selected = {
        ...selected,
        'name': 'Selected location',
        'address': '',
        'place_type': selected['place_type'] ?? 'OTHER',
      };
      resolving = true;
      error = null;
    });
    _reverseTimer = Timer(const Duration(milliseconds: 1000), () async {
      try {
        final result = await repository.reverse(
          point.latitude,
          point.longitude,
        );
        if (isDisposed || generation != reverseGeneration) return;
        final address = '${result['display_name'] ?? ''}';
        update(
          () => selected = {
            ...selected,
            'name': '${result['name'] ?? address.split(',').first}',
            'address': address,
          },
        );
      } catch (_) {
        if (!isDisposed && generation == reverseGeneration) {
          update(
            () => error =
                'Address unavailable. You can enter it in the next step.',
          );
        }
      } finally {
        if (!isDisposed && generation == reverseGeneration) {
          update(() => resolving = false);
        }
      }
    });
  }

  @override
  void dispose() {
    _searchTimer?.cancel();
    _reverseTimer?.cancel();
    super.dispose();
  }
}

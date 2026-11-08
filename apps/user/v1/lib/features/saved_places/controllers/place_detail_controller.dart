import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/saved_places/places.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class PlaceDetailController extends FeatureController {
  PlaceDetailController(this.repository, this.id);
  final PlacesRepository repository;
  final String id;
  Map<String, dynamic>? place, reviews;
  String? error, reviewError, userId;
  bool loading = false, busy = false, reviewsLoading = false;
  int recenter = 0, reviewPage = 1, generation = 0, reviewGeneration = 0;
  Future<void> profile() async {
    try {
      final user = await repository.profile();
      if (!isDisposed) update(() => userId = '${user['id']}');
    } catch (_) {}
  }

  Future<void> load({bool replace = false}) async {
    if (loading && !replace) return;
    final generation = ++this.generation;
    update(() => loading = true);
    try {
      final place = await repository.detail(id);
      if (place['id'] != id) {
        throw StateError('This place could not be verified. Please refresh.');
      }
      if (!isDisposed && generation == this.generation) {
        update(() {
          this.place = place;
          error = null;
        });
        unawaited(loadReviews(replace: true));
      }
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

  Future<void> loadReviews({int? page, bool replace = false}) async {
    if (reviewsLoading && !replace) return;
    final generation = ++reviewGeneration;
    update(() {
      reviewsLoading = true;
      if (page != null) {
        reviewPage = page;
        reviews = null;
      }
    });
    try {
      final data = await repository.reviews(id, page: reviewPage);
      if (!isDisposed && generation == reviewGeneration) {
        update(() {
          reviews = data;
          reviewError = null;
        });
      }
    } catch (error) {
      if (!isDisposed && generation == reviewGeneration) {
        update(() => reviewError = ApiResult.errorMessage(error));
      }
    } finally {
      if (!isDisposed && generation == reviewGeneration) {
        update(() => reviewsLoading = false);
      }
    }
  }
}

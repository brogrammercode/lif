import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class PlaceDirectionsController extends FeatureController {
  PlaceDirectionsController(this.place);
  final Map<String, dynamic> place;
  Map<String, dynamic>? route;
  LatLng? origin;
  String? error;
  bool busy = false, settings = false;
  Future<void> load() async {
    if (busy) return;
    update(() {
      busy = true;
      error = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw StateError('Enable device location to get directions.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (![
        LocationPermission.always,
        LocationPermission.whileInUse,
      ].contains(permission)) {
        throw StateError('Allow location access to get directions.');
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      final origin = ridePoint(position.latitude, position.longitude);
      final target = ridePoint(place['latitude'], place['longitude']);
      if (origin == null || target == null) {
        throw StateError('This location cannot be routed.');
      }
      final data = await UserAppRepository().drivingRoute(
        fromLatitude: origin.latitude,
        fromLongitude: origin.longitude,
        toLatitude: target.latitude,
        toLongitude: target.longitude,
      );
      if (rideGeometry(data['geometry']).length < 2) {
        throw StateError('A driving route was not returned. Try again.');
      }
      if (!isDisposed) {
        update(() {
          this.origin = origin;
          route = data;
        });
      }
    } catch (error) {
      if (!isDisposed) update(() => this.error = ApiResult.errorMessage(error));
    } finally {
      if (!isDisposed) update(() => busy = false);
    }
  }
}

import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/home/constants/home.constant.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/places.repo.dart';
import 'package:user/features/user_app/user_app.repo.dart';

enum SearchField { none, from, to }

class LocationResult {
  final String status;
  final LatLng? point;
  final double heading;
  const LocationResult(this.status, {this.point, this.heading = 0});
}

class HomeController extends FeatureController {
  final DioClient client;
  late final UserAppRepository repository = UserAppRepository(client: client);
  late final PlacesRepository places = PlacesRepository(client: client);
  final bool simulated;
  final Map<String, dynamic> Function()? initialEndpoints;
  HomeController({
    DioClient? client,
    this.simulated = false,
    this.initialEndpoints,
  }) : client = client ?? DioClient();
  LatLng fromLocation = HomeConstants.DEFAULT_LOCATION;
  bool hasPickupLocation = false, pickupChosenManually = false;
  Map<String, dynamic>? activeRide;
  bool resumeDriver = false;
  LatLng? currentDeviceLocation, toLocation;
  bool isLoading = true, isRefreshing = false;
  SearchField activeField = SearchField.none;
  SearchField? mapPickField;
  List<LatLng> routePoints = [];
  double? routeDistance, routeDuration;
  String? routeError, profileAvatarUrl;
  bool isRequestingQuote = false;
  List<Map<String, dynamic>> savedPlaces = [], communityPlaces = [];
  List<dynamic> suggestions = [];
  List<dynamic>? pendingSuggestions;
  String? pendingSuggestionQuery;
  SearchField? pendingSuggestionField;
  int searchGeneration = 0, routeRequestGeneration = 0;
  bool isFetchingSuggestions = false,
      isMapDragging = false,
      isFetchingRoute = false;
  String pickupAddress = '', dropoffAddress = '';
  Map<String, dynamic> get endpoints => {
    'pickup': {
      'address': pickupAddress,
      'latitude': fromLocation.latitude,
      'longitude': fromLocation.longitude,
    },
    'dropoff': {
      'address': dropoffAddress,
      'latitude': toLocation?.latitude,
      'longitude': toLocation?.longitude,
    },
  };
  Future<void> loadPlaces() async {
    final rows = await repository.savedPlaces();
    if (isDisposed) return;
    update(() => savedPlaces = rows);
    try {
      final result = await places.list();
      if (!isDisposed) update(() => communityPlaces = rideMaps(result['rows']));
    } catch (_) {}
  }

  Future<void> loadProfile() async {
    final profile = await repository.profile();
    if (!isDisposed) {
      update(() {
        final url = '${profile['avatar_url'] ?? ''}'.trim();
        profileAvatarUrl = url.isEmpty ? null : url;
      });
    }
  }

  Future<void> checkTravel() async {
    final data = await repository.travelContext();
    if (!isDisposed) {
      update(() {
        resumeDriver = data['active_driver_ride'] is Map;
        activeRide =
            data[resumeDriver ? 'active_driver_ride' : 'active_rider_ride']
                is Map
            ? rideMap(
                data[resumeDriver ? 'active_driver_ride' : 'active_rider_ride'],
              )
            : null;
      });
    }
  }

  Future<List<Map<String, dynamic>>> search(String value) =>
      repository.searchPlaces(value);
  Future<Map<String, dynamic>> reverse(LatLng value) =>
      repository.reversePlace(value.latitude, value.longitude);
  Future<Map<String, dynamic>> route() => repository.drivingRoute(
    fromLatitude: fromLocation.latitude,
    fromLongitude: fromLocation.longitude,
    toLatitude: toLocation!.latitude,
    toLongitude: toLocation!.longitude,
  );
  Future<Map<String, dynamic>> quote() => repository.requestQuote(endpoints);
  Future<Map<String, double>?> cachedLocation() =>
      client.readCachedUserLocation();
  Future<void> saveLocation(LatLng point) async {
    if (simulated) return;
    try {
      await client.saveCachedUserLocation(
        latitude: point.latitude,
        longitude: point.longitude,
      );
    } catch (_) {}
    try {
      await repository.updateLastKnownLocation(
        latitude: point.latitude,
        longitude: point.longitude,
      );
    } catch (_) {}
  }

  Future<LocationResult> locate({bool askPermission = true}) async {
    if (simulated) {
      final pickup = rideMap(initialEndpoints?.call()['pickup']);
      return LocationResult(
        'ready',
        point: ridePoint(pickup['latitude'], pickup['longitude']),
      );
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied && askPermission) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.deniedForever) {
      return const LocationResult('deniedForever');
    }
    if (permission == LocationPermission.denied) {
      return const LocationResult('denied');
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      return const LocationResult('serviceOff');
    }
    try {
      final fix = await Geolocator.getCurrentPosition().timeout(
        const Duration(seconds: 30),
      );
      return LocationResult(
        'ready',
        point: LatLng(fix.latitude, fix.longitude),
        heading: fix.heading > 0 ? fix.heading : 0,
      );
    } catch (_) {
      return const LocationResult('unavailable');
    }
  }
}

import 'package:user/components/ui/glass_dropdown.dart';
import 'package:user/features/rides/widgets/booking_review_sheet.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/core/route_observer.dart';
import 'dart:ui';
import 'dart:math' as math;
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:geolocator/geolocator.dart';
import 'package:iconsax/iconsax.dart';
import 'package:user/features/home/constants/home.constant.dart';
import '../../../core/network/dio_client.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/components/ui/app_logo.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

enum SearchField { none, from, to }

class _HomePageState extends State<HomePage>
    with WidgetsBindingObserver, RouteAware {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  LatLng _fromLocation = HomeConstants.DEFAULT_LOCATION;
  bool _hasPickupLocation = false;
  bool _pickupChosenManually = false;
  bool _rebookRestored = false;
  ModalRoute<dynamic>? _homeRoute;
  Timer? _travelTimer;
  Map<String, dynamic>? _activeRide;
  bool _resumeDriver = false, _checkingTravel = false;
  Completer<void>? _travelDone;
  LatLng? _currentDeviceLocation;
  LatLng? _toLocation;

  bool _isLoading = true;
  bool _isRefreshing = false;
  bool _waitingForLocationSettingsReturn = false;
  MapLibreMapController? _mapController;
  bool _mapStyleReady = false;
  bool _isProgrammaticMapMove = false;
  double _mapMarkerIconScale = 1;
  LatLng? _pendingMapCenter;

  // Search State
  SearchField _activeField = SearchField.none;
  SearchField? _mapPickField;
  final TextEditingController _fromController = TextEditingController();
  final TextEditingController _toController = TextEditingController();
  final FocusNode _fromFocus = FocusNode();
  final FocusNode _toFocus = FocusNode();

  bool _hasExpandedSearch = false;
  List<LatLng> _routePoints = [];
  double? _routeDistance;
  double? _routeDuration;
  String? _routeError;

  String _bookingMethod = 'CASH';
  bool _isSelectingVehicle = false;
  int? _selectedVehicleIndex = 0;
  bool _isSearchingDriver = false;
  bool _isProgrammaticTextChange = false;
  final UserAppRepository _userRepository = UserAppRepository();
  String? _profileAvatarUrl;
  String? _quoteDraftId;
  List<Map<String, dynamic>> _rideQuotes = [];
  bool _isRequestingQuote = false;
  List<Map<String, dynamic>> _savedPlaces = [];

  Timer? _debounce;
  Timer? _mapDataSyncTimer;
  Timer? _routeSettleTimer;
  List<dynamic> _suggestions = [];
  List<dynamic>? _pendingSuggestions;
  String? _pendingSuggestionQuery;
  SearchField? _pendingSuggestionField;
  int _searchGeneration = 0;
  int _routeRequestGeneration = 0;
  bool _isFetchingSuggestions = false;
  bool _isMapDragging = false;
  bool _isFetchingRoute = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeLocation();
    unawaited(_loadSavedPlaces());
    unawaited(_loadProfileAvatar());
    unawaited(_checkTravel());
    _travelTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_homeRoute?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        unawaited(_checkTravel());
      }
    });
    _fromController.addListener(_onSearchChanged);
    _toController.addListener(_onSearchChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != _homeRoute) {
      appRouteObserver.unsubscribe(this);
      _homeRoute = route;
      if (route != null) appRouteObserver.subscribe(this, route);
    }
    if (_rebookRestored) return;
    _rebookRestored = true;
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is! Map || args['rebook'] is! Map) return;
    final trip = Map<String, dynamic>.from(args['rebook'] as Map);
    final pickup = ridePoint(trip['pickup_latitude'], trip['pickup_longitude']);
    final dropoff = ridePoint(
      trip['dropoff_latitude'],
      trip['dropoff_longitude'],
    );
    if (pickup == null || dropoff == null) return;
    _fromLocation = pickup;
    _toLocation = dropoff;
    _hasPickupLocation = true;
    _pickupChosenManually = true;
    _hasExpandedSearch = true;
    _setSearchText(_fromController, '${trip['pickup_address']}');
    _setSearchText(_toController, '${trip['dropoff_address']}');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_fetchRoute());
    });
  }

  @override
  void dispose() {
    _travelTimer?.cancel();
    appRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    _fromController.dispose();
    _toController.dispose();
    _fromFocus.dispose();
    _toFocus.dispose();
    _debounce?.cancel();
    _mapDataSyncTimer?.cancel();
    _routeSettleTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _homeRoute?.isCurrent == true) {
      unawaited(_checkTravel());
    }
    if (state != AppLifecycleState.resumed ||
        !_waitingForLocationSettingsReturn) {
      return;
    }

    _waitingForLocationSettingsReturn = false;
    setState(() => _isLoading = true);
    unawaited(
      _determinePosition(
        requestPermissionIfDenied: false,
        showSettingsDialog: false,
      ),
    );
  }

  @override
  void didPopNext() {
    unawaited(_checkTravel());
    unawaited(_loadSavedPlaces());
  }

  Future<void> _checkTravel() async {
    if (!mounted) return;
    if (_checkingTravel) {
      await _travelDone?.future;
      return;
    }
    _checkingTravel = true;
    final done = _travelDone = Completer<void>();
    try {
      final data = await _userRepository.travelContext();
      if (mounted) {
        setState(() {
          _resumeDriver = data['active_driver_ride'] is Map;
          final ride =
              data[_resumeDriver ? 'active_driver_ride' : 'active_rider_ride'];
          _activeRide = ride is Map ? Map<String, dynamic>.from(ride) : null;
        });
      }
    } catch (_) {
      /* Keep the last confirmed active trip available for recovery. */
    } finally {
      _checkingTravel = false;
      done.complete();
      _travelDone = null;
    }
  }

  void _resumeActive() {
    if (_activeRide != null) {
      Navigator.pushNamed(
        context,
        _resumeDriver ? AppRoutes.driverRideDetail : AppRoutes.rideDetail,
        arguments: _activeRide!['id'],
      );
    }
  }

  @override
  void didChangeMetrics() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final keyboardIsVisible = WidgetsBinding.instance.platformDispatcher.views
          .any((view) => view.viewInsets.bottom > 0);
      if (!keyboardIsVisible) _showPendingSuggestions();
    });
  }

  Future<void> _loadSavedPlaces() async {
    try {
      final places = await _userRepository.savedPlaces();
      if (!mounted) return;
      setState(() => _savedPlaces = places);
      _scheduleMapDataSync();
    } catch (_) {
      // The home map remains usable if saved-place loading is unavailable.
    }
  }

  Future<void> _loadProfileAvatar() async {
    try {
      final profile = await _userRepository.profile();
      final avatarUrl = '${profile['avatar_url'] ?? ''}'.trim();
      if (!mounted) return;
      setState(() => _profileAvatarUrl = avatarUrl.isEmpty ? null : avatarUrl);
    } catch (_) {
      // Keep the account icon visible when the profile cannot be loaded.
    }
  }

  Future<void> _initializeLocation() async {
    Map<String, double>? cachedLocation;
    try {
      cachedLocation = await DioClient().readCachedUserLocation();
    } catch (_) {}

    if (!mounted) return;
    if (cachedLocation != null && !_pickupChosenManually) {
      final location = LatLng(
        cachedLocation['latitude']!,
        cachedLocation['longitude']!,
      );
      setState(() {
        _fromLocation = location;
        _hasPickupLocation = true;
        _setSearchText(
          _fromController,
          '${location.latitude.toStringAsFixed(5)}, ${location.longitude.toStringAsFixed(5)}',
        );
        _currentDeviceLocation = location;
      });
      _animatedMapMove(location, HomeConstants.DEFAULT_ZOOM, 0);
      unawaited(_syncUserLocationPuck());
    }

    final hasFreshLocation = await _determinePosition();
    if (!hasFreshLocation && cachedLocation != null && mounted) {
      _reverseGeocode(
        LatLng(cachedLocation['latitude']!, cachedLocation['longitude']!),
        overrideField: SearchField.from,
      );
    }
  }

  Future<bool> _determinePosition({
    bool requestPermissionIfDenied = true,
    bool showSettingsDialog = true,
  }) async {
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied && requestPermissionIfDenied) {
      permission = await Geolocator.requestPermission();
    }

    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      if (mounted) setState(() => _isLoading = false);
      if (permission == LocationPermission.deniedForever &&
          showSettingsDialog) {
        await _showLocationSettingsDialog(
          title: 'Location permission is off',
          message:
              'Allow location access in app settings, then return to the app to retry.',
          openSettings: Geolocator.openAppSettings,
          buttonText: 'Open app settings',
        );
      }
      return false;
    }

    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      if (mounted) setState(() => _isLoading = false);
      if (showSettingsDialog) {
        await _showLocationSettingsDialog(
          title: 'Turn on location services',
          message:
              'Location access is allowed for this app, but device location services are off.',
          openSettings: Geolocator.openLocationSettings,
          buttonText: 'Open location settings',
        );
      }
      return false;
    }

    try {
      Position position = await Geolocator.getCurrentPosition();
      if (mounted) {
        final location = LatLng(position.latitude, position.longitude);
        setState(() {
          if (!_pickupChosenManually) {
            _invalidateRouteChoice();
            _fromLocation = location;
            _hasPickupLocation = true;
            _setSearchText(
              _fromController,
              '${location.latitude.toStringAsFixed(5)}, ${location.longitude.toStringAsFixed(5)}',
            );
          }
          _currentDeviceLocation = location;
          _isLoading = false;
        });
        _scheduleMapDataSync();
        unawaited(_syncUserLocationPuck());
        unawaited(_saveLastKnownLocation(location));
        double heading = position.heading > 0 ? position.heading : 0;
        if (!_pickupChosenManually) {
          if (_activeField == SearchField.none &&
              _mapPickField == null &&
              !_isMapDragging) {
            _animatedMapMove(location, HomeConstants.DEFAULT_ZOOM, heading);
          }
          _reverseGeocode(location, overrideField: SearchField.from);
          if (_toLocation != null) unawaited(_fetchRoute());
        }
        return true;
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
    return false;
  }

  Future<void> _showLocationSettingsDialog({
    required String title,
    required String message,
    required Future<bool> Function() openSettings,
    required String buttonText,
  }) async {
    if (!mounted) return;
    final shouldOpenSettings = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Not now'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(buttonText),
          ),
        ],
      ),
    );
    if (shouldOpenSettings == true) {
      _waitingForLocationSettingsReturn = true;
      final opened = await openSettings();
      if (!opened) _waitingForLocationSettingsReturn = false;
    }
  }

  Future<void> _saveLastKnownLocation(LatLng location) async {
    try {
      await DioClient().saveCachedUserLocation(
        latitude: location.latitude,
        longitude: location.longitude,
      );
    } catch (_) {}

    try {
      await _userRepository.updateLastKnownLocation(
        latitude: location.latitude,
        longitude: location.longitude,
      );
    } catch (_) {}
  }

  Future<void> _refreshLocation() async {
    if (_isRefreshing) return;
    setState(() => _isRefreshing = true);
    try {
      Position position = await Geolocator.getCurrentPosition();
      if (!mounted) return;
      final newLocation = LatLng(position.latitude, position.longitude);
      setState(() {
        _invalidateRouteChoice();
        _fromLocation = newLocation;
        _hasPickupLocation = true;
        _pickupChosenManually = false;
        _setSearchText(
          _fromController,
          '${newLocation.latitude.toStringAsFixed(5)}, ${newLocation.longitude.toStringAsFixed(5)}',
        );
        _currentDeviceLocation = newLocation;
      });
      _scheduleMapDataSync();
      unawaited(_syncUserLocationPuck());
      unawaited(_saveLastKnownLocation(newLocation));
      // Reset rotation to default (0.0) alongside default zoom
      _animatedMapMove(newLocation, HomeConstants.DEFAULT_ZOOM, 0.0);
      _reverseGeocode(newLocation, overrideField: SearchField.from);
      if (_toLocation != null) unawaited(_fetchRoute());
    } catch (e) {
      // ignore
    } finally {
      if (mounted) {
        setState(() => _isRefreshing = false);
      }
    }
  }

  void _setSearchText(TextEditingController controller, String text) {
    final previous = _isProgrammaticTextChange;
    _isProgrammaticTextChange = true;
    controller.text = text;
    _isProgrammaticTextChange = previous;
  }

  // Call inside setState whenever an endpoint changes. A displayed quote must
  // never survive a different pickup/destination or a pending map selection.
  void _invalidateRouteChoice() {
    _routeRequestGeneration++;
    _routePoints = [];
    _routeDistance = null;
    _routeDuration = null;
    _routeError = null;
    _isFetchingRoute = false;
    _isSelectingVehicle = false;
    _quoteDraftId = null;
    _rideQuotes = [];
  }

  void _onSearchChanged() {
    if (_isProgrammaticTextChange) return;
    if (_activeField == SearchField.none) return;
    final field = _activeField;
    final query = _searchControllerFor(field).text.trim();
    final generation = ++_searchGeneration;

    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _pendingSuggestions = null;
    _pendingSuggestionQuery = null;
    _pendingSuggestionField = null;
    if (mounted) {
      setState(() {
        _routeSettleTimer?.cancel();
        _invalidateRouteChoice();
        if (field == SearchField.from) {
          _hasPickupLocation = false;
          _pickupChosenManually = true;
        } else {
          _toLocation = null;
        }
        _suggestions = [];
        _isFetchingSuggestions = false;
      });
      _scheduleMapDataSync();
    }
    if (query.length < 3) return;

    _debounce = Timer(const Duration(seconds: 3), () {
      _fetchSuggestions(query, field, generation);
    });
  }

  TextEditingController _searchControllerFor(SearchField field) =>
      field == SearchField.from ? _fromController : _toController;

  Future<void> _fetchSuggestions(
    String query,
    SearchField field,
    int generation,
  ) async {
    if (generation != _searchGeneration || _activeField != field) return;
    if (mounted) setState(() => _isFetchingSuggestions = true);
    try {
      final response = await DioClient().getData(
        '/geocode/search',
        queryParameters: {'q': query},
      );
      final data = ApiResult.unwrap(response);
      if (!mounted ||
          generation != _searchGeneration ||
          _activeField != field ||
          _searchControllerFor(field).text.trim() != query) {
        return;
      }
      if (data is List) _holdOrShowSuggestions(data, query, field);
    } catch (e) {
      if (mounted && generation == _searchGeneration) {
        setState(() => _isFetchingSuggestions = false);
      }
    }
  }

  void _holdOrShowSuggestions(
    List<dynamic> suggestions,
    String query,
    SearchField field,
  ) {
    final keyboardIsVisible = WidgetsBinding.instance.platformDispatcher.views
        .any((view) => view.viewInsets.bottom > 0);
    if (keyboardIsVisible) {
      _pendingSuggestions = suggestions;
      _pendingSuggestionQuery = query;
      _pendingSuggestionField = field;
      setState(() => _isFetchingSuggestions = false);
      return;
    }

    setState(() {
      _suggestions = suggestions;
      _isFetchingSuggestions = false;
    });
  }

  void _showPendingSuggestions() {
    final keyboardIsVisible = WidgetsBinding.instance.platformDispatcher.views
        .any((view) => view.viewInsets.bottom > 0);
    if (keyboardIsVisible) return;

    final suggestions = _pendingSuggestions;
    final query = _pendingSuggestionQuery;
    final field = _pendingSuggestionField;
    _pendingSuggestions = null;
    _pendingSuggestionQuery = null;
    _pendingSuggestionField = null;

    if (!mounted || suggestions == null || query == null || field == null) {
      return;
    }
    if (_activeField != field ||
        _searchControllerFor(field).text.trim() != query) {
      return;
    }
    setState(() {
      _suggestions = suggestions;
      _isFetchingSuggestions = false;
    });
  }

  Future<void> _reverseGeocode(
    LatLng location, {
    SearchField? overrideField,
  }) async {
    final targetField = overrideField ?? _activeField;
    if (targetField == SearchField.none) return;

    try {
      final response = await DioClient().getData(
        '/geocode/reverse',
        queryParameters: {
          'latitude': location.latitude,
          'longitude': location.longitude,
        },
      );
      final data = ApiResult.unwrap(response);
      if (data is Map && mounted) {
        final current = targetField == SearchField.from
            ? _fromLocation
            : _toLocation;
        if ((targetField == SearchField.from && !_hasPickupLocation) ||
            current?.latitude != location.latitude ||
            current?.longitude != location.longitude) {
          return;
        }
        final displayName = data['display_name'] ?? '';
        final shortName = displayName.split(',').first.trim();
        if (shortName.isEmpty) return;

        _isProgrammaticTextChange = true;
        setState(() {
          if (targetField == SearchField.from) {
            _setSearchText(_fromController, shortName);
          } else if (targetField == SearchField.to) {
            _setSearchText(_toController, shortName);
          }
        });
        _scheduleMapDataSync();
        Future.microtask(() => _isProgrammaticTextChange = false);
      }
    } catch (e) {
      // ignore
    }
  }

  Future<void> _fetchRoute() async {
    if (!_hasPickupLocation || _toLocation == null) return;
    final generation = ++_routeRequestGeneration;
    if (mounted) {
      setState(() {
        _isFetchingRoute = true;
        _routeError = null;
      });
    }
    try {
      final route = await _userRepository.drivingRoute(
        fromLatitude: _fromLocation.latitude,
        fromLongitude: _fromLocation.longitude,
        toLatitude: _toLocation!.latitude,
        toLongitude: _toLocation!.longitude,
      );
      final geometry = route['geometry'] as List? ?? const [];
      if (geometry.length < 2) throw StateError('Route geometry is empty.');
      final distance = (route['distance_m'] as num?)?.toDouble();
      final duration = (route['duration_s'] as num?)?.toDouble();
      if (distance == null ||
          duration == null ||
          !distance.isFinite ||
          !duration.isFinite ||
          distance <= 0 ||
          duration <= 0) {
        throw StateError('Route measurements are unavailable.');
      }
      if (!mounted || generation != _routeRequestGeneration) return;
      setState(() {
        _routePoints = geometry.map((coordinate) {
          final pair = coordinate as List;
          return LatLng(
            (pair[1] as num).toDouble(),
            (pair[0] as num).toDouble(),
          );
        }).toList();
        _routeDistance = distance;
        _routeDuration = duration;
      });
      _scheduleMapDataSync();
      _animateCameraToBounds();
    } catch (e) {
      if (mounted && generation == _routeRequestGeneration) {
        setState(() {
          _routePoints = [];
          _routeDistance = null;
          _routeDuration = null;
          _routeError =
              'Route unavailable. Retry to get road distance and travel time.';
        });
        _scheduleMapDataSync();
      }
    } finally {
      if (mounted && generation == _routeRequestGeneration) {
        setState(() => _isFetchingRoute = false);
      }
    }
  }

  Future<void> _loadRideQuotes() async {
    if (_isRequestingQuote) return;
    if (_isMapDragging ||
        !_hasPickupLocation ||
        _toLocation == null ||
        _fromController.text.trim().isEmpty ||
        _toController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Choose a pickup and destination from search or on the map.',
          ),
        ),
      );
      return;
    }
    final generation = _routeRequestGeneration;
    setState(() => _isRequestingQuote = true);
    try {
      final quote = await _userRepository.requestQuote({
        'pickup': {
          'address': _fromController.text.trim(),
          'latitude': _fromLocation.latitude,
          'longitude': _fromLocation.longitude,
        },
        'dropoff': {
          'address': _toController.text.trim(),
          'latitude': _toLocation!.latitude,
          'longitude': _toLocation!.longitude,
        },
      });
      if (!mounted || generation != _routeRequestGeneration) return;
      final quoteItems = List<Map<String, dynamic>>.from(
        (quote['quotes'] as List? ?? []).map(
          (item) => Map<String, dynamic>.from(item as Map),
        ),
      );
      if (quoteItems.isEmpty) throw StateError(UserAppCopy.QUOTE_FAILED);
      setState(() {
        _quoteDraftId = '${quote['id']}';
        _rideQuotes = quoteItems;
        _selectedVehicleIndex = 0;
        _routeError = null;
        _routeDistance = (quoteItems.first['distance_m'] as num?)?.toDouble();
        _routeDuration = (quoteItems.first['duration_s'] as num?)?.toDouble();
        final policy =
            (quoteItems.first['category_snapshot'] as Map?)?['payment_policy']
                as Map?;
        _bookingMethod = policy?['cash_enabled'] == false ? 'UPI' : 'CASH';
        _isSelectingVehicle = true;
      });
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _isRequestingQuote = false);
    }
  }

  Future<void> _bookSelectedRide() async {
    if (_isRequestingQuote) return;
    setState(() => _isRequestingQuote = true);
    await _checkTravel();
    if (!mounted) return;
    if (_activeRide != null) {
      setState(() => _isRequestingQuote = false);
      _resumeActive();
      return;
    }
    final selected = _selectedVehicleIndex;
    if (_quoteDraftId == null ||
        selected == null ||
        selected >= _rideQuotes.length) {
      setState(() => _isRequestingQuote = false);
      return;
    }
    setState(() => _isRequestingQuote = true);
    BookingReviewResult? result;
    try {
      result = await showModalBottomSheet<BookingReviewResult>(
        context: context,
        isScrollControlled: true,
        isDismissible: false,
        enableDrag: false,
        useSafeArea: true,
        builder: (_) => BookingReviewSheet(
          draftId: _quoteDraftId!,
          pickup: _fromController.text.trim(),
          dropoff: _toController.text.trim(),
          method: _bookingMethod,
          quote: _rideQuotes[selected],
          repository: _userRepository,
        ),
      );
    } finally {
      if (mounted) setState(() => _isRequestingQuote = false);
    }
    if (!mounted) return;
    if (result == null) {
      setState(
        () => _isSelectingVehicle =
            _quoteDraftId != null && _rideQuotes.isNotEmpty,
      );
      return;
    }
    if (result.refresh) {
      await _loadRideQuotes();
      return;
    }
    if (result.rideId != null) {
      Navigator.pushNamed(
        context,
        AppRoutes.rideDetail,
        arguments: result.rideId,
      );
    }
  }

  void _animateCameraToBounds() {
    if (_routePoints.isEmpty) return;

    double minLat = _routePoints.first.latitude;
    double maxLat = _routePoints.first.latitude;
    double minLng = _routePoints.first.longitude;
    double maxLng = _routePoints.first.longitude;

    for (var point in _routePoints) {
      if (point.latitude < minLat) minLat = point.latitude;
      if (point.latitude > maxLat) maxLat = point.latitude;
      if (point.longitude < minLng) minLng = point.longitude;
      if (point.longitude > maxLng) maxLng = point.longitude;
    }

    final bounds = LatLngBounds(
      southwest: LatLng(minLat, minLng),
      northeast: LatLng(maxLat, maxLng),
    );
    unawaited(_fitRouteBoundsAndTilt(bounds));
  }

  Future<void> _fitRouteBoundsAndTilt(LatLngBounds bounds) async {
    final controller = _mapController;
    if (controller == null) return;
    _isProgrammaticMapMove = true;
    try {
      await controller.animateCamera(
        CameraUpdate.newLatLngBounds(
          bounds,
          left: 40.r,
          top: 40.r,
          right: 40.r,
          bottom: 40.r,
        ),
        duration: const Duration(milliseconds: 700),
      );
      final camera = await controller.queryCameraPosition();
      if (camera == null) return;
      await controller.animateCamera(
        CameraUpdate.newCameraPosition(
          CameraPosition(
            target: camera.target,
            zoom: camera.zoom,
            bearing: camera.bearing,
            tilt: HomeConstants.MAP_TILT,
          ),
        ),
        duration: const Duration(milliseconds: 350),
      );
    } finally {
      _isProgrammaticMapMove = false;
    }
  }

  void _onSuggestionSelected(dynamic suggestion) {
    _debounce?.cancel();
    _routeSettleTimer?.cancel();
    _routeRequestGeneration++;
    _searchGeneration++;
    _pendingSuggestions = null;
    _pendingSuggestionQuery = null;
    _pendingSuggestionField = null;
    _mapPickField = null;
    final displayName = suggestion['display_name'] ?? '';
    final shortName = displayName.split(',').first;

    final lat = _coordinateValue(suggestion['lat']);
    final lon = _coordinateValue(suggestion['lon']);
    if (lat == null ||
        lon == null ||
        !lat.isFinite ||
        !lon.isFinite ||
        lat.abs() > 90 ||
        lon.abs() > 180) {
      return;
    }
    final newLoc = LatLng(lat, lon);

    setState(() {
      _suggestions = [];
      _invalidateRouteChoice();
      _isMapDragging = false;
      if (_activeField == SearchField.from) {
        _setSearchText(_fromController, shortName);
        _fromLocation = newLoc;
        _hasPickupLocation = true;
        _pickupChosenManually = true;
        _fromFocus.unfocus();
      } else if (_activeField == SearchField.to) {
        _hasExpandedSearch = true;
        _setSearchText(_toController, shortName);
        _toLocation = newLoc;
        _toFocus.unfocus();
      }
      _activeField = SearchField.none;
    });
    _scheduleMapDataSync();

    if (!(_hasPickupLocation && _toLocation != null)) {
      _animatedMapMove(newLoc, 16.0, 0.0);
    }

    if (_hasPickupLocation && _toLocation != null) {
      _fetchRoute();
    }
  }

  void _animatedMapMove(
    LatLng destLocation,
    double destZoom,
    double destRotation,
  ) {
    final controller = _mapController;
    if (controller == null) return;
    _isProgrammaticMapMove = true;
    unawaited(() async {
      try {
        await controller.animateCamera(
          CameraUpdate.newCameraPosition(
            CameraPosition(
              target: destLocation,
              zoom: destZoom,
              bearing: destRotation,
              tilt: HomeConstants.MAP_TILT,
            ),
          ),
          duration: const Duration(milliseconds: 900),
        );
      } finally {
        _isProgrammaticMapMove = false;
      }
    }());
  }

  void _onMapCreated(MapLibreMapController controller) {
    _mapController = controller;
    unawaited(
      controller.moveCamera(
        CameraUpdate.newCameraPosition(
          CameraPosition(
            target: _fromLocation,
            zoom: HomeConstants.DEFAULT_ZOOM,
            tilt: HomeConstants.MAP_TILT,
          ),
        ),
      ),
    );
  }

  Future<void> _onMapStyleLoaded() async {
    final controller = _mapController;
    if (controller == null) return;
    try {
      final devicePixelRatio = MediaQuery.devicePixelRatioOf(context);
      _mapMarkerIconScale = 1 / devicePixelRatio;
      await controller.addGeoJsonSource('home-route', _emptyFeatureCollection);
      await controller.addLineLayer(
        'home-route',
        'home-route-line',
        LineLayerProperties(
          lineColor: '#2563EB',
          lineWidth: 5.r,
          lineCap: 'round',
          lineJoin: 'round',
        ),
        enableInteraction: false,
      );
      await controller.addImage(
        'home-from-pin',
        await _buildPreviousMarkerImage(
          color: Colors.black,
          trianglePointsDown: false,
        ),
      );
      await controller.addImage(
        'home-to-pin',
        await _buildPreviousMarkerImage(
          color: Colors.green,
          trianglePointsDown: true,
        ),
      );
      await controller.addImage(
        'home-saved-pin',
        await _buildPreviousMarkerImage(
          color: const Color(0xFFEA580C),
          trianglePointsDown: false,
        ),
      );
      await controller.setSymbolIconAllowOverlap(true);
      await controller.setSymbolIconIgnorePlacement(true);
      await controller.setSymbolTextAllowOverlap(true);
      await controller.setSymbolTextIgnorePlacement(true);
      _mapStyleReady = true;
      await _syncMapData();
      await _syncUserLocationPuck();
    } catch (error) {
      debugPrint('MapLibre style setup failed: $error');
    }
  }

  Future<Uint8List> _buildPreviousMarkerImage({
    required Color color,
    required bool trianglePointsDown,
  }) async {
    final width = 28.r;
    final height = 40.r;
    final devicePixelRatio = MediaQuery.devicePixelRatioOf(context);
    final recorder = PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.scale(devicePixelRatio);
    final center = Offset(width / 2, 12.r);
    final circle = Path()
      ..addOval(Rect.fromCircle(center: center, radius: 12.r));
    canvas.drawShadow(circle, color.withValues(alpha: 0.3), 4, true);
    canvas.drawCircle(center, 12.r, Paint()..color = color);
    final triangle = Path();
    if (trianglePointsDown) {
      triangle
        ..moveTo(width / 2, 16.r)
        ..lineTo(width / 2 + 4.5.r, 8.r)
        ..lineTo(width / 2 - 4.5.r, 8.r);
    } else {
      triangle
        ..moveTo(width / 2, 8.r)
        ..lineTo(width / 2 + 4.5.r, 16.r)
        ..lineTo(width / 2 - 4.5.r, 16.r);
    }
    triangle.close();
    canvas.drawPath(triangle, Paint()..color = Colors.white);
    canvas.drawRect(
      Rect.fromCenter(
        center: Offset(width / 2, 32.r),
        width: 2.r,
        height: 16.r,
      ),
      Paint()..color = color.withValues(alpha: 0.2),
    );
    canvas.drawRect(
      Rect.fromCenter(
        center: Offset(width / 2, 32.r),
        width: 2.r,
        height: 16.r,
      ),
      Paint()..color = color,
    );

    final image = await recorder.endRecording().toImage(
      (width * devicePixelRatio).round(),
      (height * devicePixelRatio).round(),
    );
    final data = await image.toByteData(format: ImageByteFormat.png);
    image.dispose();
    if (data == null) throw StateError('Could not create map pin image.');
    return data.buffer.asUint8List();
  }

  Future<void> _syncUserLocationPuck() async {
    final controller = _mapController;
    final location = _currentDeviceLocation;
    if (!_mapStyleReady || controller == null || location == null) return;

    try {
      await controller.updateManualLocation(
        ManualLocationUpdate(target: location),
      );
    } catch (error) {
      debugPrint('MapLibre user location update failed: $error');
    }
  }

  void _onMapCameraMove(CameraPosition position) {
    final pickField =
        _mapPickField ??
        (_activeField == SearchField.none ? null : _activeField);
    if (_isProgrammaticMapMove || pickField == null) return;
    _pendingMapCenter = position.target;
    _routeRequestGeneration++;
    if (!_isMapDragging && mounted) {
      setState(() {
        _isMapDragging = true;
        _invalidateRouteChoice();
        if (pickField == SearchField.from) {
          _hasPickupLocation = false;
          _pickupChosenManually = true;
        }
        _suggestions = [];
      });
      _scheduleMapDataSync();
    }
    _routeSettleTimer?.cancel();
    _routeSettleTimer = Timer(const Duration(seconds: 3), () async {
      final center = _pendingMapCenter;
      if (center == null || !mounted) return;
      final settledField =
          _mapPickField ??
          (_activeField == SearchField.none ? null : _activeField);
      if (settledField == null) return;
      setState(() {
        _isMapDragging = false;
        if (settledField == SearchField.from) {
          _fromLocation = center;
          _hasPickupLocation = true;
          _pickupChosenManually = true;
          _setSearchText(
            _fromController,
            '${center.latitude.toStringAsFixed(5)}, ${center.longitude.toStringAsFixed(5)}',
          );
        } else if (settledField == SearchField.to) {
          _toLocation = center;
          _setSearchText(
            _toController,
            '${center.latitude.toStringAsFixed(5)}, ${center.longitude.toStringAsFixed(5)}',
          );
        }
        _activeField = SearchField.none;
      });
      _fromFocus.unfocus();
      _toFocus.unfocus();
      _scheduleMapDataSync();
      await _reverseGeocode(center, overrideField: settledField);
      if (mounted && _toLocation != null) await _fetchRoute();
    });
  }

  void _scheduleMapDataSync() {
    _mapDataSyncTimer?.cancel();
    _mapDataSyncTimer = Timer(const Duration(milliseconds: 80), _syncMapData);
  }

  Future<void> _syncMapData() async {
    final controller = _mapController;
    if (!_mapStyleReady || controller == null) return;

    final routeFeatures = _routePoints.length < 2
        ? <Map<String, dynamic>>[]
        : [
            {
              'type': 'Feature',
              'properties': <String, dynamic>{},
              'geometry': {
                'type': 'LineString',
                'coordinates': _routePoints
                    .map((point) => [point.longitude, point.latitude])
                    .toList(),
              },
            },
          ];
    final markerSymbols = <SymbolOptions>[];
    if (_hasPickupLocation &&
        !(_isMapDragging && _mapPickField == SearchField.from)) {
      markerSymbols.add(
        _markerSymbol(
          _fromLocation,
          _fromController.text.isNotEmpty
              ? _fromController.text
              : 'Current location',
          'home-from-pin',
        ),
      );
    }
    if (_toLocation != null &&
        !(_isMapDragging && _mapPickField == SearchField.to)) {
      markerSymbols.add(
        _markerSymbol(
          _toLocation!,
          _toController.text.isNotEmpty ? _toController.text : 'Destination',
          'home-to-pin',
        ),
      );
    }
    for (final place in _savedPlaces) {
      final latitude = _coordinateValue(place['latitude']);
      final longitude = _coordinateValue(place['longitude']);
      if (latitude == null || longitude == null) continue;
      final label = '${place['label'] ?? ''}'.trim();
      markerSymbols.add(
        _markerSymbol(
          LatLng(latitude, longitude),
          label.isEmpty ? 'Saved place' : label,
          'home-saved-pin',
        ),
      );
    }
    try {
      await controller.setGeoJsonSource('home-route', {
        'type': 'FeatureCollection',
        'features': routeFeatures,
      });
      await controller.clearSymbols();
      if (markerSymbols.isNotEmpty) {
        await controller.addSymbols(markerSymbols);
      }
    } catch (error) {
      debugPrint('MapLibre feature update failed: $error');
    }
  }

  SymbolOptions _markerSymbol(LatLng point, String label, String icon) =>
      SymbolOptions(
        geometry: point,
        iconImage: icon,
        iconSize: _mapMarkerIconScale,
        iconAnchor: 'bottom',
        textField: label,
        textSize: 12,
        textColor: '#1F2937',
        textHaloColor: '#FFFFFF',
        textHaloWidth: 2,
        textOffset: const Offset(0, 1.3),
        textAnchor: 'top',
      );

  double? _coordinateValue(dynamic value) =>
      value is num ? value.toDouble() : double.tryParse('${value ?? ''}');

  static const Map<String, dynamic> _emptyFeatureCollection = {
    'type': 'FeatureCollection',
    'features': <Map<String, dynamic>>[],
  };

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.dark.copyWith(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
        statusBarBrightness: Brightness.light,
      ),
      child: Scaffold(
        key: _scaffoldKey,
        backgroundColor: Colors.white,
        body: Stack(
          children: [
            // Layer 0: tilted vector map with 3D buildings.
            MapLibreMap(
              initialCameraPosition: CameraPosition(
                target: _fromLocation,
                zoom: HomeConstants.DEFAULT_ZOOM,
                tilt: HomeConstants.MAP_TILT,
              ),
              styleString: HomeConstants.MAP_STYLE_URL,
              locationSource: const ManualLocationSource(),
              myLocationEnabled: true,
              myLocationRenderMode: MyLocationRenderMode.normal,
              onMapCreated: _onMapCreated,
              onStyleLoadedCallback: _onMapStyleLoaded,
              onCameraMove: _onMapCameraMove,
              trackCameraPosition: true,
              tiltGesturesEnabled: true,
              attributionButtonPosition: AttributionButtonPosition.topRight,
              attributionButtonMargins: math.Point<double>(12.r, 132.r),
            ),

            if (_mapPickField != null &&
                (_isMapDragging || _activeField != SearchField.none))
              Positioned.fill(
                child: IgnorePointer(
                  child: Center(
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      transform: Matrix4.translationValues(
                        0,
                        _isMapDragging ? -15.r : 0,
                        0,
                      ),
                      child: _buildMarkerWidget(
                        isGreen: _mapPickField == SearchField.to,
                      ),
                    ),
                  ),
                ),
              ),

            // Layer 1: Top Action Buttons
            _buildLayer1(context),
            if (_activeRide != null)
              Positioned(
                top: MediaQuery.paddingOf(context).top + 80.r,
                left: 20.r,
                right: 80.r,
                child: FilledButton.icon(
                  onPressed: _resumeActive,
                  icon: const Icon(Icons.directions_car_outlined),
                  label: const Text('Resume your active trip'),
                ),
              ),

            // Refresh Location Button (Layer 0 actions)
            if (!_isLoading)
              Positioned(
                top: MediaQuery.paddingOf(context).top + 80.r,
                right: 20.r,
                child: GestureDetector(
                  onTap: _refreshLocation,
                  child: _buildGlassButton(
                    child: _isRefreshing
                        ? SizedBox(
                            width: 18.r,
                            height: 18.r,
                            child: CircularProgressIndicator(
                              strokeWidth: 2.r,
                              color: Colors.black87,
                            ),
                          )
                        : Icon(Iconsax.gps, color: Colors.black87, size: 22.r),
                  ),
                ),
              ),

            // Layer 2: Bottom Sheet
            _buildLayer2(context),

            // Layer L: Loading Layout (Animated Fade Out for background)
            Positioned.fill(
              child: IgnorePointer(
                ignoring: !(_isLoading || _isSearchingDriver),
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 1000),
                  curve: Curves.easeInOut,
                  opacity: (_isLoading || _isSearchingDriver) ? 1.0 : 0.0,
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        center: Alignment.center,
                        radius:
                            0.75, // Smaller radius means white starts earlier
                        colors: [
                          Colors.white.withValues(alpha: 0.0),
                          Colors.white.withValues(alpha: 0.6),
                          Colors.white,
                        ],
                        stops: const [0.0, 0.4, 1.0],
                      ),
                    ),
                  ),
                ),
              ),
            ),

            // Loading Text (Animated Fade Out - faster)
            Positioned(
              top: MediaQuery.paddingOf(context).top + 30.r,
              left: 0,
              right: 0,
              child: IgnorePointer(
                ignoring: !(_isLoading || _isSearchingDriver),
                child: AnimatedOpacity(
                  duration: const Duration(milliseconds: 800),
                  curve: Curves.easeInOut,
                  opacity: (_isLoading || _isSearchingDriver) ? 1.0 : 0.0,
                  child: _buildTopHeader(context),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLayer1(BuildContext context) {
    return Positioned(
      top: MediaQuery.paddingOf(context).top + 10.r,
      left: 20.r,
      right: 20.r,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Profile Button
          GestureDetector(
            onTap: () async {
              await Navigator.pushNamed(context, AppRoutes.settings);
              if (mounted) await _loadProfileAvatar();
            },
            child: _buildGlassButton(
              child: _profileAvatarUrl == null
                  ? Icon(
                      Icons.person_outline,
                      size: 25.r,
                      color: Colors.black87,
                    )
                  : ClipOval(
                      child: Image.network(
                        _profileAvatarUrl!,
                        width: 44.r,
                        height: 44.r,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Icon(
                          Icons.person_outline,
                          size: 25.r,
                          color: Colors.black87,
                        ),
                      ),
                    ),
            ),
          ),
          // Notification Button
          AppLogo(width: 112.r, height: 44.r),
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, AppRoutes.notifications),
            child: _buildGlassButton(
              child: Icon(
                Iconsax.notification,
                color: Colors.black87,
                size: 24.r,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGlassButton({required Widget child}) {
    return Container(
      width: 50.r,
      height: 50.r,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10.r,
            offset: Offset(0, 4.r),
          ),
        ],
      ),
      child: ClipOval(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12.r, sigmaY: 12.r),
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.35),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.5),
                width: 1.5.r,
              ),
            ),
            alignment: Alignment.center,
            child: child,
          ),
        ),
      ),
    );
  }

  Widget _buildTopHeader(BuildContext context) {
    return Column(
      children: [
        AppLogo(width: 112.r, height: 44.r),
        SizedBox(height: 6.r),
        Icon(
          _isSearchingDriver ? Icons.search : Icons.motorcycle,
          size: 30.r,
          color: Colors.black87,
        ),
        SizedBox(height: 12.r),
        Text(
          _isSearchingDriver
              ? "Searching for drivers..."
              : HomeConstants.TEXT_LOCATING_YOU,
          style: TextStyle(
            color: Colors.black,
            fontSize: 24.r,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }

  Widget _buildMarkerWidget({required bool isGreen}) {
    final color = isGreen ? Colors.green : Colors.black;
    return Transform.translate(
      offset: Offset(0, -20.r),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 24.r,
            height: 24.r,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.3),
                  blurRadius: 8.r,
                  offset: Offset(0, 4.r),
                ),
              ],
            ),
            child: Center(
              child: Transform.rotate(
                angle: isGreen ? math.pi : 0,
                child: CustomPaint(
                  size: Size(9.r, 8.r),
                  painter: _TrianglePainter(color: Colors.white),
                ),
              ),
            ),
          ),
          Container(
            width: 2.r,
            height: 16.r,
            decoration: BoxDecoration(
              color: color,
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.2),
                  blurRadius: 2.r,
                  offset: Offset(1.r, 0),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLayer2(BuildContext context) {
    final isSearching = _activeField != SearchField.none;
    final showBothFields = _hasExpandedSearch;

    String titleText = HomeConstants.TEXT_GOOD_TIME;
    if (_isFetchingRoute && !isSearching) {
      titleText = 'Finding route…';
    } else if (_routeDistance != null && !isSearching) {
      titleText = "${(_routeDistance! / 1000).toStringAsFixed(1)} km";
    }

    final vehicles = _rideQuotes.map((quote) {
      final kind = '${quote['vehicle_type'] ?? 'BIKE'}';
      final vehicleName = kind[0] + kind.substring(1).toLowerCase();
      final snapshot = quote['category_snapshot'];
      final category = snapshot is Map ? snapshot : const <String, dynamic>{};
      final configuredImage = '${category['image_url'] ?? ''}'.trim();
      return <String, dynamic>{
        'quote_id': quote['id'],
        'name': '${category['name'] ?? vehicleName}',
        'capacity': (category['capacity'] as num?)?.toInt() ?? 1,
        'family': kind,
        'time': '${((quote['duration_s'] as num? ?? 0) / 60).ceil()} min',
        'price': num.tryParse('${quote['total_fare']}')?.toDouble() ?? 0,
        'image': configuredImage.isNotEmpty
            ? configuredImage
            : HomeConstants.VEHICLE_IMAGE_URLS[kind] ??
                  HomeConstants.VEHICLE_IMAGE_URLS['BIKE'],
      };
    }).toList();
    final hasSelectedRoute =
        _hasPickupLocation && _toLocation != null && !isSearching;
    final showRouteClock = hasSelectedRoute && !_isSelectingVehicle;

    return Positioned(
      bottom: MediaQuery.paddingOf(context).bottom + 10.r,
      left: 16.r,
      right: 16.r,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Main Container
          ClipRRect(
            borderRadius: BorderRadius.circular(28.r),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 15.r, sigmaY: 15.r),
              child: Container(
                padding: EdgeInsets.fromLTRB(
                  24.r,
                  showRouteClock ? 44.r : 24.r,
                  24.r,
                  24.r,
                ),
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(28.r),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.3),
                    width: 1.5.r,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_isSelectingVehicle) ...[
                      SizedBox(
                        height: 220.r,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: vehicles.length,
                          separatorBuilder: (context, index) =>
                              SizedBox(width: 12.r),
                          itemBuilder: (context, index) {
                            final vehicle = vehicles[index];
                            final isSelected = _selectedVehicleIndex == index;

                            final cardContent = Container(
                              width: 140.r,
                              padding: EdgeInsets.all(10.r),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? Colors.white
                                    : Colors.white.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(15.r),
                                border: isSelected
                                    ? Border.all(
                                        color: Colors.white,
                                        width: 2.r,
                                      )
                                    : Border.all(
                                        color: Colors.white.withValues(
                                          alpha: 0.3,
                                        ),
                                      ),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(10.r),
                                    child: Image.network(
                                      vehicle['image'] as String,
                                      height: 64.r,
                                      width: double.infinity,
                                      fit: BoxFit.cover,
                                      errorBuilder:
                                          (context, error, stackTrace) =>
                                              SizedBox(
                                                height: 64.r,
                                                child: Center(
                                                  child: Icon(
                                                    vehicle['family'] ==
                                                                'BIKE' ||
                                                            vehicle['family'] ==
                                                                'SCOOTER'
                                                        ? Icons.two_wheeler
                                                        : Icons.directions_car,
                                                    size: 36.r,
                                                    color: isSelected
                                                        ? Colors.black54
                                                        : Colors.white70,
                                                  ),
                                                ),
                                              ),
                                    ),
                                  ),
                                  SizedBox(height: 8.r),
                                  Text(
                                    vehicle['name'] as String,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: TextStyle(
                                      color: isSelected
                                          ? Colors.black
                                          : Colors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 15.r,
                                    ),
                                  ),
                                  SizedBox(height: 4.r),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Row(
                                        children: [
                                          Icon(
                                            Icons.person,
                                            size: 11.r,
                                            color: isSelected
                                                ? Colors.black54
                                                : Colors.white70,
                                          ),
                                          SizedBox(width: 4.r),
                                          Text(
                                            '${vehicle['capacity']}',
                                            style: TextStyle(
                                              color: isSelected
                                                  ? Colors.black54
                                                  : Colors.white70,
                                              fontSize: 11.r,
                                            ),
                                          ),
                                        ],
                                      ),
                                      Text(
                                        vehicle['time'] as String,
                                        style: TextStyle(
                                          color: isSelected
                                              ? Colors.black54
                                              : Colors.white70,
                                          fontSize: 11.r,
                                        ),
                                      ),
                                    ],
                                  ),
                                  const Spacer(),
                                  Text(
                                    '₹${(vehicle['price'] as num).toStringAsFixed(0)}',
                                    style: TextStyle(
                                      color: isSelected
                                          ? Colors.black
                                          : Colors.white,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 17.r,
                                    ),
                                  ),
                                ],
                              ),
                            );

                            return GestureDetector(
                              onTap: () =>
                                  setState(() => _selectedVehicleIndex = index),
                              child: isSelected
                                  ? Container(
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(
                                          15.r,
                                        ),
                                        boxShadow: [
                                          BoxShadow(
                                            color: Colors.black.withValues(
                                              alpha: 0.2,
                                            ),
                                            blurRadius: 10.r,
                                            offset: Offset(0, 5.r),
                                          ),
                                        ],
                                      ),
                                      clipBehavior: Clip.antiAlias,
                                      child: Column(
                                        children: [
                                          Expanded(child: cardContent),
                                          GestureDetector(
                                            onTap: () async {
                                              setState(() {
                                                _isSelectingVehicle = false;
                                                _isSearchingDriver = true;
                                              });
                                              await _bookSelectedRide();
                                              if (mounted) {
                                                setState(
                                                  () => _isSearchingDriver =
                                                      false,
                                                );
                                              }
                                            },
                                            child: Container(
                                              padding: EdgeInsets.symmetric(
                                                vertical: 12.r,
                                              ),
                                              width: 140.r,
                                              color: Colors.yellow.shade600,
                                              alignment: Alignment.center,
                                              child: Text(
                                                "Book Now",
                                                style: TextStyle(
                                                  fontWeight: FontWeight.bold,
                                                  fontSize: 14.r,
                                                ),
                                              ),
                                            ),
                                          ),
                                        ],
                                      ),
                                    )
                                  : Align(
                                      alignment: Alignment.topCenter,
                                      child: SizedBox(
                                        height: 180.r,
                                        child: cardContent,
                                      ),
                                    ),
                            );
                          },
                        ),
                      ),
                    ],
                    if (_isSelectingVehicle)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: LiquidGlassDropdownFormField<String>(
                          key: ValueKey('booking-payment-$_quoteDraftId'),
                          initialValue: _bookingMethod,
                          decoration: const InputDecoration(
                            labelText: 'Pay driver after ride',
                          ),
                          items: [
                            if (((_rideQuotes.firstOrNull?['category_snapshot']
                                        as Map?)?['payment_policy']
                                    as Map?)?['cash_enabled'] !=
                                false)
                              const DropdownMenuItem(
                                value: 'CASH',
                                child: Text('Cash'),
                              ),
                            if (((_rideQuotes.firstOrNull?['category_snapshot']
                                        as Map?)?['payment_policy']
                                    as Map?)?['direct_upi_enabled'] ==
                                true)
                              const DropdownMenuItem(
                                value: 'UPI',
                                child: Text('Direct UPI'),
                              ),
                          ],
                          onChanged: _isRequestingQuote
                              ? null
                              : (value) => setState(
                                  () => _bookingMethod = value ?? 'CASH',
                                ),
                        ),
                      ),
                    // Persistent Title Section
                    if (!isSearching && !_isSelectingVehicle) ...[
                      if (hasSelectedRoute)
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    titleText,
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 20.r,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  SizedBox(height: 6.r),
                                  Row(
                                    children: [
                                      Icon(
                                        Iconsax.clock,
                                        color: Colors.white.withValues(
                                          alpha: 0.8,
                                        ),
                                        size: 16.r,
                                      ),
                                      SizedBox(width: 5.r),
                                      Text(
                                        HomeConstants.TEXT_NOW,
                                        style: TextStyle(
                                          color: Colors.white.withValues(
                                            alpha: 0.8,
                                          ),
                                          fontSize: 14.r,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        )
                      else ...[
                        Text(
                          titleText,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 20.r,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        SizedBox(height: 2.r),
                        Text(
                          HomeConstants.TEXT_NOW,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.8),
                            fontSize: 14.r,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        SizedBox(height: 24.r),
                      ],
                    ],

                    if (showBothFields && !_isSelectingVehicle)
                      Align(
                        alignment: Alignment.centerRight,
                        child: GestureDetector(
                          onTap: () {
                            setState(() {
                              _debounce?.cancel();
                              _searchGeneration++;
                              _pendingSuggestions = null;
                              _pendingSuggestionQuery = null;
                              _pendingSuggestionField = null;
                              _mapPickField = null;
                              _activeField = SearchField.none;
                              _hasExpandedSearch = false;
                              _suggestions = [];
                              _isFetchingSuggestions = false;
                              FocusScope.of(context).unfocus();
                            });
                            _scheduleMapDataSync();
                          },
                          child: Container(
                            margin: EdgeInsets.only(bottom: 12.r),
                            padding: EdgeInsets.all(8.r),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              shape: BoxShape.circle,
                              boxShadow: [
                                BoxShadow(
                                  color: Colors.black12,
                                  blurRadius: 4.r,
                                  offset: Offset(0, 2.r),
                                ),
                              ],
                            ),
                            child: Icon(
                              Icons.keyboard_arrow_down,
                              size: 24.r,
                              color: Colors.black87,
                            ),
                          ),
                        ),
                      ),

                    // Suggestions List (shows above text fields)
                    if (isSearching && _suggestions.isNotEmpty)
                      Container(
                        constraints: BoxConstraints(maxHeight: 180.r),
                        margin: EdgeInsets.only(bottom: 12.r),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(15.r),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.1),
                              blurRadius: 10.r,
                              offset: Offset(0, 4.r),
                            ),
                          ],
                        ),
                        child: ListView.separated(
                          shrinkWrap: true,
                          padding: EdgeInsets.all(8.r),
                          itemCount: _suggestions.length,
                          separatorBuilder: (context, index) =>
                              Divider(height: 1.r),
                          itemBuilder: (context, index) {
                            final item = _suggestions[index];
                            return ListTile(
                              leading: Icon(
                                Iconsax.location,
                                color: Colors.grey.shade400,
                              ),
                              title: Text(
                                item['display_name'] ?? '',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 14.r,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.black87,
                                ),
                              ),
                              onTap: () => _onSuggestionSelected(item),
                            );
                          },
                        ),
                      ),

                    // Search Box Area
                    Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(15.r),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.05),
                            blurRadius: 10.r,
                            offset: Offset(0, 4.r),
                          ),
                        ],
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Container(
                            padding: EdgeInsets.symmetric(
                              horizontal: 16.r,
                              vertical: 12.r,
                            ),
                            color: Colors.white,
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      // From Field
                                      _buildSearchField(
                                        label: "From",
                                        controller: _fromController,
                                        focusNode: _fromFocus,
                                        field: SearchField.from,
                                        isSearching: isSearching,
                                        isCollapsed: !showBothFields,
                                      ),

                                      if (showBothFields) ...[
                                        Padding(
                                          padding: EdgeInsets.symmetric(
                                            vertical: 4.r,
                                          ),
                                          child: Divider(
                                            height: 1.r,
                                            color: Colors.black12,
                                          ),
                                        ),
                                        // To Field
                                        _buildSearchField(
                                          label: "To",
                                          controller: _toController,
                                          focusNode: _toFocus,
                                          field: SearchField.to,
                                          isSearching: isSearching,
                                          isCollapsed: !showBothFields,
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                if (_isFetchingSuggestions)
                                  SizedBox(
                                    width: 24.r,
                                    height: 24.r,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2.5.r,
                                    ),
                                  )
                                else if (!showBothFields)
                                  Icon(
                                    Iconsax.search_normal,
                                    color: Colors.grey.shade400,
                                    size: 20.r,
                                  ),
                              ],
                            ),
                          ),
                          if (_routeError != null &&
                              !isSearching &&
                              !_isSelectingVehicle)
                            TextButton(
                              onPressed: _isFetchingRoute ? null : _fetchRoute,
                              child: Text(
                                _routeError!,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          if (!isSearching &&
                              !_isSelectingVehicle &&
                              _toLocation != null)
                            GestureDetector(
                              onTap: _isRequestingQuote
                                  ? null
                                  : _loadRideQuotes,
                              child: Container(
                                padding: EdgeInsets.symmetric(vertical: 8.r),
                                color: Colors.yellow.shade600,
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Icon(
                                      Icons.motorcycle,
                                      color: Colors.black,
                                      size: 15.r,
                                    ),
                                    SizedBox(width: 20.r),
                                    Text(
                                      _isRequestingQuote
                                          ? 'Finding ride options…'
                                          : UserAppCopy.SELECT_RIDE,
                                      style: TextStyle(
                                        color: Colors.black,
                                        fontSize: 14.r,
                                        fontWeight: FontWeight.w500,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (showRouteClock)
            Positioned(top: -32.r, right: 16.r, child: _buildEtaBadge()),
        ],
      ),
    );
  }

  Widget _buildSearchField({
    required String label,
    required TextEditingController controller,
    required FocusNode focusNode,
    required SearchField field,
    required bool isSearching,
    bool isCollapsed = false,
  }) {
    return GestureDetector(
      onTap: () {
        _routeSettleTimer?.cancel();
        _routeRequestGeneration++;
        setState(() {
          if (_activeField != field) {
            _debounce?.cancel();
            _searchGeneration++;
            _pendingSuggestions = null;
            _pendingSuggestionQuery = null;
            _pendingSuggestionField = null;
            _suggestions = [];
            _isFetchingSuggestions = false;
          }
          _activeField = field;
          _mapPickField = field;
          _hasExpandedSearch = true;
          _routePoints = [];
          _routeDistance = null;
          _routeDuration = null;
          _isFetchingRoute = false;
        });
        _scheduleMapDataSync();
        focusNode.requestFocus();
        if (field == SearchField.from &&
            controller.text == HomeConstants.TEXT_HOME) {
          controller.clear();
        }
        // Pan map to the corresponding location when field is focused
        final loc = field == SearchField.from ? _fromLocation : _toLocation;
        if (loc != null) {
          _animatedMapMove(loc, 16.0, 0.0);
        }
      },
      child: Container(
        color: Colors.transparent, // Ensures the whole area is tappable
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isCollapsed ? HomeConstants.TEXT_LETS_GO : label,
                    style: TextStyle(
                      color: Colors.grey.shade600,
                      fontSize: 10.r,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  SizedBox(height: 2.r),
                  isSearching && !isCollapsed
                      ? TextField(
                          controller: controller,
                          focusNode: focusNode,
                          decoration: InputDecoration(
                            border: InputBorder.none,
                            isDense: true,
                            contentPadding: EdgeInsets.zero,
                            hintText: "Search location...",
                            hintStyle: TextStyle(
                              color: Colors.grey.shade400,
                              fontSize: 15.r,
                            ),
                          ),
                          onTap: () {
                            setState(() => _activeField = field);
                            _scheduleMapDataSync();
                          },
                          onSubmitted: (_) {
                            focusNode.unfocus();
                            WidgetsBinding.instance.addPostFrameCallback((_) {
                              _showPendingSuggestions();
                            });
                          },
                          style: TextStyle(
                            color: Colors.black,
                            fontSize: 15.r,
                            fontWeight: FontWeight.w700,
                          ),
                        )
                      : Text(
                          controller.text.isEmpty
                              ? 'Select location'
                              : controller.text,
                          style: TextStyle(
                            color: Colors.black,
                            fontSize: 15.r,
                            fontWeight: FontWeight.w800,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                ],
              ),
            ),
            if (!isCollapsed &&
                !isSearching &&
                controller.text.isNotEmpty &&
                controller.text != HomeConstants.TEXT_HOME)
              Padding(
                padding: EdgeInsets.only(left: 12.r),
                child: Icon(
                  Iconsax.tick_circle,
                  color: Colors.green,
                  size: 20.r,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildEtaBadge() {
    String etaText = _isFetchingRoute ? '…' : '--';
    if (_routeDuration != null) {
      etaText = "${(_routeDuration! / 60).ceil().clamp(1, 999)}";
    }

    return Container(
      width: 64.r,
      height: 64.r,
      decoration: BoxDecoration(
        color: Colors.black,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 12.r,
            offset: Offset(0, 6.r),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(size: Size(64.r, 64.r), painter: _ClockTicksPainter()),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                etaText,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 20.r,
                  fontWeight: FontWeight.w800,
                  height: 1.0,
                ),
              ),
              SizedBox(height: 1.r),
              Text(
                "min",
                style: TextStyle(
                  color: Colors.grey.shade400,
                  fontSize: 10.r,
                  fontWeight: FontWeight.w600,
                  height: 1.0,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ClockTicksPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4.r; // 4px padding from edge

    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.3)
      ..strokeWidth = 1.5.r
      ..strokeCap = StrokeCap.round;

    final redPaint = Paint()
      ..color = Colors.redAccent
      ..strokeWidth = 2.0.r
      ..strokeCap = StrokeCap.round;

    for (int i = 0; i < 12; i++) {
      final angle = (i * 30 - 90) * math.pi / 180; // start from top
      final isRed = i == 5; // roughly bottom tick
      final currentPaint = isRed ? redPaint : paint;
      final tickLength = isRed ? 6.0.r : 3.0.r;

      final p1 = Offset(
        center.dx + math.cos(angle) * radius,
        center.dy + math.sin(angle) * radius,
      );
      final p2 = Offset(
        center.dx + math.cos(angle) * (radius - tickLength),
        center.dy + math.sin(angle) * (radius - tickLength),
      );
      canvas.drawLine(p1, p2, currentPaint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

class _TrianglePainter extends CustomPainter {
  final Color color;

  _TrianglePainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    final path = Path()
      ..moveTo(size.width / 2, 0)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant _TrianglePainter oldDelegate) =>
      oldDelegate.color != color;
}

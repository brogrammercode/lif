import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/demos/widgets/demo_launcher.dart';
import 'package:user/features/home/controllers/home_controller.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/pages/vehicle_selection_page.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:user/features/saved_places/widgets/place_components.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';

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
import 'package:user/core/routes.dart';
import 'package:user/core/network/api_result.dart';

import 'package:user/components/ui/app_logo.dart';

class HomePage extends StatefulWidget {
  final bool showDemoLauncher;
  final Widget Function(Widget)? mapBuilder;
  final bool locationSelection, editPickup;
  final Map<String, dynamic>? endpoints;
  const HomePage({
    super.key,
    this.showDemoLauncher = true,
    this.mapBuilder,
    this.locationSelection = false,
    this.editPickup = false,
    this.endpoints,
  });

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage>
    with WidgetsBindingObserver, RouteAware {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  LatLng get _fromLocation => _controller.fromLocation;
  set _fromLocation(LatLng value) => _controller.fromLocation = value;
  bool get _hasPickupLocation => _controller.hasPickupLocation;
  set _hasPickupLocation(bool value) => _controller.hasPickupLocation = value;
  bool get _pickupChosenManually => _controller.pickupChosenManually;
  set _pickupChosenManually(bool value) =>
      _controller.pickupChosenManually = value;
  bool _rebookRestored = false;
  ModalRoute<dynamic>? _homeRoute;
  Timer? _travelTimer;
  Map<String, dynamic>? get _activeRide => _controller.activeRide;
  bool _checkingTravel = false;
  bool get _resumeDriver => _controller.resumeDriver;
  Completer<void>? _travelDone;
  LatLng? get _currentDeviceLocation => _controller.currentDeviceLocation;
  set _currentDeviceLocation(LatLng? value) =>
      _controller.currentDeviceLocation = value;
  LatLng? get _toLocation => _controller.toLocation;
  set _toLocation(LatLng? value) => _controller.toLocation = value;

  bool get _isLoading => _controller.isLoading;
  set _isLoading(bool value) => _controller.isLoading = value;
  bool get _isRefreshing => _controller.isRefreshing;
  set _isRefreshing(bool value) => _controller.isRefreshing = value;
  bool _waitingForLocationSettingsReturn = false;
  bool _mapMounted = true;
  MapLibreMapController? _mapController;
  bool _mapStyleReady = false;
  bool _isProgrammaticMapMove = false;
  double _mapMarkerIconScale = 1;
  LatLng? _pendingMapCenter;
  CameraPosition? _lastMapCameraPosition;

  // Search State
  SearchField get _activeField => _controller.activeField;
  set _activeField(SearchField value) => _controller.activeField = value;
  SearchField? get _mapPickField => _controller.mapPickField;
  set _mapPickField(SearchField? value) => _controller.mapPickField = value;
  final TextEditingController _fromController = TextEditingController();
  final TextEditingController _toController = TextEditingController();
  final FocusNode _fromFocus = FocusNode();
  final FocusNode _toFocus = FocusNode();
  List<LatLng> get _routePoints => _controller.routePoints;
  set _routePoints(List<LatLng> value) => _controller.routePoints = value;
  double? get _routeDistance => _controller.routeDistance;
  set _routeDistance(double? value) => _controller.routeDistance = value;
  double? get _routeDuration => _controller.routeDuration;
  set _routeDuration(double? value) => _controller.routeDuration = value;
  String? get _routeError => _controller.routeError;
  set _routeError(String? value) => _controller.routeError = value;

  final bool _isSearchingDriver = false;
  List<Map<String, dynamic>> get _communityPlaces =>
      _controller.communityPlaces;
  bool _isProgrammaticTextChange = false;
  late RouteObserver<ModalRoute<dynamic>> _routeObserver;
  late HomeController _controller;
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  String? get _profileAvatarUrl => _controller.profileAvatarUrl;

  bool get _isRequestingQuote => _controller.isRequestingQuote;
  set _isRequestingQuote(bool value) => _controller.isRequestingQuote = value;
  List<Map<String, dynamic>> get _savedPlaces => _controller.savedPlaces;

  Timer? _debounce;
  Timer? _mapDataSyncTimer;
  Timer? _routeSettleTimer;
  List<dynamic> get _suggestions => _controller.suggestions;
  set _suggestions(List<dynamic> value) => _controller.suggestions = value;
  List<dynamic>? get _pendingSuggestions => _controller.pendingSuggestions;
  set _pendingSuggestions(List<dynamic>? value) =>
      _controller.pendingSuggestions = value;
  String? get _pendingSuggestionQuery => _controller.pendingSuggestionQuery;
  set _pendingSuggestionQuery(String? value) =>
      _controller.pendingSuggestionQuery = value;
  SearchField? get _pendingSuggestionField =>
      _controller.pendingSuggestionField;
  set _pendingSuggestionField(SearchField? value) =>
      _controller.pendingSuggestionField = value;
  int get _searchGeneration => _controller.searchGeneration;
  set _searchGeneration(int value) => _controller.searchGeneration = value;
  int get _routeRequestGeneration => _controller.routeRequestGeneration;
  set _routeRequestGeneration(int value) =>
      _controller.routeRequestGeneration = value;
  bool get _isFetchingSuggestions => _controller.isFetchingSuggestions;
  set _isFetchingSuggestions(bool value) =>
      _controller.isFetchingSuggestions = value;
  bool get _isMapDragging => _controller.isMapDragging;
  set _isMapDragging(bool value) => _controller.isMapDragging = value;
  bool get _isFetchingRoute => _controller.isFetchingRoute;
  set _isFetchingRoute(bool value) => _controller.isFetchingRoute = value;

  @override
  void initState() {
    super.initState();
    _routeObserver = RideRouteObserverScope.of(context);
    final source = DataSourceScope.read(context);
    _controller = HomeController(
      client: source?.client,
      simulated: source?.isDemo ?? false,
      initialEndpoints: source?.initialEndpoints,
    )..addListener(_controllerChanged);
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
    if (widget.locationSelection) {
      final from = rideMap(widget.endpoints?['pickup']),
          to = rideMap(widget.endpoints?['dropoff']);
      final p = ridePoint(from['latitude'], from['longitude']);
      if (p != null) {
        _fromLocation = p;
        _hasPickupLocation = true;
        _pickupChosenManually = true;
      }
      _toLocation = ridePoint(to['latitude'], to['longitude']);
      _fromController.text = '${from['address'] ?? ''}';
      _toController.text = '${to['address'] ?? ''}';
      _activeField = widget.editPickup ? SearchField.from : SearchField.to;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) (widget.editPickup ? _fromFocus : _toFocus).requestFocus();
      });
    }
    _controller.pickupAddress = _fromController.text;
    _controller.dropoffAddress = _toController.text;
    _fromController.addListener(_onSearchChanged);
    _toController.addListener(_onSearchChanged);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != _homeRoute) {
      _routeObserver.unsubscribe(this);
      _homeRoute = route;
      if (route != null) _routeObserver.subscribe(this, route);
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
    _setSearchText(_fromController, '${trip['pickup_address']}');
    _setSearchText(_toController, '${trip['dropoff_address']}');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_fetchRoute());
    });
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _travelTimer?.cancel();
    _routeObserver.unsubscribe(this);
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
  void didPushNext() {
    if (!mounted || !_mapMounted) return;
    // Material routes retain their state when covered. Explicitly removing the
    // platform map lets MapLibre release its renderer/GL resources while
    // Settings, Partner Program, a picker or the camera is in front.
    setState(() {
      _mapMounted = false;
      _mapController = null;
      _mapStyleReady = false;
      _isProgrammaticMapMove = false;
    });
  }

  @override
  void didPopNext() {
    if (mounted && !_mapMounted) setState(() => _mapMounted = true);
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
      await _controller.checkTravel();
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
      await _controller.loadPlaces();
      if (mounted) _scheduleMapDataSync();
    } catch (_) {}
  }

  Future<void> _loadProfileAvatar() async {
    try {
      await _controller.loadProfile();
    } catch (_) {}
  }

  Future<void> _initializeLocation() async {
    Map<String, double>? cachedLocation;
    try {
      cachedLocation = await _controller.cachedLocation();
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
    final result = await _controller.locate(
      askPermission: requestPermissionIfDenied,
    );
    if (!mounted) return false;
    if (result.status != 'ready' || result.point == null) {
      setState(() => _isLoading = false);
      if (showSettingsDialog && result.status == 'deniedForever') {
        await _showLocationSettingsDialog(
          title: 'Location permission is off',
          message:
              'Allow location access in app settings, then return to retry.',
          openSettings: Geolocator.openAppSettings,
          buttonText: 'Open app settings',
        );
      }
      if (showSettingsDialog && result.status == 'serviceOff') {
        await _showLocationSettingsDialog(
          title: 'Turn on location services',
          message: 'Device location services are off.',
          openSettings: Geolocator.openLocationSettings,
          buttonText: 'Open location settings',
        );
      }
      return false;
    }
    final location = result.point!;
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
    if (!_pickupChosenManually) {
      if (_activeField == SearchField.none &&
          _mapPickField == null &&
          !_isMapDragging) {
        _animatedMapMove(location, HomeConstants.DEFAULT_ZOOM, result.heading);
      }
      unawaited(_reverseGeocode(location, overrideField: SearchField.from));
      if (_toLocation != null) unawaited(_fetchRoute());
    }
    return true;
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
      builder: (dialogContext) => LiquidGlassDialog(
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

  Future<void> _saveLastKnownLocation(LatLng point) =>
      _controller.saveLocation(point);
  Future<void> _refreshLocation() async {
    if (_isRefreshing) return;
    setState(() {
      _isRefreshing = true;
      _pickupChosenManually = false;
    });
    try {
      await _determinePosition(
        requestPermissionIfDenied: false,
        showSettingsDialog: false,
      );
    } finally {
      if (mounted) setState(() => _isRefreshing = false);
    }
  }

  void _setSearchText(TextEditingController controller, String text) {
    final previous = _isProgrammaticTextChange;
    _isProgrammaticTextChange = true;
    controller.text = text;
    if (identical(controller, _fromController)) {
      _controller.pickupAddress = text;
    } else {
      _controller.dropoffAddress = text;
    }
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
  }

  void _onSearchChanged() {
    _controller.pickupAddress = _fromController.text;
    _controller.dropoffAddress = _toController.text;
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
      final data = await _controller.search(query);
      if (!mounted ||
          generation != _searchGeneration ||
          _activeField != field ||
          _searchControllerFor(field).text.trim() != query) {
        return;
      }
      _holdOrShowSuggestions(data, query, field);
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
    if (keyboardIsVisible && !widget.locationSelection) {
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
      final data = await _controller.reverse(location);
      if (mounted) {
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
      final route = await _controller.route();
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

  Map<String, dynamic> get _endpoints => _controller.endpoints;
  Future<void> _chooseLocations({bool pickup = false}) async {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(
        builder: (_) => HomePage(
          mapBuilder: widget.mapBuilder,
          locationSelection: true,
          endpoints: _endpoints,
          editPickup: pickup,
        ),
      ),
    );
    if (!mounted || result == null) return;
    final from = rideMap(result['pickup']), to = rideMap(result['dropoff']);
    setState(() {
      _fromLocation = ridePoint(from['latitude'], from['longitude'])!;
      _toLocation = ridePoint(to['latitude'], to['longitude'])!;
      _hasPickupLocation = true;
      _pickupChosenManually = true;
      _setSearchText(_fromController, '${from['address']}');
      _setSearchText(_toController, '${to['address']}');
      _activeField = SearchField.none;
      _mapPickField = null;
    });
    await _fetchRoute();
    if (mounted && _routeError == null) await _loadRideQuotes();
  }

  Future<void> _loadRideQuotes() async {
    if (_isRequestingQuote ||
        _isMapDragging ||
        !_hasPickupLocation ||
        _toLocation == null) {
      return;
    }
    FocusScope.of(context).unfocus();
    if (widget.locationSelection) {
      Navigator.pop(context, _endpoints);
      return;
    }
    setState(() => _isRequestingQuote = true);
    try {
      await _checkTravel();
      if (!mounted) return;
      if (_activeRide != null) {
        _resumeActive();
        return;
      }
      final input = _endpoints;
      final generation = _routeRequestGeneration;
      final quote = await _controller.quote();
      if (!mounted || generation != _routeRequestGeneration) return;
      if ((quote['quotes'] as List? ?? []).isEmpty) {
        throw StateError('No ride options are configured for this route.');
      }
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => VehicleSelectionPage(
            mapBuilder: widget.mapBuilder,
            input: input,
            initialQuote: quote,
            points: List.of(_routePoints),
            repository: _controller.repository,
          ),
        ),
      );
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
    if (!_mapMounted) return;
    _mapController = controller;
    final restored =
        _lastMapCameraPosition ??
        CameraPosition(
          target: _fromLocation,
          zoom: HomeConstants.DEFAULT_ZOOM,
          tilt: HomeConstants.MAP_TILT,
        );
    unawaited(controller.moveCamera(CameraUpdate.newCameraPosition(restored)));
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
          lineColor: '#4258ED',
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
      if (!mounted || !_mapMounted || !identical(_mapController, controller)) {
        return;
      }
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
    _lastMapCameraPosition = position;
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
      child: SolidScope(
        child: Scaffold(
          resizeToAvoidBottomInset: false,
          key: _scaffoldKey,
          backgroundColor: RideTokens.canvas,
          body: Stack(
            children: [
              // Layer 0: tilted vector map with 3D buildings.
              if (_mapMounted)
                (widget.mapBuilder ?? (map) => map)(
                  MapLibreMap(
                    initialCameraPosition: CameraPosition(
                      target:
                          _lastMapCameraPosition?.target ??
                          _pendingMapCenter ??
                          _fromLocation,
                      zoom:
                          _lastMapCameraPosition?.zoom ??
                          HomeConstants.DEFAULT_ZOOM,
                      bearing: _lastMapCameraPosition?.bearing ?? 0,
                      tilt:
                          _lastMapCameraPosition?.tilt ??
                          HomeConstants.MAP_TILT,
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
                    attributionButtonPosition:
                        AttributionButtonPosition.topRight,
                    attributionButtonMargins: math.Point<double>(12.r, 132.r),
                  ),
                )
              else
                const ColoredBox(color: Colors.white),

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
              if (widget.showDemoLauncher &&
                  !widget.locationSelection &&
                  !(DataSourceScope.read(context)?.isDemo ?? false))
                Positioned(
                  top:
                      MediaQuery.paddingOf(context).top +
                      (_activeRide == null ? 80 : 145),
                  left: 20,
                  child: DemoLauncher(mapBuilder: widget.mapBuilder),
                ),
              if (_activeRide != null)
                Positioned(
                  top: MediaQuery.paddingOf(context).top + 80.r,
                  left: 20.r,
                  right: 80.r,
                  child: SolidButton(
                    onPressed: _resumeActive,
                    icon: const Icon(Icons.directions_car_outlined),
                    text: 'Resume your active trip',
                  ),
                ),

              // Refresh Location Button (Layer 0 actions)
              if (!_isLoading)
                Positioned(
                  top: MediaQuery.paddingOf(context).top + 80.r,
                  right: 20.r,
                  child: GestureDetector(
                    onTap: _refreshLocation,
                    child: _buildMapControl(
                      child: _isRefreshing
                          ? const AppSkeleton(
                              label: 'Refreshing location',
                              child: SkeletonBox(
                                width: 20,
                                height: 20,
                                circle: true,
                              ),
                            )
                          : Icon(
                              Iconsax.gps,
                              color: Colors.black87,
                              size: 22.r,
                            ),
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
                      decoration: const BoxDecoration(color: Colors.white),
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
            child: _buildMapControl(
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
            child: _buildMapControl(
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

  Widget _buildMapControl({required Widget child}) {
    return SizedBox(
      width: 50.r,
      height: 50.r,
      child: SolidSurface(
        radius: 99,
        padding: EdgeInsets.zero,
        child: Center(child: child),
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
    final valid =
        _hasPickupLocation &&
        _toLocation != null &&
        !_isMapDragging &&
        !_isFetchingRoute &&
        _fromController.text.trim().isNotEmpty &&
        _toController.text.trim().isNotEmpty;
    return Positioned(
      left: 16,
      right: 16,
      bottom:
          math.max(
            MediaQuery.paddingOf(context).bottom,
            MediaQuery.viewInsetsOf(context).bottom,
          ) +
          12,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: math.min(
            MediaQuery.sizeOf(context).height * .60,
            math.max(
              140,
              MediaQuery.sizeOf(context).height -
                  MediaQuery.viewInsetsOf(context).bottom -
                  MediaQuery.paddingOf(context).top -
                  100,
            ),
          ),
        ),
        child: SolidSurface(
          padding: const EdgeInsets.all(18),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Center(
                  child: Container(
                    width: 36,
                    height: 4,
                    margin: const EdgeInsets.only(bottom: 14),
                    decoration: BoxDecoration(
                      color: RideTokens.muted.withValues(alpha: .3),
                      borderRadius: BorderRadius.circular(9),
                    ),
                  ),
                ),
                if (!widget.locationSelection &&
                    _communityPlaces.isNotEmpty) ...[
                  SizedBox(
                    height: 160,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _communityPlaces.length.clamp(0, 8),
                      separatorBuilder: (_, _) => const SizedBox(width: 10),
                      itemBuilder: (_, i) => SizedBox(
                        width: 140,
                        child: PlaceCard(
                          place: _communityPlaces[i],
                          onTap: () async {
                            final p = _communityPlaces[i];
                            final point = ridePoint(
                              p['latitude'],
                              p['longitude'],
                            );
                            if (point == null) return;
                            setState(() {
                              _toLocation = point;
                              _setSearchText(
                                _toController,
                                '${p['name'] ?? p['address']}',
                              );
                            });
                            await _chooseLocations();
                          },
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                ],
                if (widget.locationSelection) ...[
                  Row(
                    children: [
                      SolidIconButton(
                        icon: Icons.arrow_back,
                        tooltip: 'Back to map',
                        onPressed: () => Navigator.pop(context),
                      ),
                      const SizedBox(width: 10),
                      const Expanded(
                        child: RiderFlowHeading('Choose locations'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _buildSearchField(
                    label: 'Pickup',
                    controller: _fromController,
                    focusNode: _fromFocus,
                    field: SearchField.from,
                    isSearching: true,
                  ),
                  const SizedBox(height: 14),
                  _buildSearchField(
                    label: 'Drop-off',
                    controller: _toController,
                    focusNode: _toFocus,
                    field: SearchField.to,
                    isSearching: true,
                  ),
                  const SizedBox(height: 10),
                  TextButton.icon(
                    icon: const Icon(Icons.pin_drop_outlined),
                    label: const Text('Pick active location on map'),
                    onPressed: () {
                      FocusScope.of(context).unfocus();
                      setState(() {
                        _mapPickField = _activeField == SearchField.none
                            ? SearchField.to
                            : _activeField;
                        _activeField = _mapPickField!;
                      });
                    },
                  ),
                  if (_isFetchingSuggestions) const RideFlowSkeleton(),
                  for (final item in _suggestions)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.location_on_outlined),
                      title: Text('${item['display_name'] ?? ''}', maxLines: 2),
                      onTap: () => _onSuggestionSelected(item),
                    ),
                  if (_suggestions.isEmpty && !_isFetchingSuggestions)
                    for (final place in _savedPlaces.take(3))
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.bookmark_outline),
                        title: Text('${place['label'] ?? place['address']}'),
                        subtitle: Text(
                          '${place['address'] ?? ''}',
                          maxLines: 1,
                        ),
                        onTap: () => _onSuggestionSelected({
                          'display_name': place['address'],
                          'lat': '${place['latitude']}',
                          'lon': '${place['longitude']}',
                        }),
                      ),
                ] else ...[
                  _endpointRow(
                    'Pickup',
                    _fromController.text,
                    Icons.trip_origin,
                    () => _chooseLocations(pickup: true),
                  ),
                  const Divider(height: 20),
                  _endpointRow(
                    'Drop-off',
                    _toController.text,
                    Icons.location_on_outlined,
                    () => _chooseLocations(),
                  ),
                ],
                if (_routeError != null)
                  TextButton(
                    onPressed: _isFetchingRoute ? null : _fetchRoute,
                    child: Text(_routeError!),
                  ),
                if (_isFetchingRoute)
                  const Text(
                    'Checking route…',
                    style: TextStyle(color: RideTokens.muted),
                  ),
                if (_routeDistance != null && _routeDuration != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Text(
                      '${rideDistance(_routeDistance)} · ${rideDuration(_routeDuration)}',
                      style: const TextStyle(color: RideTokens.muted),
                    ),
                  ),
                const SizedBox(height: 12),
                SolidButton(
                  text: widget.locationSelection
                      ? 'Confirm locations'
                      : 'Continue',
                  busy: _isRequestingQuote,
                  onPressed: valid && !_isRequestingQuote
                      ? _loadRideQuotes
                      : (!widget.locationSelection
                            ? () => _chooseLocations()
                            : null),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _endpointRow(
    String label,
    String value,
    IconData icon,
    VoidCallback onTap,
  ) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(16),
    child: Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Icon(icon, color: RideTokens.accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(fontSize: 12, color: RideTokens.muted),
                ),
                Text(
                  value.isEmpty ? 'Choose location' : value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right),
        ],
      ),
    ),
  );

  void _activateEndpoint(SearchField field) {
    if (_activeField != field) {
      _debounce?.cancel();
      _searchGeneration++;
      _pendingSuggestions = null;
      _pendingSuggestionQuery = null;
      _pendingSuggestionField = null;
      setState(() {
        _suggestions = [];
        _isFetchingSuggestions = false;
      });
    }
    setState(() {
      _activeField = field;
      _mapPickField = null;
    });
  }

  Widget _buildSearchField({
    required String label,
    required TextEditingController controller,
    required FocusNode focusNode,
    required SearchField field,
    required bool isSearching,
  }) => TextField(
    controller: controller,
    focusNode: focusNode,
    decoration: InputDecoration(
      labelText: label,
      hintText: 'Search location…',
      prefixIcon: Icon(
        field == SearchField.from
            ? Icons.trip_origin
            : Icons.location_on_outlined,
      ),
    ),
    onTap: () => _activateEndpoint(field),
    onSubmitted: (_) {
      focusNode.unfocus();
      _showPendingSuggestions();
    },
  );
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

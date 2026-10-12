import 'dart:ui';
import 'dart:math' as math;
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:geolocator/geolocator.dart';
import 'package:iconsax/iconsax.dart';
import 'package:user/features/home/constants/home.constant.dart';
import 'package:user/features/drawer/pages/drawer_page.dart';
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
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  LatLng _fromLocation = HomeConstants.DEFAULT_LOCATION;
  LatLng? _toLocation;

  bool _isLoading = true;
  bool _isRefreshing = false;
  bool _waitingForLocationSettingsReturn = false;
  final MapController _mapController = MapController();
  late final AnimationController _animController;

  // Search State
  SearchField _activeField = SearchField.none;
  final TextEditingController _fromController = TextEditingController(
    text: HomeConstants.TEXT_HOME,
  );
  final TextEditingController _toController = TextEditingController();
  final FocusNode _fromFocus = FocusNode();
  final FocusNode _toFocus = FocusNode();

  bool _hasExpandedSearch = false;
  List<LatLng> _routePoints = [];
  double? _routeDistance;
  double? _routeDuration;
  TimeOfDay? _selectedRideTime;

  bool _isSelectingVehicle = false;
  int? _selectedVehicleIndex = 0;
  bool _isSearchingDriver = false;
  bool _isDriverFound = false;
  bool _isProgrammaticTextChange = false;
  final UserAppRepository _userRepository = UserAppRepository();
  String? _quoteDraftId;
  List<Map<String, dynamic>> _rideQuotes = [];
  bool _isRequestingQuote = false;

  Timer? _debounce;
  List<dynamic> _suggestions = [];
  bool _isFetchingSuggestions = false;
  bool _isMapDragging = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _animController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );
    _initializeLocation();
    _fromController.addListener(_onSearchChanged);
    _toController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _fromController.dispose();
    _toController.dispose();
    _fromFocus.dispose();
    _toFocus.dispose();
    _debounce?.cancel();
    _animController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
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

  Future<void> _initializeLocation() async {
    Map<String, double>? cachedLocation;
    try {
      cachedLocation = await DioClient().readCachedUserLocation();
    } catch (_) {}

    if (!mounted) return;
    if (cachedLocation != null) {
      final location = LatLng(
        cachedLocation['latitude']!,
        cachedLocation['longitude']!,
      );
      setState(() => _fromLocation = location);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _mapController.move(location, HomeConstants.DEFAULT_ZOOM);
      });
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
        setState(() {
          _fromLocation = LatLng(position.latitude, position.longitude);
          _isLoading = false;
        });
        unawaited(_saveLastKnownLocation(_fromLocation));
        double heading = position.heading > 0 ? position.heading : 0;
        _animatedMapMove(_fromLocation, HomeConstants.DEFAULT_ZOOM, heading);
        _reverseGeocode(_fromLocation, overrideField: SearchField.from);
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
      final newLocation = LatLng(position.latitude, position.longitude);
      setState(() {
        _fromLocation = newLocation;
      });
      unawaited(_saveLastKnownLocation(newLocation));
      // Reset rotation to default (0.0) alongside default zoom
      _animatedMapMove(newLocation, HomeConstants.DEFAULT_ZOOM, 0.0);
      _reverseGeocode(newLocation, overrideField: SearchField.from);
    } catch (e) {
      // ignore
    } finally {
      if (mounted) {
        setState(() => _isRefreshing = false);
      }
    }
  }

  void _onSearchChanged() {
    if (_isProgrammaticTextChange) return;
    if (_activeField == SearchField.none) return;
    final text = _activeField == SearchField.from
        ? _fromController.text
        : _toController.text;

    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      _fetchSuggestions(text);
    });
  }

  Future<void> _fetchSuggestions(String query) async {
    if (query.trim().length < 3 || query == HomeConstants.TEXT_HOME) {
      if (mounted) {
        setState(() {
          _suggestions = [];
          _isFetchingSuggestions = false;
        });
      }
      return;
    }
    if (mounted) setState(() => _isFetchingSuggestions = true);
    try {
      final response = await DioClient().getData(
        '/geocode/search',
        queryParameters: {'q': query},
      );
      final data = ApiResult.unwrap(response);
      if (data is List && mounted) {
        setState(() {
          _suggestions = data;
          _isFetchingSuggestions = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isFetchingSuggestions = false);
    }
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
        final displayName = data['display_name'] ?? '';
        final shortName = displayName.split(',').first;

        _isProgrammaticTextChange = true;
        setState(() {
          if (targetField == SearchField.from) {
            _fromController.text = shortName;
          } else if (targetField == SearchField.to) {
            _toController.text = shortName;
          }
        });
        Future.microtask(() => _isProgrammaticTextChange = false);
      }
    } catch (e) {
      // ignore
    }
  }

  Future<void> _selectRideTime() async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: _selectedRideTime ?? TimeOfDay.now(),
    );
    if (picked != null) {
      setState(() {
        _selectedRideTime = picked;
      });
    }
  }

  Future<void> _fetchRoute() async {
    if (_toLocation == null) return;
    try {
      final route = await _userRepository.drivingRoute(
        fromLatitude: _fromLocation.latitude,
        fromLongitude: _fromLocation.longitude,
        toLatitude: _toLocation!.latitude,
        toLongitude: _toLocation!.longitude,
      );
      final geometry = route['geometry'] as List? ?? const [];
      if (geometry.length < 2) throw StateError('Route geometry is empty.');
      if (!mounted) return;
      setState(() {
        _routePoints = geometry.map((coordinate) {
          final pair = coordinate as List;
          return LatLng(
            (pair[1] as num).toDouble(),
            (pair[0] as num).toDouble(),
          );
        }).toList();
        _routeDistance = (route['distance_m'] as num?)?.toDouble();
        _routeDuration = (route['duration_s'] as num?)?.toDouble();
      });
      _animateCameraToBounds();
    } catch (e) {
      if (mounted) {
        setState(() {
          _routePoints = [_fromLocation, _toLocation!];
          _routeDistance = null;
          _routeDuration = null;
        });
        _animateCameraToBounds();
      }
    }
  }

  Future<void> _loadRideQuotes() async {
    if (_toLocation == null ||
        _fromController.text.trim().isEmpty ||
        _toController.text.trim().isEmpty)
      return;
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
        _isSelectingVehicle = true;
      });
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
    } finally {
      if (mounted) setState(() => _isRequestingQuote = false);
    }
  }

  Future<void> _bookSelectedRide() async {
    if (_isRequestingQuote) return;
    final selected = _selectedVehicleIndex;
    if (_quoteDraftId == null ||
        selected == null ||
        selected >= _rideQuotes.length)
      return;
    setState(() => _isRequestingQuote = true);
    try {
      final requestedRide = await _userRepository.requestRide(
        _quoteDraftId!,
        '${_rideQuotes[selected]['id']}',
      );
      if (!mounted) return;
      Navigator.pushNamed(
        context,
        AppRoutes.rideDetail,
        arguments: '${requestedRide['id']}',
      );
    } catch (error) {
      if (mounted)
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
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

    final bounds = LatLngBounds(LatLng(minLat, minLng), LatLng(maxLat, maxLng));
    final fit = CameraFit.bounds(bounds: bounds, padding: EdgeInsets.all(40.r));
    final fittedCamera = fit.fit(_mapController.camera);

    _animatedMapMove(fittedCamera.center, fittedCamera.zoom, 0.0);
  }

  void _onSuggestionSelected(dynamic suggestion) {
    final displayName = suggestion['display_name'] ?? '';
    final shortName = displayName.split(',').first;

    final lat = double.tryParse(suggestion['lat'] ?? '0') ?? 0;
    final lon = double.tryParse(suggestion['lon'] ?? '0') ?? 0;
    final newLoc = (lat != 0 && lon != 0) ? LatLng(lat, lon) : null;

    setState(() {
      _suggestions = [];
      if (_activeField == SearchField.from) {
        _fromController.text = shortName;
        if (newLoc != null) _fromLocation = newLoc;
        _fromFocus.unfocus();
      } else if (_activeField == SearchField.to) {
        _toController.text = shortName;
        if (newLoc != null) _toLocation = newLoc;
        _toFocus.unfocus();
      }
      _activeField = SearchField.none;
    });

    if (newLoc != null &&
        !(_fromLocation.latitude != 0 && _toLocation != null)) {
      _animatedMapMove(newLoc, 16.0, 0.0);
    }

    if (_fromLocation.latitude != 0 && _toLocation != null) {
      _fetchRoute();
    }
  }

  void _animatedMapMove(
    LatLng destLocation,
    double destZoom,
    double destRotation,
  ) {
    final latTween = Tween<double>(
      begin: _mapController.camera.center.latitude,
      end: destLocation.latitude,
    );
    final lngTween = Tween<double>(
      begin: _mapController.camera.center.longitude,
      end: destLocation.longitude,
    );
    final zoomTween = Tween<double>(
      begin: _mapController.camera.zoom,
      end: destZoom,
    );
    final rotateTween = Tween<double>(
      begin: _mapController.camera.rotation,
      end: destRotation,
    );

    final animation = CurvedAnimation(
      parent: _animController,
      curve: Curves.fastOutSlowIn,
    );

    _animController.reset();

    void listener() {
      _mapController.moveAndRotate(
        LatLng(latTween.evaluate(animation), lngTween.evaluate(animation)),
        zoomTween.evaluate(animation),
        rotateTween.evaluate(animation),
      );
    }

    _animController.addListener(listener);
    _animController.addStatusListener((status) {
      if (status == AnimationStatus.completed ||
          status == AnimationStatus.dismissed) {
        _animController.removeListener(listener);
      }
    });

    _animController.forward();
  }

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
        drawer: const DrawerPage(),
        body: Stack(
          children: [
            // Layer 0: Map View (Greyscale with top/bottom fade)
            ShaderMask(
              shaderCallback: (Rect bounds) {
                return const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black,
                    Colors.black,
                    Colors.transparent,
                  ],
                  stops: [0.0, 0.15, 0.85, 1.0],
                ).createShader(bounds);
              },
              blendMode: BlendMode.dstIn,
              child: FlutterMap(
                mapController: _mapController,
                options: MapOptions(
                  initialCenter: _fromLocation,
                  initialZoom: HomeConstants.DEFAULT_ZOOM,
                  onPositionChanged: (MapCamera position, bool hasGesture) {
                    if (hasGesture && _activeField != SearchField.none) {
                      if (!_isMapDragging) {
                        setState(() {
                          _isMapDragging = true;
                          _suggestions = [];
                        });
                      }
                      if (_debounce?.isActive ?? false) _debounce!.cancel();
                      _debounce = Timer(const Duration(milliseconds: 500), () {
                        setState(() => _isMapDragging = false);
                        if (_activeField == SearchField.from) {
                          _fromLocation = position.center;
                        } else if (_activeField == SearchField.to) {
                          _toLocation = position.center;
                        }
                        _reverseGeocode(position.center).then((_) {
                          if (_fromLocation.latitude != 0 &&
                              _toLocation != null) {
                            _fetchRoute();
                          }
                        });
                      });
                    }
                  },
                ),
                children: [
                  ColorFiltered(
                    colorFilter: const ColorFilter.matrix(<double>[
                      0.33, 0.5, 0.16, 0, 10, // R
                      0.33, 0.5, 0.16, 0, 10, // G
                      0.33, 0.5, 0.16, 0, 10, // B
                      0, 0, 0, 1, 0, // A
                    ]),
                    child: TileLayer(
                      urlTemplate: HomeConstants.OPEN_STREET_MAP_TILE_URL,
                      subdomains: HomeConstants.MAP_SUBDOMAINS,
                      userAgentPackageName: HomeConstants.MAP_USER_AGENT,
                      tileProvider: NetworkTileProvider(
                        headers: HomeConstants.tileHeaders,
                      ),
                    ),
                  ),
                  if (_routePoints.isNotEmpty)
                    PolylineLayer(
                      polylines: [
                        Polyline(
                          points: _routePoints,
                          color: Colors.blue,
                          strokeWidth: 6.r,
                        ),
                      ],
                    ),
                  MarkerLayer(
                    markers: [
                      if (_activeField != SearchField.from)
                        Marker(
                          point: _fromLocation,
                          width: 250.r,
                          height: 120.r,
                          alignment: Alignment.topCenter,
                          child: _buildMarkerWidget(
                            isGreen: false,
                            label: _fromController.text.isNotEmpty
                                ? _fromController.text
                                : "Current Location",
                          ),
                        ),
                      if (_toLocation != null && _activeField != SearchField.to)
                        Marker(
                          point: _toLocation!,
                          width: 250.r,
                          height: 120.r,
                          alignment: Alignment.topCenter,
                          child: _buildMarkerWidget(
                            isGreen: true,
                            label: _toController.text.isNotEmpty
                                ? _toController.text
                                : "Destination",
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),

            // Fixed Center Pin Overlay when Dragging/Searching
            if (_activeField != SearchField.none)
              Positioned.fill(
                child: Center(
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    transform: Matrix4.translationValues(
                      0,
                      _isMapDragging ? -15 : 0,
                      0,
                    ),
                    child: _buildMarkerWidget(
                      isGreen: _activeField == SearchField.to,
                    ),
                  ),
                ),
              ),

            // Layer 1: Top Action Buttons
            _buildLayer1(context),

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
            onTap: () {
              _scaffoldKey.currentState?.openDrawer();
            },
            child: _buildGlassButton(
              child: ClipOval(
                child: Image.network(
                  HomeConstants.PROFILE_IMAGE_URL,
                  width: 44.r,
                  height: 44.r,
                  fit: BoxFit.cover,
                ),
              ),
            ),
          ),
          // Notification Button
          AppLogo(width: 112.r, height: 44.r),
          _buildGlassButton(
            child: Icon(
              Iconsax.notification,
              color: Colors.black87,
              size: 24.r,
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

  Widget _buildMarkerWidget({required bool isGreen, String? label}) {
    return Transform.translate(
      offset: Offset(0, -32.r),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (label != null) ...[
            Container(
              padding: EdgeInsets.symmetric(horizontal: 10.r, vertical: 6.r),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20.r),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 6.r,
                    offset: Offset(0, 3.r),
                  ),
                ],
              ),
              child: Text(
                label,
                style: TextStyle(
                  color: Colors.black,
                  fontSize: 12.r,
                  fontWeight: FontWeight.bold,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            SizedBox(height: 6.r),
          ],
          Container(
            width: 28.r,
            height: 28.r,
            decoration: BoxDecoration(
              color: isGreen ? Colors.green : Colors.black,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: (isGreen ? Colors.green : Colors.black).withValues(
                    alpha: 0.3,
                  ),
                  blurRadius: 8.r,
                  offset: Offset(0, 4.r),
                ),
              ],
            ),
            child: Center(
              child: isGreen
                  ? Transform.rotate(
                      angle: math.pi, // Rotate triangle downwards
                      child: CustomPaint(
                        size: Size(10.r, 8.r),
                        painter: _TrianglePainter(color: Colors.white),
                      ),
                    )
                  : CustomPaint(
                      size: Size(10.r, 8.r),
                      painter: _TrianglePainter(color: Colors.white),
                    ),
            ),
          ),
          Container(
            width: 2.5.r,
            height: 20.r,
            decoration: BoxDecoration(
              color: isGreen ? Colors.green : Colors.black,
              boxShadow: [
                BoxShadow(
                  color: (isGreen ? Colors.green : Colors.black).withValues(
                    alpha: 0.2,
                  ),
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

  Widget _buildLayer2(BuildContext context) {
    final isSearching = _activeField != SearchField.none;
    final showBothFields = _hasExpandedSearch;

    String titleText = HomeConstants.TEXT_GOOD_TIME;
    if (_routeDistance != null && !isSearching) {
      if (_routeDistance! < 1000) {
        titleText = "${_routeDistance!.round()} m";
      } else {
        titleText = "${(_routeDistance! / 1000).toStringAsFixed(1)} km";
      }
    }

    final vehicles = _rideQuotes.map((quote) {
      final kind = '${quote['vehicle_type'] ?? 'BIKE'}';
      final vehicleName = kind[0] + kind.substring(1).toLowerCase();
      return <String, dynamic>{
        'quote_id': quote['id'],
        'name': vehicleName,
        'capacity': 1,
        'time': '${((quote['duration_s'] as num? ?? 0) / 60).ceil()} min',
        'price': num.tryParse('${quote['total_fare']}')?.toDouble() ?? 0,
        'image':
            HomeConstants.VEHICLE_IMAGE_URLS[kind] ??
            HomeConstants.VEHICLE_IMAGE_URLS['BIKE'],
      };
    }).toList();

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
                padding: _isDriverFound
                    ? EdgeInsets.zero
                    : EdgeInsets.all(24.r),
                decoration: BoxDecoration(
                  color: _isDriverFound
                      ? Colors.white
                      : Colors.black.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(28.r),
                  border: _isDriverFound
                      ? null
                      : Border.all(
                          color: Colors.white.withValues(alpha: 0.3),
                          width: 1.5.r,
                        ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_isDriverFound) ...[
                      // Driver Found Profile
                      Container(
                        padding: EdgeInsets.all(24.r),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Center(
                              child: Text(
                                "Driver will arrive in ~4 min.",
                                style: TextStyle(
                                  fontSize: 20.r,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            SizedBox(height: 20.r),
                            Row(
                              children: [
                                Column(
                                  children: [
                                    ClipOval(
                                      child: Image.network(
                                        'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=100&q=80',
                                        width: 60.r,
                                        height: 60.r,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                    SizedBox(height: 8.r),
                                    Text(
                                      "Kairatbek",
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 14.r,
                                      ),
                                    ),
                                    Row(
                                      children: [
                                        Icon(
                                          Icons.star,
                                          color: Colors.greenAccent,
                                          size: 16.r,
                                        ),
                                        SizedBox(width: 4.r),
                                        Text(
                                          "5.0",
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 12.r,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),
                                const Spacer(),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text(
                                      "Grey Honda Activa",
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 16.r,
                                      ),
                                    ),
                                    SizedBox(height: 8.r),
                                    Container(
                                      padding: EdgeInsets.symmetric(
                                        horizontal: 8.r,
                                        vertical: 4.r,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.greenAccent.shade200,
                                        borderRadius: BorderRadius.circular(
                                          8.r,
                                        ),
                                      ),
                                      child: Text(
                                        "08KG1152",
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            SizedBox(height: 16.r),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                              children: [
                                Column(
                                  children: [
                                    Icon(
                                      Icons.verified_user_outlined,
                                      color: Colors.grey.shade400,
                                    ),
                                    SizedBox(height: 4.r),
                                    Text(
                                      "Safe",
                                      style: TextStyle(
                                        color: Colors.grey.shade500,
                                        fontSize: 12.r,
                                      ),
                                    ),
                                  ],
                                ),
                                Container(
                                  width: 1.r,
                                  height: 30.r,
                                  color: Colors.grey.shade300,
                                ),
                                Column(
                                  children: [
                                    Icon(
                                      Icons.motorcycle,
                                      color: Colors.grey.shade400,
                                    ),
                                    SizedBox(height: 4.r),
                                    Text(
                                      "Economy",
                                      style: TextStyle(
                                        color: Colors.grey.shade500,
                                        fontSize: 12.r,
                                      ),
                                    ),
                                  ],
                                ),
                                Container(
                                  width: 1.r,
                                  height: 30.r,
                                  color: Colors.grey.shade300,
                                ),
                                Column(
                                  children: [
                                    Icon(
                                      Icons.password,
                                      color: Colors.grey.shade400,
                                    ),
                                    SizedBox(height: 4.r),
                                    Text(
                                      "OTP: 1254",
                                      style: TextStyle(
                                        color: Colors.black,
                                        fontSize: 12.r,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            SizedBox(height: 20.r),
                            Container(
                              padding: EdgeInsets.symmetric(vertical: 16.r),
                              decoration: BoxDecoration(
                                color: Colors.black87,
                                borderRadius: BorderRadius.circular(15.r),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(
                                    "Contact driver",
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 16.r,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  SizedBox(width: 8.r),
                                  Icon(
                                    Icons.phone_outlined,
                                    color: Colors.white,
                                    size: 20.r,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ] else ...[
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
                                padding: EdgeInsets.all(12.r),
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
                                        height: 70.r,
                                        width: double.infinity,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                    SizedBox(height: 12.r),
                                    Text(
                                      vehicle['name'] as String,
                                      style: TextStyle(
                                        color: isSelected
                                            ? Colors.black
                                            : Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16.r,
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
                                              size: 12.r,
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
                                                fontSize: 12.r,
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
                                            fontSize: 12.r,
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
                                        fontSize: 18.r,
                                      ),
                                    ),
                                  ],
                                ),
                              );

                              return GestureDetector(
                                onTap: () => setState(
                                  () => _selectedVehicleIndex = index,
                                ),
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
                                                if (mounted)
                                                  setState(
                                                    () => _isSearchingDriver =
                                                        false,
                                                  );
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
                                          height: 170.r,
                                          child: cardContent,
                                        ),
                                      ),
                              );
                            },
                          ),
                        ),
                      ],
                      // Persistent Title Section
                      if (!isSearching && !_isSelectingVehicle) ...[
                        Text(
                          titleText,
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 20.r,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        SizedBox(height: 2.r),
                        GestureDetector(
                          onTap: _selectRideTime,
                          child: Row(
                            children: [
                              Text(
                                _selectedRideTime != null
                                    ? _selectedRideTime!.format(context)
                                    : HomeConstants.TEXT_NOW,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.8),
                                  fontSize: 14.r,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              SizedBox(width: 4.r),
                              Icon(
                                Iconsax.arrow_down_1,
                                color: Colors.white.withValues(alpha: 0.8),
                                size: 18.r,
                              ),
                            ],
                          ),
                        ),
                        SizedBox(height: 24.r),
                      ],

                      if (showBothFields && !_isSelectingVehicle)
                        Align(
                          alignment: Alignment.centerRight,
                          child: GestureDetector(
                            onTap: () {
                              setState(() {
                                _activeField = SearchField.none;
                                _hasExpandedSearch = false;
                                _suggestions = [];
                                FocusScope.of(context).unfocus();
                              });
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
                  ],
                ),
              ),
            ),
          ),

          // ETA Badge (Only show when not actively searching)
          if (!isSearching)
            Positioned(top: -24.r, right: 16.r, child: _buildEtaBadge()),
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
        setState(() {
          _activeField = field;
          _hasExpandedSearch = true;
          _routePoints = [];
        });
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
                          onTap: () => setState(() => _activeField = field),
                          style: TextStyle(
                            color: Colors.black,
                            fontSize: 15.r,
                            fontWeight: FontWeight.w700,
                          ),
                        )
                      : Text(
                          isCollapsed
                              ? HomeConstants.TEXT_HOME
                              : (controller.text.isEmpty
                                    ? "Select location"
                                    : controller.text),
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
    String etaText = "0";
    if (_routeDuration != null) {
      etaText = "${(_routeDuration! / 60).round()}";
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
    var paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;
    var path = Path();
    path.moveTo(size.width / 2, 0);
    path.lineTo(size.width, size.height);
    path.lineTo(0, size.height);
    path.close();
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

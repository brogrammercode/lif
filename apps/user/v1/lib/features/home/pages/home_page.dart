import 'dart:ui';
import 'dart:math' as math;
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Path;
import 'package:geolocator/geolocator.dart';
import 'package:iconsax/iconsax.dart';
import 'package:user/features/home/constants/home.constant.dart';
import 'package:user/features/drawer/pages/drawer_page.dart';
import '../../../core/network/dio_client.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

enum SearchField { none, from, to }

class _HomePageState extends State<HomePage>
    with SingleTickerProviderStateMixin {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  LatLng _fromLocation = HomeConstants.DEFAULT_LOCATION;
  LatLng? _toLocation;

  bool _isLoading = true;
  bool _isRefreshing = false;
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

  Timer? _debounce;
  List<dynamic> _suggestions = [];
  bool _isFetchingSuggestions = false;
  bool _isMapDragging = false;

  @override
  void initState() {
    super.initState();
    _animController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );
    _determinePosition();
    _fromController.addListener(_onSearchChanged);
    _toController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _fromController.dispose();
    _toController.dispose();
    _fromFocus.dispose();
    _toFocus.dispose();
    _debounce?.cancel();
    _animController.dispose();
    super.dispose();
  }

  Future<void> _determinePosition() async {
    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        if (mounted) setState(() => _isLoading = false);
        return;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      if (mounted) setState(() => _isLoading = false);
      return;
    }

    try {
      Position position = await Geolocator.getCurrentPosition();
      if (mounted) {
        setState(() {
          _fromLocation = LatLng(position.latitude, position.longitude);
          _isLoading = false;
        });
        double heading = position.heading > 0 ? position.heading : 0;
        _animatedMapMove(_fromLocation, HomeConstants.DEFAULT_ZOOM, heading);
        _reverseGeocode(_fromLocation, overrideField: SearchField.from);
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
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
      final response = await DioClient().dio.get(
        'https://nominatim.openstreetmap.org/search',
        queryParameters: {
          'q': query,
          'format': 'json',
          'addressdetails': 1,
          'limit': 5,
        },
      );
      if (response.statusCode == 200 && mounted) {
        setState(() {
          _suggestions = response.data;
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
      final response = await DioClient().dio.get(
        'https://nominatim.openstreetmap.org/reverse',
        queryParameters: {
          'lat': location.latitude,
          'lon': location.longitude,
          'format': 'json',
        },
      );
      if (response.statusCode == 200 && mounted) {
        final displayName = response.data['display_name'] ?? '';
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
      // OSRM requires longitude,latitude
      final fromStr = '${_fromLocation.longitude},${_fromLocation.latitude}';
      final toStr = '${_toLocation!.longitude},${_toLocation!.latitude}';
      final response = await DioClient().dio.get(
        'https://router.project-osrm.org/route/v1/driving/$fromStr;$toStr',
        queryParameters: {'geometries': 'geojson', 'overview': 'full'},
      );

      if (response.statusCode == 200 && mounted) {
        final data = response.data;
        if (data['routes'] != null && data['routes'].isNotEmpty) {
          final route = data['routes'][0];
          final geometry = route['geometry']['coordinates'] as List;
          setState(() {
            _routePoints = geometry
                .map((coord) => LatLng(coord[1] as double, coord[0] as double))
                .toList();
            _routeDistance = (route['distance'] as num?)?.toDouble();
            _routeDuration = (route['duration'] as num?)?.toDouble();
          });
          _animateCameraToBounds();
        }
      } else {
        setState(() {
          _routePoints = [_fromLocation, _toLocation!];
          _routeDistance = null;
          _routeDuration = null;
        });
        _animateCameraToBounds();
      }
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
    final fit = CameraFit.bounds(
      bounds: bounds,
      padding: const EdgeInsets.all(40.0),
    );
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
                          strokeWidth: 6.0,
                        ),
                      ],
                    ),
                  MarkerLayer(
                    markers: [
                      if (_activeField != SearchField.from)
                        Marker(
                          point: _fromLocation,
                          width: 250,
                          height: 120,
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
                          width: 250,
                          height: 120,
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
                top: MediaQuery.paddingOf(context).top + 80,
                right: 20,
                child: GestureDetector(
                  onTap: _refreshLocation,
                  child: _buildGlassButton(
                    child: _isRefreshing
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.black87,
                            ),
                          )
                        : const Icon(
                            Iconsax.gps,
                            color: Colors.black87,
                            size: 22,
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
              top: MediaQuery.paddingOf(context).top + 30,
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
      top: MediaQuery.paddingOf(context).top + 10,
      left: 20,
      right: 20,
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
                  width: 44,
                  height: 44,
                  fit: BoxFit.cover,
                ),
              ),
            ),
          ),
          // Notification Button
          _buildGlassButton(
            child: const Icon(
              Iconsax.notification,
              color: Colors.black87,
              size: 24,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGlassButton({required Widget child}) {
    return Container(
      width: 50,
      height: 50,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipOval(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white.withValues(alpha: 0.35),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.5),
                width: 1.5,
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
      offset: const Offset(0, -32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (label != null) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(20),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black12,
                    blurRadius: 6,
                    offset: Offset(0, 3),
                  ),
                ],
              ),
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.black,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(height: 6),
          ],
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: isGreen ? Colors.green : Colors.black,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: (isGreen ? Colors.green : Colors.black).withValues(
                    alpha: 0.3,
                  ),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Center(
              child: isGreen
                  ? Transform.rotate(
                      angle: math.pi, // Rotate triangle downwards
                      child: CustomPaint(
                        size: const Size(10, 8),
                        painter: _TrianglePainter(color: Colors.white),
                      ),
                    )
                  : CustomPaint(
                      size: const Size(10, 8),
                      painter: _TrianglePainter(color: Colors.white),
                    ),
            ),
          ),
          Container(
            width: 2.5,
            height: 20,
            decoration: BoxDecoration(
              color: isGreen ? Colors.green : Colors.black,
              boxShadow: [
                BoxShadow(
                  color: (isGreen ? Colors.green : Colors.black).withValues(
                    alpha: 0.2,
                  ),
                  blurRadius: 2,
                  offset: const Offset(1, 0),
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
        Center(child: const SizedBox(height: 50)),
        Icon(
          _isSearchingDriver ? Icons.search : Icons.motorcycle,
          size: 30,
          color: Colors.black87,
        ),
        const SizedBox(height: 12),
        Text(
          _isSearchingDriver
              ? "Searching for drivers..."
              : HomeConstants.TEXT_LOCATING_YOU,
          style: const TextStyle(
            color: Colors.black,
            fontSize: 24,
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

    final km = (_routeDistance ?? 0) / 1000;
    final vehicles = [
      {
        'name': 'Basic Bike',
        'capacity': 1,
        'time': '3 min',
        'price': 20 + (km * 8),
        'image':
            'https://images.unsplash.com/photo-1558981420-8ceaa10c9c30?auto=format&fit=crop&w=200&q=80',
      },
      {
        'name': 'Premium',
        'capacity': 1,
        'time': '5 min',
        'price': 30 + (km * 12),
        'image':
            'https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&w=200&q=80',
      },
      {
        'name': 'Electric',
        'capacity': 1,
        'time': '2 min',
        'price': 15 + (km * 6),
        'image':
            'https://images.unsplash.com/photo-1558980394-0a37c36b69b5?auto=format&fit=crop&w=200&q=80',
      },
    ];

    return Positioned(
      bottom: MediaQuery.paddingOf(context).bottom + 10,
      left: 16,
      right: 16,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // Main Container
          ClipRRect(
            borderRadius: BorderRadius.circular(28),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 15, sigmaY: 15),
              child: Container(
                padding: _isDriverFound
                    ? EdgeInsets.zero
                    : const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: _isDriverFound
                      ? Colors.white
                      : Colors.black.withValues(alpha: 0.25),
                  borderRadius: BorderRadius.circular(28),
                  border: _isDriverFound
                      ? null
                      : Border.all(
                          color: Colors.white.withValues(alpha: 0.3),
                          width: 1.5,
                        ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (_isDriverFound) ...[
                      // Driver Found Profile
                      Container(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Center(
                              child: Text(
                                "Driver will arrive in ~4 min.",
                                style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            const SizedBox(height: 20),
                            Row(
                              children: [
                                Column(
                                  children: [
                                    ClipOval(
                                      child: Image.network(
                                        'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&w=100&q=80',
                                        width: 60,
                                        height: 60,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    const Text(
                                      "Kairatbek",
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 14,
                                      ),
                                    ),
                                    Row(
                                      children: const [
                                        Icon(
                                          Icons.star,
                                          color: Colors.greenAccent,
                                          size: 16,
                                        ),
                                        SizedBox(width: 4),
                                        Text(
                                          "5.0",
                                          style: TextStyle(
                                            fontWeight: FontWeight.bold,
                                            fontSize: 12,
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
                                    const Text(
                                      "Grey Honda Activa",
                                      style: TextStyle(
                                        fontWeight: FontWeight.w600,
                                        fontSize: 16,
                                      ),
                                    ),
                                    const SizedBox(height: 8),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.greenAccent.shade200,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: const Text(
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
                            const SizedBox(height: 16),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                              children: [
                                Column(
                                  children: [
                                    Icon(
                                      Icons.verified_user_outlined,
                                      color: Colors.grey.shade400,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      "Safe",
                                      style: TextStyle(
                                        color: Colors.grey.shade500,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                                Container(
                                  width: 1,
                                  height: 30,
                                  color: Colors.grey.shade300,
                                ),
                                Column(
                                  children: [
                                    Icon(
                                      Icons.motorcycle,
                                      color: Colors.grey.shade400,
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      "Economy",
                                      style: TextStyle(
                                        color: Colors.grey.shade500,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ],
                                ),
                                Container(
                                  width: 1,
                                  height: 30,
                                  color: Colors.grey.shade300,
                                ),
                                Column(
                                  children: [
                                    Icon(
                                      Icons.password,
                                      color: Colors.grey.shade400,
                                    ),
                                    const SizedBox(height: 4),
                                    const Text(
                                      "OTP: 1254",
                                      style: TextStyle(
                                        color: Colors.black,
                                        fontSize: 12,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 20),
                            Container(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              decoration: BoxDecoration(
                                color: Colors.black87,
                                borderRadius: BorderRadius.circular(15),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: const [
                                  Text(
                                    "Contact driver",
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  SizedBox(width: 8),
                                  Icon(
                                    Icons.phone_outlined,
                                    color: Colors.white,
                                    size: 20,
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
                          height: 220,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: vehicles.length,
                            separatorBuilder: (context, index) =>
                                const SizedBox(width: 12),
                            itemBuilder: (context, index) {
                              final vehicle = vehicles[index];
                              final isSelected = _selectedVehicleIndex == index;

                              final cardContent = Container(
                                width: 140,
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? Colors.white
                                      : Colors.white.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(15),
                                  border: isSelected
                                      ? Border.all(
                                          color: Colors.white,
                                          width: 2,
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
                                      borderRadius: BorderRadius.circular(10),
                                      child: Image.network(
                                        vehicle['image'] as String,
                                        height: 70,
                                        width: double.infinity,
                                        fit: BoxFit.cover,
                                      ),
                                    ),
                                    const SizedBox(height: 12),
                                    Text(
                                      vehicle['name'] as String,
                                      style: TextStyle(
                                        color: isSelected
                                            ? Colors.black
                                            : Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16,
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.spaceBetween,
                                      children: [
                                        Row(
                                          children: [
                                            Icon(
                                              Icons.person,
                                              size: 12,
                                              color: isSelected
                                                  ? Colors.black54
                                                  : Colors.white70,
                                            ),
                                            const SizedBox(width: 4),
                                            Text(
                                              '${vehicle['capacity']}',
                                              style: TextStyle(
                                                color: isSelected
                                                    ? Colors.black54
                                                    : Colors.white70,
                                                fontSize: 12,
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
                                            fontSize: 12,
                                          ),
                                        ),
                                      ],
                                    ),
                                    const Spacer(),
                                    Text(
                                      '₹${(vehicle['price'] as double).toStringAsFixed(0)}',
                                      style: TextStyle(
                                        color: isSelected
                                            ? Colors.black
                                            : Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 18,
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
                                            15,
                                          ),
                                          boxShadow: [
                                            BoxShadow(
                                              color: Colors.black.withValues(
                                                alpha: 0.2,
                                              ),
                                              blurRadius: 10,
                                              offset: const Offset(0, 5),
                                            ),
                                          ],
                                        ),
                                        clipBehavior: Clip.antiAlias,
                                        child: Column(
                                          children: [
                                            Expanded(child: cardContent),
                                            GestureDetector(
                                              onTap: () {
                                                setState(() {
                                                  _isSelectingVehicle = false;
                                                  _isSearchingDriver = true;
                                                });
                                                Future.delayed(
                                                  const Duration(seconds: 3),
                                                  () {
                                                    if (mounted) {
                                                      setState(() {
                                                        _isSearchingDriver =
                                                            false;
                                                        _isDriverFound = true;
                                                      });
                                                    }
                                                  },
                                                );
                                              },
                                              child: Container(
                                                padding:
                                                    const EdgeInsets.symmetric(
                                                      vertical: 12,
                                                    ),
                                                width: 140,
                                                color: Colors.yellow.shade600,
                                                alignment: Alignment.center,
                                                child: const Text(
                                                  "Book Now",
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.bold,
                                                    fontSize: 14,
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
                                          height: 170,
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
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
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
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Icon(
                                Iconsax.arrow_down_1,
                                color: Colors.white.withValues(alpha: 0.8),
                                size: 18,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 24),
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
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.all(8),
                              decoration: const BoxDecoration(
                                color: Colors.white,
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black12,
                                    blurRadius: 4,
                                    offset: Offset(0, 2),
                                  ),
                                ],
                              ),
                              child: const Icon(
                                Icons.keyboard_arrow_down,
                                size: 24,
                                color: Colors.black87,
                              ),
                            ),
                          ),
                        ),

                      // Suggestions List (shows above text fields)
                      if (isSearching && _suggestions.isNotEmpty)
                        Container(
                          constraints: const BoxConstraints(maxHeight: 180),
                          margin: const EdgeInsets.only(bottom: 12),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(15),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.1),
                                blurRadius: 10,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: ListView.separated(
                            shrinkWrap: true,
                            padding: const EdgeInsets.all(8),
                            itemCount: _suggestions.length,
                            separatorBuilder: (context, index) =>
                                const Divider(height: 1),
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
                                  style: const TextStyle(
                                    fontSize: 14,
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
                          borderRadius: BorderRadius.circular(15),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.05),
                              blurRadius: 10,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
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
                                          const Padding(
                                            padding: EdgeInsets.symmetric(
                                              vertical: 4.0,
                                            ),
                                            child: Divider(
                                              height: 1,
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
                                    const SizedBox(
                                      width: 24,
                                      height: 24,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2.5,
                                      ),
                                    )
                                  else if (!showBothFields)
                                    Icon(
                                      Iconsax.search_normal,
                                      color: Colors.grey.shade400,
                                      size: 20,
                                    ),
                                ],
                              ),
                            ),
                            if (!isSearching && _routeDistance != null)
                              GestureDetector(
                                onTap: () {
                                  // Handle continue
                                },
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 8,
                                  ),
                                  color: Colors.yellow.shade600,
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      const Icon(
                                        Icons.motorcycle,
                                        color: Colors.black,
                                        size: 15,
                                      ),
                                      const SizedBox(width: 20),
                                      const Text(
                                        "Continue to select ride vehicle",
                                        style: TextStyle(
                                          color: Colors.black,
                                          fontSize: 14,
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
            Positioned(top: -24, right: 16, child: _buildEtaBadge()),
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
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: 2),
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
                              fontSize: 15,
                            ),
                          ),
                          onTap: () => setState(() => _activeField = field),
                          style: const TextStyle(
                            color: Colors.black,
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                          ),
                        )
                      : Text(
                          isCollapsed
                              ? HomeConstants.TEXT_HOME
                              : (controller.text.isEmpty
                                    ? "Select location"
                                    : controller.text),
                          style: const TextStyle(
                            color: Colors.black,
                            fontSize: 15,
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
                padding: const EdgeInsets.only(left: 12.0),
                child: Icon(Iconsax.tick_circle, color: Colors.green, size: 20),
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
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        color: Colors.black,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          CustomPaint(size: const Size(64, 64), painter: _ClockTicksPainter()),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                etaText,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.w800,
                  height: 1.0,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                "min",
                style: TextStyle(
                  color: Colors.grey.shade400,
                  fontSize: 10,
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
    final radius = size.width / 2 - 4; // 4px padding from edge

    final paint = Paint()
      ..color = Colors.white.withValues(alpha: 0.3)
      ..strokeWidth = 1.5
      ..strokeCap = StrokeCap.round;

    final redPaint = Paint()
      ..color = Colors.redAccent
      ..strokeWidth = 2.0
      ..strokeCap = StrokeCap.round;

    for (int i = 0; i < 12; i++) {
      final angle = (i * 30 - 90) * math.pi / 180; // start from top
      final isRed = i == 5; // roughly bottom tick
      final currentPaint = isRed ? redPaint : paint;
      final tickLength = isRed ? 6.0 : 3.0;

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

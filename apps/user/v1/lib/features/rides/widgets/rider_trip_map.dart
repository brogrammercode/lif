import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/home/constants/home.constant.dart';
import 'package:user/features/rides/widgets/ride_map_pin_assets.dart';

class RiderTripMap extends StatefulWidget {
  final LatLng pickup, dropoff;
  final LatLng? driver;
  final String driverLabel;
  final List<LatLng> points;
  final int recenter;
  const RiderTripMap({
    super.key,
    required this.pickup,
    required this.dropoff,
    this.driver,
    this.driverLabel = 'Driver',
    required this.points,
    this.recenter = 0,
  });
  @override
  State<RiderTripMap> createState() => _RiderMapState();
}

class _RiderMapState extends State<RiderTripMap> {
  MapLibreMapController? _controller;
  bool _ready = false, _syncing = false, _pending = false, _failed = false;
  List<LatLng>? _rendered;
  @override
  void didUpdateWidget(covariant RiderTripMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    unawaited(_sync());
    if (oldWidget.recenter != widget.recenter ||
        (oldWidget.driver == null && widget.driver != null)) {
      unawaited(_fit());
    }
  }

  Future<void> _style() async {
    final c = _controller;
    if (c == null) return;
    try {
      await c.addGeoJsonSource('rider-route', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addLineLayer(
        'rider-route',
        'rider-route-line',
        const LineLayerProperties(
          lineColor: '#4258ED',
          lineWidth: 4,
          lineCap: 'round',
          lineJoin: 'round',
        ),
      );
      await c.addImage('ride-pin-green', await RideMapPinAssets.green());
      await c.addImage('ride-pin-red', await RideMapPinAssets.red());
      final vehicleIcon = await rootBundle.load(
        'assets/images/ride_car_marker.png',
      );
      await c.addImage(
        'ride-vehicle',
        vehicleIcon.buffer.asUint8List(
          vehicleIcon.offsetInBytes,
          vehicleIcon.lengthInBytes,
        ),
      );
      await c.addGeoJsonSource('rider-vehicles', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addSymbolLayer(
        'rider-vehicles',
        'rider-vehicle-icons',
        const SymbolLayerProperties(
          iconImage: 'ride-vehicle',
          iconSize: .125,
          iconRotate: 0,
          iconRotationAlignment: 'viewport',
          iconAnchor: 'center',
          iconAllowOverlap: true,
          textField: ['get', 'label'],
          textSize: 12,
          textColor: '#101010',
          textHaloColor: '#FFFFFF',
          textHaloWidth: 3,
          textOffset: [0, 2.1],
          textAnchor: 'top',
        ),
      );
      await c.addGeoJsonSource('rider-pickup-pin', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addSymbolLayer(
        'rider-pickup-pin',
        'rider-pickup-pin-symbol',
        const SymbolLayerProperties(
          iconImage: 'ride-pin-green',
          iconSize: .125,
          iconAnchor: 'bottom',
          iconAllowOverlap: true,
        ),
      );
      await c.addGeoJsonSource('rider-dropoff-pin', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addSymbolLayer(
        'rider-dropoff-pin',
        'rider-dropoff-pin-symbol',
        const SymbolLayerProperties(
          iconImage: 'ride-pin-red',
          iconSize: .125,
          iconAnchor: 'bottom',
          iconAllowOverlap: true,
        ),
      );
      _ready = true;
      _rendered = null;
      await _sync();
      await _fit();
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    }
  }

  Future<void> _sync() async {
    final c = _controller;
    if (!_ready || c == null || !mounted) return;
    if (_syncing) {
      _pending = true;
      return;
    }
    _syncing = true;
    final points = widget.points,
        pickup = widget.pickup,
        dropoff = widget.dropoff,
        driver = widget.driver;
    Map<String, dynamic> marker(LatLng p, String label, String color) => {
      'type': 'Feature',
      'properties': {'label': label, 'color': color},
      'geometry': {
        'type': 'Point',
        'coordinates': [p.longitude, p.latitude],
      },
    };
    try {
      if (!identical(_rendered, points)) {
        await c.setGeoJsonSource('rider-route', {
          'type': 'FeatureCollection',
          'features': points.length < 2
              ? []
              : [
                  {
                    'type': 'Feature',
                    'properties': {},
                    'geometry': {
                      'type': 'LineString',
                      'coordinates': points
                          .map((p) => [p.longitude, p.latitude])
                          .toList(),
                    },
                  },
                ],
        });
        _rendered = points;
      }
      await c.setGeoJsonSource('rider-pickup-pin', {
        'type': 'FeatureCollection',
        'features': [marker(pickup, '', '')],
      });
      await c.setGeoJsonSource('rider-dropoff-pin', {
        'type': 'FeatureCollection',
        'features': [marker(dropoff, '', '')],
      });
      await c.setGeoJsonSource('rider-vehicles', {
        'type': 'FeatureCollection',
        'features': [
          if (driver != null) marker(driver, widget.driverLabel, '#101010'),
        ],
      });
    } catch (_) {
      if (mounted) setState(() => _failed = true);
    } finally {
      _syncing = false;
      if (_pending && mounted) {
        _pending = false;
        unawaited(_sync());
      }
    }
  }

  Future<void> _fit() async {
    final c = _controller;
    if (!_ready || c == null || !mounted) return;
    final points = [
      widget.pickup,
      widget.dropoff,
      if (widget.driver != null) widget.driver!,
    ];
    var minLat = points.first.latitude,
        maxLat = minLat,
        minLon = points.first.longitude,
        maxLon = minLon;
    for (final p in points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLon) minLon = p.longitude;
      if (p.longitude > maxLon) maxLon = p.longitude;
    }
    try {
      await c.moveCamera(
        CameraUpdate.newLatLngBounds(
          LatLngBounds(
            southwest: LatLng(minLat - .0002, minLon - .0002),
            northeast: LatLng(maxLat + .0002, maxLon + .0002),
          ),
          left: 34,
          top: 38,
          right: 34,
          bottom: 38,
        ),
      );
    } catch (_) {
      /* Controls remain usable while a map is unavailable. */
    }
  }

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      MapLibreMap(
        initialCameraPosition: CameraPosition(
          target: widget.pickup,
          zoom: 14,
          tilt: HomeConstants.MAP_TILT,
        ),
        styleString: HomeConstants.MAP_STYLE_URL,
        onMapCreated: (c) => _controller = c,
        onStyleLoadedCallback: _style,
        tiltGesturesEnabled: true,
        attributionButtonPosition: AttributionButtonPosition.topRight,
      ),
      if (_failed)
        const Positioned(
          top: 8,
          left: 8,
          right: 8,
          child: LiquidGlassSurface(
            padding: EdgeInsets.all(10),
            child: Row(
              children: [
                Icon(Icons.map_outlined, color: GlassTokens.accent, size: 18),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Map unavailable. Trip details and actions remain available.',
                    style: TextStyle(color: GlassTokens.ink, fontSize: 12.5),
                  ),
                ),
              ],
            ),
          ),
        ),
    ],
  );
}

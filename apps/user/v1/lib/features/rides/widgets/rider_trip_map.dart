import 'dart:async';
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/features/home/constants/home.constant.dart';

class RiderTripMap extends StatefulWidget {
  final LatLng pickup, dropoff;
  final LatLng? driver;
  final List<LatLng> points;
  final int recenter;
  const RiderTripMap({
    super.key,
    required this.pickup,
    required this.dropoff,
    this.driver,
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
          lineColor: '#16A34A',
          lineWidth: 5,
          lineCap: 'round',
          lineJoin: 'round',
        ),
      );
      await c.addGeoJsonSource('rider-pins', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addCircleLayer(
        'rider-pins',
        'rider-points',
        const CircleLayerProperties(
          circleRadius: 10,
          circleColor: ['get', 'color'],
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: 3,
        ),
      );
      await c.addSymbolLayer(
        'rider-pins',
        'rider-labels',
        const SymbolLayerProperties(
          textField: ['get', 'label'],
          textSize: 12,
          textColor: '#111827',
          textHaloColor: '#FFFFFF',
          textHaloWidth: 2,
          textOffset: [0, 1.4],
          textAnchor: 'top',
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
      await c.setGeoJsonSource('rider-pins', {
        'type': 'FeatureCollection',
        'features': [
          marker(pickup, 'Pickup', '#16A34A'),
          marker(dropoff, 'Drop-off', '#DC2626'),
          if (driver != null) marker(driver, 'Driver', '#2563EB'),
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
          child: Card(
            child: Padding(
              padding: EdgeInsets.all(8),
              child: Text(
                'Map unavailable. Trip details and actions remain available.',
              ),
            ),
          ),
        ),
    ],
  );
}

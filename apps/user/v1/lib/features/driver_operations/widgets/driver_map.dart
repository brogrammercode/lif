import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/features/home/constants/home.constant.dart';

class DriverMap extends StatefulWidget {
  final LatLng? location, pickup, dropoff;
  final List<LatLng> route;
  final double heading;
  final bool follow;
  const DriverMap({
    super.key,
    this.location,
    this.pickup,
    this.dropoff,
    this.route = const [],
    this.heading = 0,
    this.follow = true,
  });
  @override
  State<DriverMap> createState() => _DriverMapState();
}

class _DriverMapState extends State<DriverMap> {
  MapLibreMapController? _controller;
  bool _ready = false,
      _syncing = false,
      _syncAgain = false,
      _didCenter = false,
      _markersSynced = false;
  List<LatLng>? _renderedRoute;
  LatLng? _renderedPickup, _renderedDropoff;
  @override
  void didUpdateWidget(covariant DriverMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    unawaited(_sync());
  }

  Future<void> _style() async {
    final c = _controller;
    if (c == null) return;
    try {
      await c.addGeoJsonSource('driver-route', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addLineLayer(
        'driver-route',
        'driver-route-line',
        const LineLayerProperties(
          lineColor: '#16A34A',
          lineWidth: 5,
          lineCap: 'round',
          lineJoin: 'round',
        ),
      );
      await c.addGeoJsonSource('driver-markers', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addCircleLayer(
        'driver-markers',
        'driver-marker-circles',
        const CircleLayerProperties(
          circleRadius: 10,
          circleColor: ['get', 'color'],
          circleStrokeColor: '#FFFFFF',
          circleStrokeWidth: 3,
        ),
      );
      await c.addSymbolLayer(
        'driver-markers',
        'driver-marker-labels',
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
      _renderedRoute = null;
      _markersSynced = false;
      _ready = true;
      await _sync();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Map data could not load. Trip controls remain available.',
            ),
          ),
        );
      }
    }
  }

  Future<void> _sync() async {
    final c = _controller;
    if (!_ready || c == null || !mounted) return;
    if (_syncing) {
      _syncAgain = true;
      return;
    }
    _syncing = true;
    final pickup = widget.pickup,
        dropoff = widget.dropoff,
        location = widget.location;
    final route = widget.route;
    final heading = widget.heading, follow = widget.follow;
    try {
      final features = <Map<String, dynamic>>[];
      void marker(LatLng? p, String label, String color) {
        if (p != null) {
          features.add({
            'type': 'Feature',
            'properties': {'label': label, 'color': color},
            'geometry': {
              'type': 'Point',
              'coordinates': [p.longitude, p.latitude],
            },
          });
        }
      }

      marker(pickup, 'Pickup', '#111827');
      marker(dropoff, 'Drop-off', '#16A34A');
      if (!_markersSynced ||
          _renderedPickup != pickup ||
          _renderedDropoff != dropoff) {
        await c.setGeoJsonSource('driver-markers', {
          'type': 'FeatureCollection',
          'features': features,
        });
        _markersSynced = true;
        _renderedPickup = pickup;
        _renderedDropoff = dropoff;
      }
      if (!identical(_renderedRoute, route)) {
        await c.setGeoJsonSource('driver-route', {
          'type': 'FeatureCollection',
          'features': route.length < 2
              ? []
              : [
                  {
                    'type': 'Feature',
                    'properties': {},
                    'geometry': {
                      'type': 'LineString',
                      'coordinates': route
                          .map((p) => [p.longitude, p.latitude])
                          .toList(),
                    },
                  },
                ],
        });
        _renderedRoute = route;
      }
      if (location != null) {
        await c.updateManualLocation(ManualLocationUpdate(target: location));
        if (follow || !_didCenter) {
          _didCenter = true;
          await c.animateCamera(
            CameraUpdate.newCameraPosition(
              CameraPosition(
                target: location,
                zoom: 16.5,
                bearing: heading,
                tilt: 48,
              ),
            ),
          );
        }
      }
    } catch (_) {
      /* A style reload may temporarily invalidate a layer. */
    } finally {
      _syncing = false;
      if (_syncAgain && mounted) {
        _syncAgain = false;
        unawaited(_sync());
      }
    }
  }

  @override
  Widget build(BuildContext context) => MapLibreMap(
    initialCameraPosition: CameraPosition(
      target:
          widget.location ?? widget.pickup ?? HomeConstants.DEFAULT_LOCATION,
      zoom: 16,
      tilt: 48,
    ),
    styleString: HomeConstants.MAP_STYLE_URL,
    locationSource: const ManualLocationSource(),
    myLocationEnabled: true,
    myLocationRenderMode: MyLocationRenderMode.normal,
    onMapCreated: (c) => _controller = c,
    onStyleLoadedCallback: _style,
    tiltGesturesEnabled: true,
    attributionButtonPosition: AttributionButtonPosition.topRight,
    attributionButtonMargins: const math.Point<double>(12, 125),
  );
}

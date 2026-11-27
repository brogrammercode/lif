import 'package:user/components/ui/app_error_snackbar.dart';
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/features/home/constants/home.constant.dart';
import 'package:user/features/rides/widgets/ride_map_pin_assets.dart';

class DriverMap extends StatefulWidget {
  final LatLng? location, pickup, dropoff;
  final List<LatLng> route;
  final double heading;
  final bool follow;
  final String? phase;
  final int recenter;
  const DriverMap({
    super.key,
    this.location,
    this.pickup,
    this.dropoff,
    this.route = const [],
    this.heading = 0,
    this.follow = true,
    this.phase,
    this.recenter = 0,
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
  LatLng? _renderedPickup, _renderedDropoff, _cameraTarget;
  double? _cameraHeading;
  String? _cameraPhase;
  LatLng? _cameraEndpoint;
  int? _cameraRecenter;
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
      await c.addImage('ride-pin-green', await RideMapPinAssets.green());
      await c.addImage('ride-pin-red', await RideMapPinAssets.red());
      await c.addGeoJsonSource('driver-pickup-pin', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addSymbolLayer(
        'driver-pickup-pin',
        'driver-pickup-pin-symbol',
        const SymbolLayerProperties(
          iconImage: 'ride-pin-green',
          iconSize: .125,
          iconAnchor: 'bottom',
          iconAllowOverlap: true,
        ),
      );
      await c.addGeoJsonSource('driver-dropoff-pin', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addSymbolLayer(
        'driver-dropoff-pin',
        'driver-dropoff-pin-symbol',
        const SymbolLayerProperties(
          iconImage: 'ride-pin-red',
          iconSize: .125,
          iconAnchor: 'bottom',
          iconAllowOverlap: true,
        ),
      );
      _renderedRoute = null;
      _markersSynced = false;
      _ready = true;
      await _sync();
    } catch (_) {
      if (mounted) {
        showAppError(
          context,
          'Map data could not load. Trip controls remain available.',
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
    final phase = widget.phase;
    final pickup = widget.pickup,
        dropoff = widget.dropoff,
        location = widget.location;
    final route = widget.route;
    final heading = widget.heading, follow = widget.follow;
    try {
      Map<String, dynamic> marker(LatLng p) => {
        'type': 'Feature',
        'properties': <String, dynamic>{},
        'geometry': {
          'type': 'Point',
          'coordinates': [p.longitude, p.latitude],
        },
      };
      if (!_markersSynced ||
          _renderedPickup != pickup ||
          _renderedDropoff != dropoff) {
        await c.setGeoJsonSource('driver-pickup-pin', {
          'type': 'FeatureCollection',
          'features': [if (pickup != null) marker(pickup)],
        });
        await c.setGeoJsonSource('driver-dropoff-pin', {
          'type': 'FeatureCollection',
          'features': [if (dropoff != null) marker(dropoff)],
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
      }
      final destination =
          phase == 'IN_PROGRESS' || phase == 'PAYMENT' || phase == 'COMPLETED';
      final stageTarget = destination ? dropoff : pickup;
      final frameStage =
          _cameraPhase != phase ||
          _cameraEndpoint != stageTarget ||
          _cameraRecenter != widget.recenter;
      final target = frameStage ? (stageTarget ?? location) : location;
      if (target != null &&
          (frameStage ||
              !_didCenter ||
              (follow &&
                  (target != _cameraTarget || heading != _cameraHeading)))) {
        _cameraPhase = phase;
        _cameraEndpoint = stageTarget;
        _cameraRecenter = widget.recenter;
        _cameraTarget = location ?? target;
        _cameraHeading = heading;
        _didCenter = true;
        await c.animateCamera(
          frameStage &&
                  stageTarget != null &&
                  location != null &&
                  location != target
              ? CameraUpdate.newLatLngBounds(
                  LatLngBounds(
                    southwest: LatLng(
                      math.min(target.latitude, location.latitude) - .0002,
                      math.min(target.longitude, location.longitude) - .0002,
                    ),
                    northeast: LatLng(
                      math.max(target.latitude, location.latitude) + .0002,
                      math.max(target.longitude, location.longitude) + .0002,
                    ),
                  ),
                  left: 32,
                  right: 32,
                  top: 65,
                  bottom: 100,
                )
              : CameraUpdate.newCameraPosition(
                  CameraPosition(
                    target: target,
                    zoom: frameStage && stageTarget != null ? 15 : 16.5,
                    bearing: frameStage && stageTarget != null ? 0 : heading,
                    tilt: frameStage && stageTarget != null ? 25 : 48,
                  ),
                ),
          duration: const Duration(milliseconds: 900),
        );
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
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      MapLibreMap(
        initialCameraPosition: CameraPosition(
          target:
              widget.location ??
              widget.pickup ??
              HomeConstants.DEFAULT_LOCATION,
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
        attributionButtonMargins: const math.Point<double>(-1000, -1000),
      ),
    ],
  );
}

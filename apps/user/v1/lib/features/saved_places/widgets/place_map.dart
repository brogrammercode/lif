import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/features/home/constants/home.constant.dart';
import 'package:user/features/rides/ride_display.dart';

class PlaceMap extends StatefulWidget {
  final List<Map<String, dynamic>> places;
  final String? selectedId;
  final ValueChanged<String>? onSelected;
  final ValueChanged<LatLng>? onPicked;
  final LatLng? target;
  final double bottomInset, topInset;
  final int recenter;
  final List<LatLng> routePoints;
  const PlaceMap({
    super.key,
    this.places = const [],
    this.selectedId,
    this.onSelected,
    this.onPicked,
    this.target,
    this.bottomInset = 0,
    this.topInset = 0,
    this.recenter = 0,
    this.routePoints = const [],
  });
  @override
  State<PlaceMap> createState() => _PlaceMapState();
}

class _PlaceMapState extends State<PlaceMap> {
  MapLibreMapController? _controller;
  bool _ready = false, _syncing = false, _pending = false, _failed = false;
  LatLng? _camera;
  int _cameraGeneration = 0;
  int _viewVersion = 0;
  Timer? _styleTimeout;
  @override
  void dispose() {
    _styleTimeout?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant PlaceMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    unawaited(_sync());
    if (oldWidget.recenter != widget.recenter ||
        oldWidget.routePoints != widget.routePoints ||
        (oldWidget.places.isEmpty && widget.places.isNotEmpty)) {
      unawaited(_fit());
    } else if (oldWidget.target != widget.target && widget.target != null) {
      unawaited(_move(widget.target!));
    } else if (oldWidget.selectedId != widget.selectedId) {
      final selected = widget.places
          .where((p) => '${p['id']}' == widget.selectedId)
          .firstOrNull;
      final point = ridePoint(selected?['latitude'], selected?['longitude']);
      if (point != null) unawaited(_move(point));
    }
  }

  Future<void> _move(LatLng point) async {
    if (!_ready || !mounted) return;
    final generation = ++_cameraGeneration;
    try {
      if (MediaQuery.disableAnimationsOf(context)) {
        await _controller?.moveCamera(CameraUpdate.newLatLng(point));
      } else {
        await _controller?.animateCamera(CameraUpdate.newLatLng(point));
      }
      // Keep the selected pin in the exposed map between the floating controls
      // and cards. Camera scroll changes its framing, never the stored point or zoom.
      if (mounted &&
          generation == _cameraGeneration &&
          widget.onPicked == null &&
          widget.bottomInset != widget.topInset) {
        await _controller?.moveCamera(
          CameraUpdate.scrollBy(0, (widget.bottomInset - widget.topInset) / 2),
        );
      }
    } catch (_) {}
  }

  Future<void> _style() async {
    final c = _controller;
    if (c == null) return;
    _ready = false;
    try {
      await c.addGeoJsonSource('place-route', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addLineLayer(
        'place-route',
        'place-route-line',
        const LineLayerProperties(
          lineColor: '#354E79',
          lineWidth: 5,
          lineCap: 'round',
          lineJoin: 'round',
        ),
      );
      for (final (name, color, check) in [
        ('place-regular', GlassTokens.accent, false),
        ('place-origin', const Color(0xFF2563EB), false),
        ('place-saved', GlassTokens.accent, true),
        ('place-visited', const Color(0xFF16834D), true),
      ]) {
        final recorder = ui.PictureRecorder();
        final canvas = Canvas(recorder);
        canvas.drawCircle(
          const Offset(36, 36),
          31,
          Paint()..color = Colors.white,
        );
        canvas.drawCircle(const Offset(36, 36), 26, Paint()..color = color);
        if (check) {
          canvas.drawPath(
            Path()
              ..moveTo(23, 36)
              ..lineTo(32, 45)
              ..lineTo(49, 27),
            Paint()
              ..color = Colors.white
              ..style = PaintingStyle.stroke
              ..strokeWidth = 5
              ..strokeCap = StrokeCap.round
              ..strokeJoin = StrokeJoin.round,
          );
        } else {
          canvas.drawCircle(
            const Offset(36, 36),
            8,
            Paint()..color = Colors.white,
          );
        }
        final picture = recorder.endRecording();
        final image = await picture.toImage(72, 72);
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        if (!mounted) {
          image.dispose();
          picture.dispose();
          return;
        }
        await c.addImage(name, bytes!.buffer.asUint8List());
        image.dispose();
        picture.dispose();
      }
      await c.addGeoJsonSource('shared-places', {
        'type': 'FeatureCollection',
        'features': [],
      });
      await c.addSymbolLayer(
        'shared-places',
        'place-pins',
        const SymbolLayerProperties(
          iconImage: ['get', 'icon'],
          iconSize: .5,
          iconAllowOverlap: true,
          textField: ['get', 'label'],
          textSize: 12,
          textColor: '#182133',
          textHaloColor: '#FFFFFF',
          textHaloWidth: 2,
          textOffset: [0, 1.6],
          textAnchor: 'top',
        ),
        enableInteraction: true,
      );
      if (!mounted || c != _controller) return;
      _ready = true;
      _styleTimeout?.cancel();
      setState(() => _failed = false);
      await _sync();
      await _fit();
    } catch (_) {
      if (mounted && c == _controller) setState(() => _failed = true);
    }
  }

  Future<void> _sync() async {
    if (!_ready || _controller == null || !mounted) return;
    final controller = _controller!;
    if (_syncing) {
      _pending = true;
      return;
    }
    _syncing = true;
    try {
      await controller.setGeoJsonSource('place-route', {
        'type': 'FeatureCollection',
        'features': widget.routePoints.length < 2
            ? []
            : [
                {
                  'type': 'Feature',
                  'properties': {},
                  'geometry': {
                    'type': 'LineString',
                    'coordinates': widget.routePoints
                        .map((p) => [p.longitude, p.latitude])
                        .toList(),
                  },
                },
              ],
      });
      await controller.setGeoJsonSource('shared-places', {
        'type': 'FeatureCollection',
        'features': [
          for (final p in widget.places)
            if (ridePoint(p['latitude'], p['longitude']) != null)
              {
                'type': 'Feature',
                'properties': {
                  'id': '${p['id']}',
                  'label':
                      p['label_always'] == true ||
                          '${p['id']}' == widget.selectedId
                      ? '${p['name'] ?? p['label']}'
                      : '',
                  'icon': p['is_origin'] == true
                      ? 'place-origin'
                      : p['visited_at'] != null
                      ? 'place-visited'
                      : p['saved'] == true
                      ? 'place-saved'
                      : 'place-regular',
                },
                'geometry': {
                  'type': 'Point',
                  'coordinates': [
                    rideNumber(p['longitude']),
                    rideNumber(p['latitude']),
                  ],
                },
              },
        ],
      });
    } catch (_) {
      if (mounted && controller == _controller) setState(() => _failed = true);
    } finally {
      _syncing = false;
      if (_pending && mounted) {
        _pending = false;
        unawaited(_sync());
      }
    }
  }

  Future<void> _fit() async {
    if (!_ready || _controller == null || !mounted) return;
    final points = widget.places
        .map((p) => ridePoint(p['latitude'], p['longitude']))
        .whereType<LatLng>()
        .toList();
    points.addAll(widget.routePoints);
    if (widget.target != null) {
      await _move(widget.target!);
      return;
    }
    if (points.isEmpty) return;
    try {
      if (points.length == 1) {
        await _move(points.first);
        return;
      }
      await _controller!.moveCamera(
        CameraUpdate.newLatLngBounds(
          LatLngBounds(
            southwest: LatLng(
              points.map((p) => p.latitude).reduce(math.min) - .0002,
              points.map((p) => p.longitude).reduce(math.min) - .0002,
            ),
            northeast: LatLng(
              points.map((p) => p.latitude).reduce(math.max) + .0002,
              points.map((p) => p.longitude).reduce(math.max) + .0002,
            ),
          ),
          left: 44,
          right: 44,
          top: widget.topInset + 40,
          bottom: widget.bottomInset + 48,
        ),
      );
    } catch (_) {}
  }

  Future<void> _tap(math.Point<double> point, LatLng coordinate) async {
    if (widget.onPicked != null) {
      await _move(coordinate);
      return;
    }
    try {
      final features = await _controller?.queryRenderedFeatures(point, [
        'place-pins',
      ], null);
      if (!mounted || features == null || features.isEmpty) return;
      final feature = Map<String, dynamic>.from(features.first as Map);
      final id = rideMap(feature['properties'])['id'];
      if (id is String) widget.onSelected?.call(id);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      MapLibreMap(
        key: ValueKey(_viewVersion),
        initialCameraPosition: CameraPosition(
          target:
              widget.target ??
              (widget.places.isEmpty
                  ? null
                  : ridePoint(
                      widget.places.first['latitude'],
                      widget.places.first['longitude'],
                    )) ??
              HomeConstants.DEFAULT_LOCATION,
          zoom: 13,
        ),
        styleString: HomeConstants.MAP_STYLE_URL,
        onMapCreated: (c) {
          _controller = c;
          final version = _viewVersion;
          _styleTimeout?.cancel();
          _styleTimeout = Timer(const Duration(seconds: 20), () {
            if (mounted && version == _viewVersion && !_ready) {
              setState(() => _failed = true);
            }
          });
        },
        onStyleLoadedCallback: _style,
        featureTapsTriggersMapClick: true,
        trackCameraPosition: true,
        onMapClick: _tap,
        onCameraMove: (position) => _camera = position.target,
        onCameraIdle: () {
          if (_camera != null) widget.onPicked?.call(_camera!);
        },
        attributionButtonPosition: AttributionButtonPosition.topRight,
        attributionButtonMargins: math.Point(8, widget.topInset + 8),
      ),
      if (widget.onPicked != null)
        const IgnorePointer(
          child: Center(
            child: Icon(
              Icons.location_pin,
              size: 42,
              color: GlassTokens.accent,
            ),
          ),
        ),
      if (!_ready && !_failed)
        Positioned(
          top: widget.topInset + 45,
          left: 20,
          child: const LiquidGlassSurface(
            padding: EdgeInsets.all(12),
            child: AppSkeleton(
              label: 'Loading map',
              child: SkeletonBox(width: 100, height: 16),
            ),
          ),
        ),
      if (_failed)
        Positioned(
          top: widget.topInset + 45,
          left: 20,
          right: 20,
          child: LiquidGlassSurface(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  widget.onPicked != null
                      ? 'Map unavailable. You can still search for an address.'
                      : 'Map unavailable. Your place cards and details remain available.',
                  style: const TextStyle(fontSize: 12, color: GlassTokens.ink),
                ),
                TextButton(
                  onPressed: () {
                    _styleTimeout?.cancel();
                    setState(() {
                      _viewVersion++;
                      _ready = false;
                      _failed = false;
                      _controller = null;
                      _cameraGeneration++;
                    });
                  },
                  child: const Text('Retry map'),
                ),
              ],
            ),
          ),
        ),
    ],
  );
}

import 'dart:async';
import 'dart:math' as math;
import 'dart:io' as io;
import 'dart:ui' as ui;
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/home/constants/home.constant.dart';
import 'package:user/features/rides/widgets/ride_map_pin_assets.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/place_display.dart';

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
  bool _cameraAnimating = false;
  LatLng? _camera;
  Map<String, Offset> _markerOffsets = {};
  int _cameraGeneration = 0;
  int _viewVersion = 0;
  final Set<String> _avatarIcons = {};
  Timer? _styleTimeout;
  @override
  void dispose() {
    _styleTimeout?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant PlaceMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final selectionChanged = oldWidget.selectedId != widget.selectedId;
    final fitChanged =
        oldWidget.recenter != widget.recenter ||
        oldWidget.routePoints != widget.routePoints ||
        (oldWidget.places.isEmpty && widget.places.isNotEmpty);
    if (fitChanged) {
      unawaited(_sync());
      unawaited(_fit());
    } else if (selectionChanged && widget.onPicked == null) {
      unawaited(_syncSelectedPlace());
    } else {
      unawaited(_sync());
    }
    if (!fitChanged &&
        oldWidget.target != widget.target &&
        widget.target != null) {
      unawaited(_move(widget.target!));
    }
  }

  String _avatarIconName(Map<String, dynamic> place) =>
      'place-avatar-${'${place['id']}'.hashCode}';

  Future<Uint8List?> _makeAvatarIcon(String url) async {
    final stream = NetworkImage(url).resolve(const ImageConfiguration());
    final completer = Completer<ui.Image>();
    late final ImageStreamListener listener;
    listener = ImageStreamListener(
      (frame, synchronousCall) {
        if (!completer.isCompleted) completer.complete(frame.image);
      },
      onError: (error, stackTrace) {
        if (!completer.isCompleted) completer.completeError(error, stackTrace);
      },
    );
    stream.addListener(listener);
    try {
      final source = await completer.future.timeout(const Duration(seconds: 4));
      final recorder = ui.PictureRecorder();
      final canvas = Canvas(recorder);
      const center = Offset(36, 36);
      canvas.drawCircle(center, 35, Paint()..color = Colors.white);
      canvas.save();
      canvas.clipPath(
        Path()..addOval(Rect.fromCircle(center: center, radius: 30)),
      );
      canvas.drawImageRect(
        source,
        _centerCrop(source.width.toDouble(), source.height.toDouble()),
        const Rect.fromLTWH(6, 6, 60, 60),
        Paint()..filterQuality = FilterQuality.high,
      );
      canvas.restore();
      final picture = recorder.endRecording();
      final image = await picture.toImage(72, 72);
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      image.dispose();
      picture.dispose();
      return data?.buffer.asUint8List();
    } catch (_) {
      return null;
    } finally {
      stream.removeListener(listener);
    }
  }

  Rect _centerCrop(double width, double height) {
    final side = math.min(width, height);
    return Rect.fromLTWH((width - side) / 2, (height - side) / 2, side, side);
  }

  Future<void> _addSelectedAvatar(MapLibreMapController controller) async {
    final selected = widget.places
        .where((place) => '${place['id']}' == widget.selectedId)
        .firstOrNull;
    if (selected == null) return;
    final url = placePhotos(selected).firstOrNull;
    if (url == null) return;
    final name = _avatarIconName(selected);
    if (_avatarIcons.contains(name)) return;
    final bytes = await _makeAvatarIcon(url);
    if (bytes == null || !mounted || controller != _controller) return;
    try {
      await controller.addImage(name, bytes);
      _avatarIcons.add(name);
    } catch (_) {}
  }

  Future<void> _syncSelectedPlace() async {
    final controller = _controller;
    if (!_ready || controller == null) return;
    final place = widget.places
        .where((p) => '${p['id']}' == widget.selectedId)
        .firstOrNull;
    final point = ridePoint(place?['latitude'], place?['longitude']);

    // Keep camera motion independent from photo decoding and source updates so
    // carousel changes animate immediately even on a slow image connection.
    final avatarReady = _addSelectedAvatar(controller);
    unawaited(_sync());
    if (point != null) await _move(point);
    await avatarReady;
    if (mounted) await _sync();
  }

  Future<void> _refreshPlaceMarkers() async {
    final controller = _controller;
    if (_cameraAnimating) return;
    if (!_ready || controller == null || !mounted) return;
    final locations = <(String, LatLng)>[
      for (final place in widget.places)
        if (ridePoint(place['latitude'], place['longitude']) case final point?)
          ('${place['id']}', point),
    ];
    if (locations.isEmpty) {
      if (_markerOffsets.isNotEmpty) setState(() => _markerOffsets = {});
      return;
    }
    try {
      final screenPoints = await controller.toScreenLocationBatch(
        locations.map((location) => location.$2),
      );
      if (!mounted || controller != _controller) return;
      // Android's MapLibre projection is in physical pixels; Flutter's Stack
      // positions children in logical pixels. iOS already reports points.
      final pixelRatio = io.Platform.isAndroid
          ? MediaQuery.devicePixelRatioOf(context)
          : 1.0;
      final offsets = <String, Offset>{};
      for (
        var index = 0;
        index < math.min(locations.length, screenPoints.length);
        index++
      ) {
        offsets[locations[index].$1] = Offset(
          screenPoints[index].x.toDouble() / pixelRatio,
          screenPoints[index].y.toDouble() / pixelRatio,
        );
      }
      setState(() => _markerOffsets = offsets);
    } catch (_) {}
  }

  Future<void> _move(LatLng point) async {
    if (!_ready || !mounted) return;
    final generation = ++_cameraGeneration;
    if (widget.onPicked == null && !_cameraAnimating) {
      setState(() => _cameraAnimating = true);
    }
    try {
      if (MediaQuery.disableAnimationsOf(context)) {
        await _controller?.moveCamera(CameraUpdate.newLatLng(point));
      } else {
        await _controller?.animateCamera(
          CameraUpdate.newLatLng(point),
          duration: const Duration(milliseconds: 420),
        );
      }
    } catch (_) {
    } finally {
      if (widget.onPicked == null &&
          mounted &&
          generation == _cameraGeneration) {
        setState(() => _cameraAnimating = false);
        await _refreshPlaceMarkers();
      }
    }
  }

  Future<void> _style() async {
    final c = _controller;
    if (c == null) return;
    _ready = false;
    _avatarIcons.clear();
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
      await _addSelectedAvatar(c);
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
                  'icon':
                      '${p['id']}' == widget.selectedId &&
                          placePhotos(p).isNotEmpty &&
                          _avatarIcons.contains(_avatarIconName(p))
                      ? _avatarIconName(p)
                      : p['is_origin'] == true
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
      final bounds = CameraUpdate.newLatLngBounds(
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
      );
      if (MediaQuery.disableAnimationsOf(context)) {
        await _controller!.moveCamera(bounds);
      } else {
        await _controller!.animateCamera(
          bounds,
          duration: const Duration(milliseconds: 650),
        );
      }
      await _refreshPlaceMarkers();
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
        onCameraMove: (position) {
          _camera = position.target;
          if (widget.onPicked == null && !_cameraAnimating && mounted) {
            setState(() => _cameraAnimating = true);
          }
        },
        onCameraIdle: () {
          if (_camera != null) widget.onPicked?.call(_camera!);
          if (widget.onPicked == null) {
            if (mounted && _cameraAnimating) {
              setState(() => _cameraAnimating = false);
            }
            unawaited(_refreshPlaceMarkers());
          }
        },
        attributionButtonPosition: AttributionButtonPosition.topRight,
        attributionButtonMargins: const math.Point<double>(-1000, -1000),
      ),
      if (widget.onPicked != null)
        IgnorePointer(
          child: Center(
            child: Transform.translate(
              offset: const Offset(0, -16),
              child: Image.asset(
                RideMapPinAssets.assetPath,
                width: 32,
                height: 32,
                fit: BoxFit.contain,
                filterQuality: FilterQuality.high,
              ),
            ),
          ),
        ),
      if (widget.onSelected != null && !_cameraAnimating)
        for (final place in widget.places)
          if (_markerOffsets['${place['id']}'] case final offset?)
            Positioned(
              left:
                  offset.dx - ('${place['id']}' == widget.selectedId ? 24 : 21),
              top:
                  offset.dy - ('${place['id']}' == widget.selectedId ? 24 : 21),
              child: IgnorePointer(
                child: _PlaceAvatarMarker(
                  place: place,
                  selected: '${place['id']}' == widget.selectedId,
                ),
              ),
            ),
      if (!_ready && !_failed)
        Positioned(
          top: widget.topInset + 45,
          left: 20,
          child: Material(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox.square(
                    dimension: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  SizedBox(width: 9),
                  Text('Loading map', style: TextStyle(fontSize: 12)),
                ],
              ),
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

class _PlaceAvatarMarker extends StatelessWidget {
  final Map<String, dynamic> place;
  final bool selected;
  const _PlaceAvatarMarker({required this.place, required this.selected});

  @override
  Widget build(BuildContext context) {
    final size = selected ? 48.0 : 42.0;
    final photo = placePhotos(place).firstOrNull;
    return Container(
      width: size,
      height: size,
      padding: const EdgeInsets.all(3),
      decoration: const BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: ClipOval(
        child: photo == null
            ? ColoredBox(
                color: const Color(0xFFF2F2F2),
                child: Icon(placeIcon(place), size: 21),
              )
            : Image.network(
                photo,
                fit: BoxFit.cover,
                cacheWidth: 120,
                errorBuilder: (_, error, stack) => ColoredBox(
                  color: const Color(0xFFF2F2F2),
                  child: Icon(placeIcon(place), size: 21),
                ),
              ),
      ),
    );
  }
}

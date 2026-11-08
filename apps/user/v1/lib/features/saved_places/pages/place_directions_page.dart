import 'package:user/features/saved_places/controllers/place_directions_controller.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/widgets/place_components.dart';
import 'package:user/features/saved_places/widgets/place_map.dart';
import 'package:user/features/saved_places/place_display.dart';

class PlaceDirectionsPage extends StatefulWidget {
  final Map<String, dynamic> place;
  final Widget Function(PlaceMap)? mapBuilder;
  const PlaceDirectionsPage({super.key, required this.place, this.mapBuilder});
  @override
  State<PlaceDirectionsPage> createState() => _DirectionsState();
}

class _DirectionsState extends State<PlaceDirectionsPage>
    with WidgetsBindingObserver {
  late final _controller = PlaceDirectionsController(widget.place)
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  Map<String, dynamic>? get _route => _controller.route;
  LatLng? get _origin => _controller.origin;
  String? get _error => _controller.error;
  bool get _busy => _controller.busy;
  bool get _settings => _controller.settings;
  set _settings(bool value) => _controller.settings = value;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _settings) {
      _settings = false;
      unawaited(_load());
    }
  }

  Future<void> _load() => _controller.load();

  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: 'Directions',
    child: Column(
      children: [
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: Builder(
              builder: (_) {
                final map = PlaceMap(
                  places: [
                    {...widget.place, 'label_always': true},
                    if (_origin != null)
                      {
                        'id': 'origin',
                        'name': 'Your location',
                        'label_always': true,
                        'is_origin': true,
                        'latitude': _origin!.latitude,
                        'longitude': _origin!.longitude,
                      },
                  ],
                  routePoints: rideGeometry(_route?['geometry']),
                );
                return widget.mapBuilder?.call(map) ?? map;
              },
            ),
          ),
        ),
        const SizedBox(height: 14),
        Flexible(
          child: SingleChildScrollView(
            child: _busy && _route == null
                ? const PlaceCardSkeleton()
                : LiquidGlassSurface(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          placeName(widget.place),
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w600,
                            color: GlassTokens.ink,
                          ),
                        ),
                        if (_route != null)
                          Text(
                            '${rideDistance(_route!['distance_m'])} · ${rideDuration(_route!['duration_s'])} estimated',
                            style: const TextStyle(
                              fontSize: 14,
                              color: GlassTokens.muted,
                            ),
                          ),
                        if (_error != null)
                          Text(
                            _error!,
                            style: const TextStyle(color: Colors.red),
                          ),
                        TextButton(
                          onPressed: _busy ? null : _load,
                          child: Text(
                            _busy ? 'Updating route…' : 'Refresh route',
                          ),
                        ),
                        if (_error != null)
                          Wrap(
                            children: [
                              TextButton(
                                onPressed: () async {
                                  _settings = true;
                                  await Geolocator.openLocationSettings();
                                },
                                child: const Text('Location settings'),
                              ),
                              TextButton(
                                onPressed: () async {
                                  _settings = true;
                                  await Geolocator.openAppSettings();
                                },
                                child: const Text('App permissions'),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 16),
      ],
    ),
  );
}

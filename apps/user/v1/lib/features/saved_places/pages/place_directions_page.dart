import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/widgets/place_components.dart';
import 'package:user/features/saved_places/widgets/place_map.dart';
import 'package:user/features/user_app/user_app.repo.dart';
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
  Map<String, dynamic>? _route;
  LatLng? _origin;
  String? _error;
  bool _busy = false, _settings = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
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

  Future<void> _load() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        throw StateError('Enable device location to get directions.');
      }
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (![
        LocationPermission.always,
        LocationPermission.whileInUse,
      ].contains(permission)) {
        throw StateError('Allow location access to get directions.');
      }
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 20),
        ),
      );
      final origin = ridePoint(position.latitude, position.longitude);
      final target = ridePoint(
        widget.place['latitude'],
        widget.place['longitude'],
      );
      if (origin == null || target == null) {
        throw StateError('This location cannot be routed.');
      }
      final data = await UserAppRepository().drivingRoute(
        fromLatitude: origin.latitude,
        fromLongitude: origin.longitude,
        toLatitude: target.latitude,
        toLongitude: target.longitude,
      );
      if (rideGeometry(data['geometry']).length < 2) {
        throw StateError('A driving route was not returned. Try again.');
      }
      if (mounted) {
        setState(() {
          _origin = origin;
          _route = data;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

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

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_vehicles/widgets/driver_vehicle_gate.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';

class DriverHomePage extends StatelessWidget {
  const DriverHomePage({super.key});
  @override
  Widget build(BuildContext context) =>
      const DriverVehicleGate(child: DriverHomeContent());
}

class DriverHomeContent extends StatefulWidget {
  const DriverHomeContent({super.key});
  @override
  State<DriverHomeContent> createState() => _DriverHomeState();
}

class _DriverHomeState extends State<DriverHomeContent>
    with WidgetsBindingObserver, RouteAware {
  final _repo = DriverOperationsRepository();
  final _tracking = DriverTrackingService.instance;
  Map<String, dynamic>? _data;
  String? _error;
  Timer? _poll;
  Completer<void>? _readDone;
  ModalRoute<dynamic>? _route;
  bool _loading = false, _busy = false, _opening = false, _foreground = true;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_foreground && _route?.isCurrent == true && !_busy) {
        unawaited(_load());
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != _route) {
      appRouteObserver.unsubscribe(this);
      _route = route;
      if (route != null) appRouteObserver.subscribe(this, route);
    }
  }

  @override
  void didPopNext() => unawaited(_load());
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground && _route?.isCurrent == true) unawaited(_load());
  }

  Future<void> _load() async {
    if (_loading || !mounted) return;
    _loading = true;
    final readDone = _readDone = Completer<void>();
    try {
      final data = await _repo.dashboard();
      if (!mounted) return;
      setState(() {
        _data = data;
        _error = null;
      });
      final current = data['current_trip'] as Map?;
      if (current != null && !_opening && _route?.isCurrent == true) {
        _opening = true;
        unawaited(
          Navigator.pushReplacementNamed(
            context,
            AppRoutes.driverRideDetail,
            arguments: current['id'],
          ),
        );
        return;
      }
      if (data['availability'] == 'AVAILABLE' && data['eligible'] == true) {
        try {
          await _tracking.ensureStarted();
        } catch (e) {
          if (mounted) setState(() => _error = ApiResult.errorMessage(e));
        }
      } else if (!['EN_ROUTE', 'ON_TRIP'].contains(data['availability'])) {
        await _tracking.stop();
      }
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      _loading = false;
      readDone.complete();
      _readDone = null;
    }
  }

  Future<void> _act(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _readDone?.future;
      if (!mounted) return;
      await action();
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(e))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggle() async {
    await _act(() async {
      final online = _data?['availability'] == 'AVAILABLE';
      if (online) {
        await _repo.availability(false);
        await _tracking.stop();
      } else {
        try {
          await _tracking.ensureStarted();
          await _repo.availability(true);
        } catch (_) {
          await _tracking.stop(goOffline: true);
          rethrow;
        }
      }
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    appRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Stack(
      children: [
        ValueListenableBuilder<Position?>(
          valueListenable: _tracking.position,
          builder: (context, fix, _) => DriverMap(
            location: fix == null ? null : LatLng(fix.latitude, fix.longitude),
            heading: fix?.heading ?? 0,
            follow: false,
          ),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                IconButton.filledTonal(
                  tooltip: 'Settings',
                  onPressed: () =>
                      Navigator.pushNamed(context, AppRoutes.settings),
                  icon: const Icon(Icons.person_outline),
                ),
                const SizedBox(width: 12),
                const Expanded(
                  child: Text(
                    'Driver',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                  ),
                ),
                IconButton.filledTonal(
                  tooltip: 'Help',
                  onPressed: () =>
                      Navigator.pushNamed(context, AppRoutes.support),
                  icon: const Icon(Icons.support_agent),
                ),
              ],
            ),
          ),
        ),
        Align(
          alignment: Alignment.bottomCenter,
          child: SafeArea(
            top: false,
            child: Container(
              margin: const EdgeInsets.all(16),
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * .56,
              ),
              child: SingleChildScrollView(
                child: AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _data?['availability'] == 'AVAILABLE'
                            ? 'You are online'
                            : 'You are offline',
                        style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      if (_data?['vehicle'] is Map)
                        Text(
                          '${_data!['vehicle']['make']} ${_data!['vehicle']['model']} · ${_data!['vehicle']['plate_number']}',
                        ),
                      if (_error != null)
                        TextButton(
                          onPressed: _load,
                          child: Text('$_error · Retry'),
                        ),
                      ValueListenableBuilder<String?>(
                        valueListenable: _tracking.error,
                        builder: (context, error, _) => error == null
                            ? const SizedBox.shrink()
                            : Text('Location update failed: $error'),
                      ),
                      if (_data == null && _error == null)
                        const LinearProgressIndicator(),
                      if (_data != null) ...[
                        if (_data!['availability'] == 'AVAILABLE' &&
                            _data!['location_fresh'] != true)
                          const Text(
                            'Waiting for an accurate GPS fix. Offers are paused until your location recovers.',
                          ),
                        Text(
                          _data!['eligible'] == true
                              ? 'Keep precise location enabled to receive nearby offers.'
                              : 'Your driver account or active vehicle is not ready for new rides. Review your vehicles or contact Support.',
                        ),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed:
                              _busy ||
                                  (_data!['eligible'] != true &&
                                      _data!['availability'] != 'AVAILABLE')
                              ? null
                              : _toggle,
                          child: Text(
                            _busy
                                ? 'Updating…'
                                : _data!['availability'] == 'AVAILABLE'
                                ? 'Go offline'
                                : 'Go online',
                          ),
                        ),
                        if (_error != null || _data!['location_fresh'] != true)
                          Wrap(
                            children: [
                              TextButton(
                                onPressed: Geolocator.openAppSettings,
                                child: const Text('App permissions'),
                              ),
                              TextButton(
                                onPressed: Geolocator.openLocationSettings,
                                child: const Text('Location settings'),
                              ),
                            ],
                          ),
                        for (final raw
                            in (_data!['offers'] as List? ?? [])) ...[
                          const Divider(),
                          Builder(
                            builder: (context) {
                              final offer = Map<String, dynamic>.from(
                                raw as Map,
                              );
                              final ride = offer['ride'] as Map;
                              final expires = DateTime.tryParse(
                                '${offer['expires_at']}',
                              );
                              final valid =
                                  expires != null &&
                                  expires.isAfter(DateTime.now());
                              return Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  Text(
                                    'INR ${ride['estimated_fare']} · ${((ride['estimated_distance_m'] as num? ?? 0) / 1000).toStringAsFixed(1)} km',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      fontSize: 18,
                                    ),
                                  ),
                                  Text(
                                    '${ride['pickup_address']} → ${ride['dropoff_address']}',
                                  ),
                                  Text(
                                    valid
                                        ? 'Offer expires in ${expires.difference(DateTime.now()).inSeconds} seconds'
                                        : 'Offer expired',
                                  ),
                                  Row(
                                    children: [
                                      Expanded(
                                        child: FilledButton(
                                          onPressed:
                                              _busy ||
                                                  !valid ||
                                                  offer['can_accept'] != true
                                              ? null
                                              : () => _act(() async {
                                                  final id = await _repo.accept(
                                                    '${offer['id']}',
                                                  );
                                                  if (context.mounted) {
                                                    _opening = true;
                                                    unawaited(
                                                      Navigator.pushReplacementNamed(
                                                        context,
                                                        AppRoutes
                                                            .driverRideDetail,
                                                        arguments: id,
                                                      ),
                                                    );
                                                  }
                                                }),
                                          child: const Text('Accept'),
                                        ),
                                      ),
                                      TextButton(
                                        onPressed: _busy || !valid
                                            ? null
                                            : () => _act(
                                                () => _repo.reject(
                                                  '${offer['id']}',
                                                ),
                                              ),
                                        child: const Text('Decline'),
                                      ),
                                    ],
                                  ),
                                ],
                              );
                            },
                          ),
                        ],
                        if ((_data!['offers'] as List? ?? []).isEmpty &&
                            _data!['availability'] == 'AVAILABLE')
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 12),
                            child: Text(
                              'Waiting for nearby ride requests. Offers update automatically.',
                            ),
                          ),
                      ],
                      const Divider(),
                      Wrap(
                        spacing: 8,
                        children: [
                          TextButton(
                            onPressed: _data?['exited'] == true
                                ? null
                                : () => Navigator.pushNamed(
                                    context,
                                    AppRoutes.driverVehicles,
                                  ),
                            child: const Text('My vehicles'),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pushNamed(
                              context,
                              AppRoutes.driverRides,
                            ),
                            child: const Text('Trip history'),
                          ),
                          TextButton(
                            onPressed: () => Navigator.pushNamed(
                              context,
                              AppRoutes.driverExit,
                            ),
                            child: const Text('Exit & dues'),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );
}

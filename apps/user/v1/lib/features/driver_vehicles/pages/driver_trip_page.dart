import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_operations/navigation_progress.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/driver_operations/widgets/trip_actions_panel.dart';

class DriverTripPage extends StatefulWidget {
  const DriverTripPage({super.key});
  @override
  State<DriverTripPage> createState() => _DriverTripPageState();
}

class _DriverTripPageState extends State<DriverTripPage>
    with WidgetsBindingObserver {
  final _ops = DriverOperationsRepository();
  final _tracking = DriverTrackingService.instance;
  String? _id, _error, _navError, _navTarget, _offersError;
  Map<String, dynamic>? _trip, _context;
  List<Map<String, dynamic>> _offers = [];
  List<LatLng> _points = [];
  List<Map<String, dynamic>> _steps = [];
  NavigationProgress? _progress;
  Timer? _poll, _clock;
  Completer<void>? _readDone;
  DateTime? _lastNavigation;
  bool _loading = false,
      _busy = false,
      _readingOffers = false,
      _navigating = false,
      _foreground = true,
      _follow = true;
  bool get _active => [
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_WAITING',
    'IN_PROGRESS',
  ].contains(_trip?['status']);
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tracking.position.addListener(_positionChanged);
    _tracking.error.addListener(_trackingErrorChanged);
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_foreground && ModalRoute.of(context)?.isCurrent == true && !_busy) {
        unawaited(_load());
      }
    });
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _foreground && _trip?['status'] == 'DRIVER_WAITING') {
        setState(() {});
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_id != null) return;
    _id = ModalRoute.of(context)?.settings.arguments as String? ?? '';
    unawaited(_load());
  }

  Future<void> _load() async {
    if (_loading || !mounted || _id == null) return;
    _loading = true;
    final readDone = _readDone = Completer<void>();
    try {
      final data = await _ops.context(_id!);
      if (data['is_driver'] != true || data['trip'] is! Map) {
        throw StateError('This trip is not available to your driver account.');
      }
      if (!mounted) return;
      setState(() {
        _trip = Map<String, dynamic>.from(data['trip'] as Map);
        _context = data;
        _error = null;
      });
      try {
        await _tracking.syncTrip(
          activeTrip: _active || _context?['driver_has_active_trip'] == true,
          availability: _context?['driver_availability'] as String?,
        );
      } catch (e) {
        if (mounted) setState(() => _navError = ApiResult.errorMessage(e));
      }
      if (_active) unawaited(_navigation());
      if (_trip?['status'] == 'IN_PROGRESS') {
        unawaited(_refreshOffers());
      }
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      _loading = false;
      readDone.complete();
      _readDone = null;
    }
  }

  Future<void> _refreshOffers() async {
    if (_readingOffers || !mounted || _trip?['status'] != 'IN_PROGRESS') return;
    _readingOffers = true;
    try {
      final dash = await _ops.dashboard();
      if (!mounted || _trip?['status'] != 'IN_PROGRESS') return;
      setState(() {
        _offers = (dash['offers'] as List? ?? [])
            .map((v) => Map<String, dynamic>.from(v as Map))
            .toList();
        _offersError = null;
      });
    } catch (e) {
      if (mounted && _trip?['status'] == 'IN_PROGRESS') {
        setState(() {
          _offers = [];
          _offersError = ApiResult.errorMessage(e);
        });
      }
    } finally {
      _readingOffers = false;
    }
  }

  void _positionChanged() {
    if (!mounted || !_foreground || ModalRoute.of(context)?.isCurrent != true) {
      return;
    }
    final fix = _tracking.position.value;
    if (fix == null) return;
    setState(
      () => _progress = NavigationProgress.calculate(
        LatLng(fix.latitude, fix.longitude),
        _points,
        _steps,
      ),
    );
    if (_active && (_progress!.offRouteMetres > 60 || _points.isEmpty)) {
      unawaited(_navigation());
    }
  }

  void _trackingErrorChanged() {
    if (mounted && _foreground && ModalRoute.of(context)?.isCurrent == true) {
      setState(() {});
    }
  }

  Future<void> _navigation({bool force = false}) async {
    final fix = _tracking.position.value;
    if (!_active || fix == null || _navigating) return;
    final target = _trip!['status'] == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP';
    if (!force &&
        target == _navTarget &&
        _lastNavigation != null &&
        DateTime.now().difference(_lastNavigation!).inSeconds < 15) {
      return;
    }
    if (!force &&
        target == _navTarget &&
        _points.isNotEmpty &&
        (_progress?.offRouteMetres ?? 0) < 60) {
      return;
    }
    if (_navTarget != target) {
      _points = [];
      _steps = [];
      _progress = null;
    }
    _navTarget = target;
    _navigating = true;
    _lastNavigation = DateTime.now();
    try {
      final route = await _ops.navigation(_id!, fix.latitude, fix.longitude);
      if (!mounted ||
          !_active ||
          (_trip!['status'] == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP') !=
              target) {
        return;
      }
      final points = (route['geometry'] as List).map((v) {
        final p = v as List;
        return LatLng((p[1] as num).toDouble(), (p[0] as num).toDouble());
      }).toList();
      final steps = (route['steps'] as List? ?? [])
          .map((v) => Map<String, dynamic>.from(v as Map))
          .toList();
      setState(() {
        _points = points;
        _steps = steps;
        _navTarget = target;
        _navError = steps.isEmpty
            ? 'Turn instructions are unavailable for this route. Retry navigation.'
            : null;
        _progress = NavigationProgress.calculate(
          LatLng(fix.latitude, fix.longitude),
          points,
          steps,
        );
      });
    } catch (e) {
      if (mounted) setState(() => _navError = ApiResult.errorMessage(e));
    } finally {
      _navigating = false;
      if (mounted &&
          _active &&
          (_trip!['status'] == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP') !=
              target) {
        unawaited(_navigation(force: true));
      }
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

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground && mounted && ModalRoute.of(context)?.isCurrent == true) {
      _positionChanged();
      unawaited(_load());
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _clock?.cancel();
    _tracking.position.removeListener(_positionChanged);
    _tracking.error.removeListener(_trackingErrorChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  LatLng? _point(String prefix) {
    final latitude = double.tryParse('${_trip?['${prefix}_latitude']}'),
        longitude = double.tryParse('${_trip?['${prefix}_longitude']}');
    return latitude == null || longitude == null
        ? null
        : LatLng(latitude, longitude);
  }

  @override
  Widget build(BuildContext context) {
    final fix = _tracking.position.value;
    return PopScope(
      canPop: !_active,
      child: Scaffold(
        body: Stack(
          children: [
            DriverMap(
              location: fix == null
                  ? null
                  : LatLng(fix.latitude, fix.longitude),
              heading: fix?.heading ?? 0,
              pickup: _point('pickup'),
              dropoff: _point('dropoff'),
              route: _points,
              follow: _follow,
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        IconButton.filledTonal(
                          tooltip: 'Settings',
                          onPressed: () =>
                              Navigator.pushNamed(context, AppRoutes.settings),
                          icon: const Icon(Icons.settings_outlined),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            '${_trip?['status'] ?? 'Loading trip'}'.replaceAll(
                              '_',
                              ' ',
                            ),
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
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
                    if (_active)
                      AppCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _trip?['status'] == 'IN_PROGRESS'
                                  ? 'Navigate to drop-off'
                                  : 'Navigate to pickup',
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            Text(
                              _progress?.instruction ??
                                  'Waiting for GPS and route instructions',
                            ),
                            if (_progress != null)
                              Text(
                                '${_progress!.nextTurnMetres.round()} m to next maneuver · ${(_progress!.remainingMetres / 1000).toStringAsFixed(1)} km remaining',
                              ),
                            if (_navError != null)
                              Text(
                                _navError!,
                                style: const TextStyle(
                                  color: AppColors.googleRed,
                                ),
                              ),
                            if (_tracking.error.value != null)
                              Text(
                                'Location update failed: ${_tracking.error.value}',
                              ),
                            if (_navError != null ||
                                _tracking.error.value != null ||
                                _context?['driver_location_fresh'] == false)
                              Wrap(
                                children: [
                                  TextButton(
                                    onPressed: Geolocator.openAppSettings,
                                    child: const Text('Location permissions'),
                                  ),
                                  TextButton(
                                    onPressed: Geolocator.openLocationSettings,
                                    child: const Text('Device location'),
                                  ),
                                ],
                              ),
                            Row(
                              children: [
                                TextButton(
                                  onPressed: () => _navigation(force: true),
                                  child: const Text('Reroute'),
                                ),
                                TextButton(
                                  onPressed: () =>
                                      setState(() => _follow = !_follow),
                                  child: Text(
                                    _follow ? 'Browse map' : 'Follow location',
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),
            DraggableScrollableSheet(
              initialChildSize: .43,
              minChildSize: .23,
              maxChildSize: .8,
              builder: (context, controller) => Container(
                decoration: const BoxDecoration(
                  color: Color(0xFFFAFAFA),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
                ),
                child: ListView(
                  controller: controller,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
                  children: [
                    Center(
                      child: Container(
                        width: 42,
                        height: 4,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: AppColors.borderGrey,
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                    ),
                    if (_trip == null && _error == null)
                      const LinearProgressIndicator(),
                    if (_error != null)
                      AppLoadError(message: _error!, onRetry: _load),
                    if (_trip != null) ...[
                      Text(
                        '${_trip!['pickup_address']} → ${_trip!['dropoff_address']}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                        ),
                      ),
                      Text(
                        'Fare INR ${_trip!['final_fare'] ?? _trip!['estimated_fare'] ?? 'Pending'} · Trip ${_trip!['id']}',
                      ),
                      if (_trip!['rider'] is Map)
                        Text(
                          'Rider: ${_trip!['rider']['first_name'] ?? ''} ${_trip!['rider']['last_name'] ?? ''}',
                        ),
                      const SizedBox(height: 12),
                      if ([
                        'DRIVER_ASSIGNED',
                        'DRIVER_ARRIVING',
                      ].contains(_trip!['status']))
                        FilledButton(
                          onPressed: _busy
                              ? null
                              : () => _act(() async {
                                  await _tracking.freshFix();
                                  await _ops.arrive(_id!);
                                }),
                          child: const Text('I have arrived at pickup'),
                        ),
                      if (_trip!['status'] == 'DRIVER_WAITING')
                        Builder(
                          builder: (context) {
                            final arrived = DateTime.tryParse(
                              '${_trip!['arrived_at']}',
                            );
                            final elapsed = arrived == null
                                ? 0
                                : DateTime.now().difference(arrived).inSeconds;
                            return Text(
                              'Waiting ${elapsed ~/ 60}m ${elapsed % 60}s · Free waiting ends after ${(_context?['free_wait_minutes'] ?? 5)} minutes. Call the rider before reporting no-show.',
                            );
                          },
                        ),
                      if (_trip!['status'] == 'IN_PROGRESS')
                        FilledButton(
                          onPressed: _busy
                              ? null
                              : () => _act(() async {
                                  final confirm = await showDialog<bool>(
                                    context: context,
                                    builder: (ctx) => AlertDialog(
                                      title: const Text('Complete this ride?'),
                                      content: Text(
                                        'Confirm the rider has reached the destination. Fare INR ${_trip!['estimated_fare']} will remain unchanged.',
                                      ),
                                      actions: [
                                        TextButton(
                                          onPressed: () =>
                                              Navigator.pop(ctx, false),
                                          child: const Text('Continue ride'),
                                        ),
                                        TextButton(
                                          onPressed: () =>
                                              Navigator.pop(ctx, true),
                                          child: const Text('Complete'),
                                        ),
                                      ],
                                    ),
                                  );
                                  if (confirm == true) {
                                    await _ops.complete(_id!);
                                  }
                                }),
                          child: const Text('Complete ride'),
                        ),
                      if (_context != null)
                        TripActionsPanel(
                          rideId: _id!,
                          externalContext: _context,
                          onChanged: () async {
                            await _readDone?.future;
                            await _load();
                          },
                        ),
                      if (_trip!['status'] == 'IN_PROGRESS' &&
                          _offersError != null)
                        TextButton(
                          onPressed: _readingOffers ? null : _refreshOffers,
                          child: Text(
                            'Nearby offers unavailable: $_offersError. Retry',
                          ),
                        ),
                      if (_trip!['status'] == 'IN_PROGRESS' &&
                          _offers.isNotEmpty)
                        ExpansionTile(
                          title: Text(
                            '${_offers.length} nearby offers · view only',
                          ),
                          subtitle: const Text(
                            'Finish this ride before accepting another.',
                          ),
                          children: [
                            for (final offer in _offers)
                              ListTile(
                                title: Text(
                                  'INR ${offer['ride']['estimated_fare']}',
                                ),
                                subtitle: Text(
                                  '${offer['ride']['pickup_address']} → ${offer['ride']['dropoff_address']}',
                                ),
                              ),
                          ],
                        ),
                      if (!_active)
                        OutlinedButton(
                          onPressed: () => Navigator.pushNamedAndRemoveUntil(
                            context,
                            AppRoutes.gate,
                            (_) => false,
                          ),
                          child: const Text('Return to driver home'),
                        ),
                    ],
                    if (_busy) const LinearProgressIndicator(),
                    ValueListenableBuilder<String?>(
                      valueListenable: _tracking.error,
                      builder: (context, error, _) => error == null
                          ? const SizedBox.shrink()
                          : Text(
                              'Location sharing needs attention: $error',
                              style: const TextStyle(
                                color: AppColors.googleRed,
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

import 'package:user/features/driver_vehicles/controllers/driver_trip_controller.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_operations/navigation_progress.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';
import 'package:user/features/driver_operations/widgets/trip_actions_panel.dart';
import 'package:user/features/rides/ride_display.dart';

class DriverTripPage extends StatefulWidget {
  final DriverOperationsRepository? repository;
  final DriverTrackingService? tracking;
  final Widget Function(Widget)? mapBuilder;
  const DriverTripPage({
    super.key,
    this.repository,
    this.tracking,
    this.mapBuilder,
  });
  @override
  State<DriverTripPage> createState() => _DriverTripPageState();
}

class _DriverTripPageState extends State<DriverTripPage>
    with WidgetsBindingObserver {
  late final _controller = DriverTripController(
    widget.repository ?? DriverOperationsRepository(),
    widget.tracking ?? DriverTrackingService.instance,
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  DriverOperationsRepository get _ops => _controller.ops;
  DriverTrackingService get _tracking => _controller.tracking;
  String? get _id => _controller.id;
  set _id(String? value) => _controller.id = value;
  String? get _error => _controller.error;
  String? get _navError => _controller.navError;
  String? get _offersError => _controller.offersError;
  Map<String, dynamic>? get _trip => _controller.trip;
  Map<String, dynamic>? get _context => _controller.context;
  List<Map<String, dynamic>> get _offers => _controller.offers;
  List<LatLng> get _points => _controller.points;
  List<Map<String, dynamic>> get _steps => _controller.steps;
  NavigationProgress? get _progress => _controller.progress;
  set _progress(NavigationProgress? value) => _controller.progress = value;
  Timer? _poll, _clock;
  Completer<void>? get _readDone => _controller.readDone;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool get _readingOffers => _controller.readingOffers;
  bool get _foreground => _controller.foreground;
  set _foreground(bool value) => _controller.foreground = value;
  bool get _follow => _controller.follow;
  set _follow(bool value) => _controller.follow = value;
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

  Future<void> _load() => _controller.load();

  Future<void> _refreshOffers() => _controller.refreshOffers();

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

  Future<void> _navigation({bool force = false}) =>
      _controller.navigation(force: force);

  Future<void> _act(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _readDone?.future;
      if (!mounted) return;
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(e))));
      }
    } finally {
      // A failed response can still follow a committed arrival/completion.
      await _load();
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
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _poll?.cancel();
    _clock?.cancel();
    _tracking.position.removeListener(_positionChanged);
    _tracking.error.removeListener(_trackingErrorChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  LatLng? _point(String prefix) {
    return ridePoint(
      _trip?['${prefix}_latitude'],
      _trip?['${prefix}_longitude'],
    );
  }

  Widget _navigationPanel(BuildContext context) {
    final trackingError = _tracking.error.value;
    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * .28,
      ),
      child: SingleChildScrollView(
        child: LiquidGlassSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                _trip?['status'] == 'IN_PROGRESS'
                    ? 'Navigate to drop-off'
                    : 'Navigate to pickup',
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 4),
              Text(
                _progress?.instruction ??
                    'Waiting for GPS and route instructions',
              ),
              if (_progress != null) ...[
                const SizedBox(height: 3),
                Text(
                  '${_progress!.nextTurnMetres.round()} m to next maneuver · ${(_progress!.remainingMetres / 1000).toStringAsFixed(1)} km remaining',
                  style: const TextStyle(
                    color: GlassTokens.muted,
                    fontSize: 12.5,
                  ),
                ),
              ],
              if (_navError != null) ...[
                const SizedBox(height: 10),
                DriverNotice(
                  icon: Icons.alt_route_rounded,
                  message: _navError!,
                  error: true,
                ),
              ],
              if (trackingError != null) ...[
                const SizedBox(height: 10),
                DriverNotice(
                  icon: Icons.location_off_rounded,
                  message: 'Location update failed: $trackingError',
                  error: true,
                ),
              ],
              const SizedBox(height: 6),
              Wrap(
                spacing: 4,
                runSpacing: 2,
                children: [
                  TextButton.icon(
                    onPressed: () => _navigation(force: true),
                    icon: const Icon(Icons.alt_route_rounded, size: 18),
                    label: const Text('Reroute'),
                  ),
                  TextButton.icon(
                    onPressed: () => setState(() => _follow = !_follow),
                    icon: Icon(
                      _follow
                          ? Icons.pan_tool_alt_outlined
                          : Icons.my_location_rounded,
                      size: 18,
                    ),
                    label: Text(_follow ? 'Browse map' : 'Follow location'),
                  ),
                  if (_navError != null ||
                      trackingError != null ||
                      _context?['driver_location_fresh'] == false)
                    TextButton.icon(
                      onPressed: Geolocator.openLocationSettings,
                      icon: const Icon(Icons.gps_fixed_rounded, size: 18),
                      label: const Text('Location settings'),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _nearbyOffers() => LiquidGlassSurface(
    padding: EdgeInsets.zero,
    child: Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        shape: const Border(),
        collapsedShape: const Border(),
        title: Text('${_offers.length} nearby offers · view only'),
        subtitle: const Text('Finish this ride before accepting another.'),
        childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
        children: [
          for (final offer in _offers) ...[
            Builder(
              builder: (context) {
                final ride = rideMap(offer['ride']);
                return LiquidGlassSurface(
                  padding: const EdgeInsets.all(13),
                  child: Column(
                    children: [
                      DriverInfoRow(
                        label: 'Estimated fare',
                        value: rideMoney(ride['estimated_fare']),
                      ),
                      DriverInfoRow(
                        label: 'Pickup',
                        value: '${ride['pickup_address'] ?? 'Unavailable'}',
                      ),
                      DriverInfoRow(
                        label: 'Drop-off',
                        value: '${ride['dropoff_address'] ?? 'Unavailable'}',
                      ),
                    ],
                  ),
                );
              },
            ),
            const SizedBox(height: 8),
          ],
        ],
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final fix = _tracking.position.value;
    return PopScope(
      canPop: !_active,
      child: LiquidGlassScope(
        child: Scaffold(
          body: LiquidGlassBackdrop(
            child: Stack(
              children: [
                widget.mapBuilder?.call(_map(fix)) ?? _map(fix),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Row(
                          children: [
                            LiquidGlassIconButton(
                              tooltip: 'Settings',
                              onPressed: () => Navigator.pushNamed(
                                context,
                                AppRoutes.settings,
                              ),
                              icon: Icons.settings_outlined,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: LiquidGlassSurface(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 12,
                                ),
                                child: Text(
                                  '${_trip?['status'] ?? 'Loading trip'}'
                                      .replaceAll('_', ' '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    fontSize: 15,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            LiquidGlassIconButton(
                              tooltip: 'Help',
                              onPressed: () => Navigator.pushNamed(
                                context,
                                AppRoutes.support,
                              ),
                              icon: Icons.support_agent,
                            ),
                          ],
                        ),
                        if (_active) ...[
                          const SizedBox(height: 10),
                          _navigationPanel(context),
                        ],
                      ],
                    ),
                  ),
                ),
                DraggableScrollableSheet(
                  initialChildSize: .43,
                  minChildSize: .23,
                  maxChildSize: .8,
                  builder: (context, controller) => LiquidGlassSurface(
                    radius: 30,
                    padding: EdgeInsets.zero,
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
                              color: GlassTokens.muted.withValues(alpha: .35),
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                        if (_trip == null && _error == null)
                          const DriverListSkeleton(rows: 3),
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
                            LiquidGlassButton(
                              onPressed: _busy
                                  ? null
                                  : () => _act(() async {
                                      await _tracking.freshFix();
                                      if (!mounted) return;
                                      await _ops.arrive(_id!);
                                    }),
                              text: 'I have arrived at pickup',
                              icon: const Icon(Icons.location_on_outlined),
                              busy: _busy,
                            ),
                          if (_trip!['status'] == 'DRIVER_WAITING')
                            Builder(
                              builder: (context) {
                                final arrived = DateTime.tryParse(
                                  '${_trip!['arrived_at']}',
                                );
                                final elapsed = arrived == null
                                    ? 0
                                    : DateTime.now()
                                          .difference(arrived)
                                          .inSeconds;
                                return Text(
                                  'Waiting ${elapsed ~/ 60}m ${elapsed % 60}s · Free waiting ends after ${(_context?['free_wait_minutes'] ?? 5)} minutes. Call the rider before reporting no-show.',
                                );
                              },
                            ),
                          if (_trip!['status'] == 'IN_PROGRESS')
                            LiquidGlassButton(
                              onPressed: _busy
                                  ? null
                                  : () => _act(() async {
                                      final confirm = await showDialog<bool>(
                                        context: context,
                                        builder: (ctx) => LiquidGlassDialog(
                                          title: const Text(
                                            'Complete this ride?',
                                          ),
                                          content: Text(
                                            'Confirm the rider has reached the destination. Fare INR ${_trip!['estimated_fare']} will remain unchanged.',
                                          ),
                                          actions: [
                                            TextButton(
                                              onPressed: () =>
                                                  Navigator.pop(ctx, false),
                                              child: const Text(
                                                'Continue ride',
                                              ),
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
                              text: 'Complete ride',
                              icon: const Icon(Icons.flag_outlined),
                              busy: _busy,
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
                            DriverNotice(
                              icon: Icons.radar_rounded,
                              message:
                                  'Nearby offers are unavailable: $_offersError',
                              error: true,
                              actionLabel: 'Retry',
                              onAction: _readingOffers ? null : _refreshOffers,
                            ),
                          if (_trip!['status'] == 'IN_PROGRESS' &&
                              _offers.isNotEmpty)
                            _nearbyOffers(),
                          if (!_active)
                            LiquidGlassButton(
                              onPressed: () =>
                                  Navigator.pushNamedAndRemoveUntil(
                                    context,
                                    AppRoutes.gate,
                                    (_) => false,
                                  ),
                              text: 'Return to driver home',
                              icon: const Icon(Icons.home_outlined),
                            ),
                        ],
                        if (_busy)
                          const DriverNotice(
                            icon: Icons.hourglass_top_rounded,
                            message: 'Updating this trip securely…',
                          ),
                        ValueListenableBuilder<String?>(
                          valueListenable: _tracking.error,
                          builder: (context, error, _) => error == null
                              ? const SizedBox.shrink()
                              : DriverNotice(
                                  icon: Icons.location_off_rounded,
                                  message:
                                      'Location sharing needs attention: $error',
                                  error: true,
                                ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _map(Position? fix) => DriverMap(
    location: fix == null ? null : ridePoint(fix.latitude, fix.longitude),
    heading: fix?.heading ?? 0,
    pickup: _point('pickup'),
    dropoff: _point('dropoff'),
    route: _points,
    follow: _follow,
  );
}

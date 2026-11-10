import 'package:user/features/partner_program/controllers/driver_home_controller.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/driver_vehicles/widgets/driver_vehicle_gate.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/driver_vehicles/pages/driver_request_page.dart';

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
  late final _controller = DriverHomeController()
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (!mounted) return;
    setState(() {});
    if (_opening || _busy || _route?.isCurrent != true) return;
    final offer = rideMaps(_data?['offers'])
        .where(
          (row) =>
              row['can_accept'] == true &&
              !_controller.presentedOfferIds.contains('${row['id']}') &&
              (DateTime.tryParse(
                    '${row['expires_at']}',
                  )?.isAfter(DateTime.now()) ??
                  false),
        )
        .firstOrNull;
    if (offer != null) {
      _controller.presentedOfferIds.add('${offer['id']}');
      _opening = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_openRequest(offer));
      });
    }
  }

  Future<void> _openRequest(Map<String, dynamic> offer) async {
    _opening = true;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => DriverRequestPage(offer: offer, repository: _repo),
      ),
    );
    if (mounted) {
      _opening = false;
      await _load();
    }
  }

  DriverOperationsRepository get _repo => _controller.repo;
  DriverTrackingService get _tracking => _controller.tracking;
  Map<String, dynamic>? get _data => _controller.data;
  String? get _error => _controller.error;
  Timer? _poll;
  Completer<void>? get _readDone => _controller.readDone;
  ModalRoute<dynamic>? _route;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool get _opening => _controller.opening;
  set _opening(bool value) => _controller.opening = value;
  bool get _foreground => _controller.foreground;
  set _foreground(bool value) => _controller.foreground = value;

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
    await _controller.load();
    if (!mounted) return;
    final current = rideMap(_data?['current_trip']);
    if (current.isNotEmpty &&
        current['id'] != null &&
        !_opening &&
        _route?.isCurrent == true) {
      _opening = true;
      unawaited(
        Navigator.pushReplacementNamed(
          context,
          AppRoutes.driverRideDetail,
          arguments: current['id'],
        ),
      );
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
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggle() => _act(() async {
    final online = _data?['availability'] == 'AVAILABLE';
    if (online) {
      await _repo.availability(false);
      await _tracking.stop();
      return;
    }
    try {
      await _tracking.ensureStarted();
      if (!mounted) return;
      if (!_tracking.running) {
        throw StateError(
          'Location tracking stopped. Refresh location before going online.',
        );
      }
      await _repo.availability(true);
    } catch (_) {
      await _tracking.stop(goOffline: true);
      rethrow;
    }
  });

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _poll?.cancel();
    appRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Widget _topBar() => SafeArea(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          LiquidGlassIconButton(
            tooltip: 'Settings',
            onPressed: () => Navigator.pushNamed(context, AppRoutes.settings),
            icon: Icons.person_outline_rounded,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: LiquidGlassSurface(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Driver mode',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Semantics(
                    label: _data?['availability'] == 'AVAILABLE'
                        ? 'Driver is online'
                        : 'Driver is offline',
                    child: Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _data?['availability'] == 'AVAILABLE'
                            ? const Color(0xFF198754)
                            : GlassTokens.muted,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          LiquidGlassIconButton(
            tooltip: 'Help',
            onPressed: () => Navigator.pushNamed(context, AppRoutes.support),
            icon: Icons.support_agent_rounded,
          ),
        ],
      ),
    ),
  );

  Widget _offer(Map<String, dynamic> offer) {
    final ride = rideMap(offer['ride']);
    final expires = DateTime.tryParse('${offer['expires_at']}');
    final valid = expires != null && expires.isAfter(DateTime.now());
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: LiquidGlassSurface(
        padding: const EdgeInsets.all(15),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${rideMoney(ride['estimated_fare'])} · ${rideDistance(ride['estimated_distance_m'])}',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                DriverStatusPill(
                  label: valid ? 'Live' : 'Expired',
                  status: valid ? 'AVAILABLE' : 'REJECTED',
                ),
              ],
            ),
            const SizedBox(height: 8),
            DriverInfoRow(label: 'Pickup', value: '${ride['pickup_address']}'),
            DriverInfoRow(
              label: 'Passengers',
              value: '${ride['passenger_count'] ?? 1}',
            ),
            DriverInfoRow(
              label: 'Drop-off',
              value: '${ride['dropoff_address']}',
            ),
            const SizedBox(height: 8),
            Text(
              valid
                  ? 'Expires in ${expires.difference(DateTime.now()).inSeconds} seconds'
                  : 'This offer has expired',
              style: const TextStyle(color: GlassTokens.muted, fontSize: 12),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: LiquidGlassButton(
                    text: 'View request',
                    icon: const Icon(Icons.route_outlined),
                    onPressed: _busy || !valid || offer['can_accept'] != true
                        ? null
                        : () => _openRequest(offer),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: _busy || !valid
                      ? null
                      : () => _act(() => _repo.reject('${offer['id']}')),
                  child: const Text('Decline'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _workspaceLink(
    IconData icon,
    String title,
    String subtitle,
    String route, {
    bool enabled = true,
  }) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: DriverLinkTile(
      icon: icon,
      title: title,
      subtitle: subtitle,
      onTap: enabled ? () => Navigator.pushNamed(context, route) : null,
    ),
  );

  Widget _panel() {
    final data = _data;
    final offers = rideMaps(
      data?['offers'],
    ).where((offer) => rideMap(offer['ride']).isNotEmpty);
    return LiquidGlassSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DriverPageIntro(
            icon: data?['availability'] == 'AVAILABLE'
                ? Icons.online_prediction_rounded
                : Icons.power_settings_new_rounded,
            title: data?['availability'] == 'AVAILABLE'
                ? 'Ready for nearby rides'
                : 'You are offline',
            description: data?['eligible'] == true
                ? 'Keep precise location enabled while you are available.'
                : 'Complete account and vehicle requirements before taking rides.',
          ),
          if (data?['vehicle'] is Map) ...[
            const SizedBox(height: 12),
            DriverNotice(
              icon: Icons.directions_car_filled_outlined,
              message:
                  '${data!['vehicle']['make']} ${data['vehicle']['model']} · ${data['vehicle']['plate_number']}',
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 10),
            DriverNotice(
              icon: Icons.sync_problem_rounded,
              message: _error!,
              error: true,
              actionLabel: 'Retry',
              onAction: _load,
            ),
          ],
          ValueListenableBuilder<String?>(
            valueListenable: _tracking.error,
            builder: (context, error, child) => error == null
                ? const SizedBox.shrink()
                : Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: DriverNotice(
                      icon: Icons.location_off_rounded,
                      message: 'Location update failed: $error',
                      error: true,
                    ),
                  ),
          ),
          if (data == null && _error == null)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: DriverListSkeleton(rows: 2),
            ),
          if (data != null) ...[
            if (data['availability'] == 'AVAILABLE' &&
                data['location_fresh'] != true) ...[
              const SizedBox(height: 10),
              const DriverNotice(
                icon: Icons.gps_not_fixed_rounded,
                message:
                    'Waiting for an accurate GPS fix. Offers are paused until location recovers.',
              ),
            ],
            const SizedBox(height: 12),
            LiquidGlassButton(
              text: _busy
                  ? 'Updating…'
                  : data['availability'] == 'AVAILABLE'
                  ? 'Go offline'
                  : 'Go online',
              icon: Icon(
                data['availability'] == 'AVAILABLE'
                    ? Icons.power_settings_new_rounded
                    : Icons.online_prediction_rounded,
              ),
              busy: _busy,
              onPressed:
                  _busy ||
                      (data['eligible'] != true &&
                          data['availability'] != 'AVAILABLE')
                  ? null
                  : _toggle,
            ),
            if (_error != null || data['location_fresh'] != true)
              Wrap(
                alignment: WrapAlignment.center,
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
            for (final offer in offers) _offer(offer),
            if (offers.isEmpty && data['availability'] == 'AVAILABLE') ...[
              const SizedBox(height: 12),
              const DriverNotice(
                icon: Icons.radar_rounded,
                message:
                    'Waiting for nearby requests. Offers refresh automatically.',
              ),
            ],
          ],
          const SizedBox(height: 16),
          const AppSectionLabel('Driver workspace'),
          _workspaceLink(
            Icons.directions_car_filled_outlined,
            'My vehicles',
            'Registration, documents and verification',
            AppRoutes.driverVehicles,
            enabled: data?['exited'] != true,
          ),
          _workspaceLink(
            Icons.route_outlined,
            'Trip history',
            'Completed and cancelled rides',
            AppRoutes.driverRides,
          ),
          _workspaceLink(
            Icons.account_balance_wallet_outlined,
            'Account & earnings',
            'Profile, payout and safety settings',
            AppRoutes.driverAccount,
          ),
          _workspaceLink(
            Icons.logout_rounded,
            'Exit & dues',
            'Partner exit and settlement records',
            AppRoutes.driverExit,
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: Scaffold(
      body: LiquidGlassBackdrop(
        child: Stack(
          children: [
            ValueListenableBuilder<Position?>(
              valueListenable: _tracking.position,
              builder: (context, fix, child) => DriverMap(
                location: fix == null
                    ? null
                    : LatLng(fix.latitude, fix.longitude),
                heading: fix?.heading ?? 0,
                follow: false,
              ),
            ),
            _topBar(),
            Align(
              alignment: Alignment.bottomCenter,
              child: SafeArea(
                top: false,
                child: Container(
                  margin: const EdgeInsets.all(16),
                  constraints: BoxConstraints(
                    maxHeight: MediaQuery.sizeOf(context).height * .58,
                  ),
                  child: SingleChildScrollView(child: _panel()),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

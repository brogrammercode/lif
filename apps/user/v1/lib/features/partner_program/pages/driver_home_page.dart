import 'package:user/components/ui/app_error_snackbar.dart';
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/components/ui/location_access_sheet.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_operations/widgets/driver_go_online_stage.dart';
import 'package:user/features/driver_vehicles/widgets/driver_vehicle_gate.dart';
import 'package:user/features/partner_program/controllers/driver_home_controller.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/driver_vehicles/pages/driver_request_page.dart';
import 'package:user/features/driver_vehicles/pages/driver_trip_page.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/rides/widgets/ride_sheet_route.dart';

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
  Timer? _poll;
  ModalRoute<dynamic>? _route;
  bool _rideSheetOpen = false;
  bool _returningToRider = false;
  DriverMap? _rideSheetMap;

  Widget _rideMapBuilder(Widget map) {
    if (map is! DriverMap) return const SizedBox.shrink();
    return reportRideSheetMap(map, (next) {
      if (mounted && _rideSheetOpen) setState(() => _rideSheetMap = next);
    });
  }

  DriverOperationsRepository get _repo => _controller.repo;
  DriverTrackingService get _tracking => _controller.tracking;
  Map<String, dynamic>? get _data => _controller.data;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool get _opening => _controller.opening;
  set _opening(bool value) => _controller.opening = value;
  bool get _foreground => _controller.foreground;
  set _foreground(bool value) => _controller.foreground = value;

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
    setState(() => _rideSheetOpen = true);
    await Navigator.push(
      context,
      RideSheetRoute<void>(
        builder: (_) => DriverRequestPage(
          offer: offer,
          repository: _repo,
          mapBuilder: _rideMapBuilder,
        ),
      ),
    );
    if (mounted) {
      _opening = false;
      await _load();
    }
  }

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
  void didPopNext() {
    setState(() {
      _rideSheetOpen = false;
      _rideSheetMap = null;
      _opening = false;
    });
    unawaited(_load());
    unawaited(_controller.loadOwnedVehicles(force: true));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground && _route?.isCurrent == true) unawaited(_load());
  }

  Future<void> _load() async {
    await _controller.load();
    if (!mounted) return;
    if (_data?['exited'] == true) {
      if (!_returningToRider && _route?.isCurrent == true) {
        _returningToRider = true;
        Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.gate,
          (_) => false,
        );
      }
      return;
    }
    final current = rideMap(_data?['current_trip']);
    if (current.isNotEmpty &&
        current['id'] != null &&
        !_opening &&
        _route?.isCurrent == true) {
      _opening = true;
      setState(() => _rideSheetOpen = true);
      unawaited(
        Navigator.push(
          context,
          RideSheetRoute<void>(
            settings: RouteSettings(
              name: AppRoutes.driverRideDetail,
              arguments: '${current['id']}',
            ),
            builder: (_) =>
                DriverTripPage(repository: _repo, mapBuilder: _rideMapBuilder),
          ),
        ),
      );
    }
  }

  Future<void> _perform(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _controller.readDone?.future;
      if (!mounted) return;
      await action();
      await _load();
    } catch (error) {
      if (mounted) {
        showAppError(context, ApiResult.errorMessage(error));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _ensureLocationAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      if (!mounted) throw StateError('The page is no longer active.');
      final open = await LocationAccessSheet.show(
        context,
        title: 'Turn on location services',
        message:
            'Location is needed to receive nearby ride requests and share your live position during a trip.',
        actionLabel: 'Open location settings',
        secondaryLabel: 'Not now',
      );
      if (!mounted) throw StateError('The page is no longer active.');
      if (open == true) {
        await Geolocator.openLocationSettings();
      }
      if (open != true) {
        throw StateError('Location services are required to go online.');
      }
      throw StateError('Return here after enabling location services.');
    }

    var permission = await Geolocator.checkPermission();
    if (!mounted) throw StateError('The page is no longer active.');
    if (permission == LocationPermission.deniedForever) {
      final open = await LocationAccessSheet.show(
        context,
        title: 'Allow location access',
        message:
            'Enable location access in settings so nearby ride requests can be matched to you.',
        actionLabel: 'Open app settings',
        secondaryLabel: 'Not now',
      );
      if (!mounted) throw StateError('The page is no longer active.');
      if (open == true) {
        await Geolocator.openAppSettings();
      }
      throw StateError('Enable location access, then try going online again.');
    }
    if (permission == LocationPermission.denied) {
      final accepted = await LocationAccessSheet.show(
        context,
        message:
            'Your location is used to find nearby rides and keep your trip position accurate.',
      );
      if (!mounted) throw StateError('The page is no longer active.');
      if (accepted != true) {
        throw StateError('Location access is required to go online.');
      }
      permission = await Geolocator.requestPermission();
      if (!mounted) throw StateError('The page is no longer active.');
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        throw StateError('Location access is required to go online.');
      }
    }
  }

  Future<void> _goOffline() => _perform(() async {
    await _repo.availability(false);
    await _tracking.stop();
  });

  Future<void> _goOnline() => _perform(() async {
    final vehicle = _controller.selectedVehicle;
    if (vehicle == null || !_controller.canGoOnline) {
      throw StateError('Select a verified vehicle before going online.');
    }
    await _ensureLocationAccess();
    await _repo.selectActiveVehicle('${vehicle['id']}');
    try {
      await _tracking.ensureStarted();
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

  @override
  Widget build(BuildContext context) {
    final online = _data?['availability'] == 'AVAILABLE';
    return DriverGoOnlineStage(
      mapOnly: _rideSheetOpen,
      mapBuilder: (map) => _rideSheetMap ?? map,
      vehicles: _controller.ownedVehicles,
      selectedVehicleId: _controller.selectedVehicleId,
      loading: _data == null || _controller.vehiclesLoading,
      busy: _busy,
      canGoOnline: _data?['exited'] != true && _controller.canGoOnline,
      isOnline: online,
      error: _controller.vehiclesError ?? _controller.error,
      position: _tracking.position,
      avatarUrl: _controller.avatarUrl,
      onProfile: () => Navigator.pushNamed(context, AppRoutes.settings),
      onSelectVehicle: _controller.selectVehicle,
      onGoOnline: _goOnline,
      onGoOffline: _goOffline,
      onRetry: () {
        unawaited(_controller.loadOwnedVehicles(force: true));
        unawaited(_load());
      },
    );
  }
}

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_operations/pages/trip_start_qr_scanner_page.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/driver_operations/widgets/trip_actions_panel.dart';
import 'package:user/features/driver_vehicles/controllers/driver_trip_controller.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:user/features/rides/widgets/rider_live_panel.dart';
import 'package:user/features/rides/widgets/trip_receipt_sheet.dart';

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
  late DriverTripController _controller;
  Listenable? _source;
  Timer? _poll;
  bool _initialized = false;
  double? _height;
  String? _measuredPhase;
  String get _status => '${_controller.trip?['status']}';
  bool get _payment =>
      _status == 'COMPLETED' &&
      ![
        'CAPTURED',
        'CANCELLED',
        'REFUNDED',
        'PARTIALLY_REFUNDED',
      ].contains(rideMap(_controller.context?['payment'])['status']);
  String get _phase => _payment ? 'PAYMENT' : _status;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    final source = DataSourceScope.of(context);
    _controller = DriverTripController(
      widget.repository ?? DriverOperationsRepository(client: source?.client),
      widget.tracking ?? DriverTrackingService.instance,
    )..addListener(_changed);
    _controller.id =
        ModalRoute.of(context)?.settings.arguments as String? ?? '';
    _source = source?.changes;
    _source?.addListener(_reload);
    _controller.tracking.position.addListener(_positionChanged);
    _controller.tracking.error.addListener(_changed);
    WidgetsBinding.instance.addObserver(this);
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_controller.foreground &&
          ModalRoute.of(context)?.isCurrent == true &&
          !_controller.busy) {
        _reload();
      }
    });
    _reload();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _reload() {
    unawaited(_controller.load());
  }

  void _positionChanged() {
    if (!mounted ||
        !_controller.foreground ||
        ModalRoute.of(context)?.isCurrent != true) {
      return;
    }
    _controller.updatePosition();
  }

  Future<void> _act(Future<void> Function() action) async {
    if (_controller.busy) return;
    setState(() => _controller.busy = true);
    try {
      await _controller.readDone?.future;
      if (!mounted) return;
      await action();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      await _controller.load();
      if (mounted) setState(() => _controller.busy = false);
    }
  }

  Future<void> _arrive() async {
    await _controller.tracking.freshFix();
    await _controller.ops.arrive(_controller.id!);
  }

  Future<void> _scan() async {
    if (_controller.busy) return;
    final code = await TripStartQrScannerPage.scan(context);
    if (!mounted || code == null) return;
    await _act(() async {
      // Arrival is verified by the server before code verification can start a trip.
      if (['DRIVER_ASSIGNED', 'DRIVER_ARRIVING'].contains(_status)) {
        await _arrive();
      }
      await _controller.ops.start(_controller.id!, code);
    });
  }

  Future<void> _complete() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Complete this ride?'),
        content: const Text(
          'Confirm that the passenger has reached the destination. Collect the fare after completion.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Continue ride'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Complete'),
          ),
        ],
      ),
    );
    if (confirm == true && mounted) {
      await _act(() => _controller.ops.complete(_controller.id!));
    }
  }

  void _home() =>
      Navigator.pushNamedAndRemoveUntil(context, AppRoutes.gate, (_) => false);
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _controller.foreground = state == AppLifecycleState.resumed;
    if (_controller.foreground && ModalRoute.of(context)?.isCurrent == true) {
      _reload();
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _source?.removeListener(_reload);
    _controller.tracking.position.removeListener(_positionChanged);
    _controller.tracking.error.removeListener(_changed);
    _controller.removeListener(_changed);
    _controller.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Widget _button(String text, VoidCallback action) => SizedBox(
    width: double.infinity,
    height: 60,
    child: FilledButton(
      onPressed: _controller.busy ? null : action,
      child: Text(text),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final trip = _controller.trip;
    final data = _controller.context;
    final fix = _controller.tracking.position.value;
    final map = DriverMap(
      location: fix == null ? null : ridePoint(fix.latitude, fix.longitude),
      heading: fix?.heading ?? 0,
      pickup: ridePoint(trip?['pickup_latitude'], trip?['pickup_longitude']),
      dropoff: ridePoint(trip?['dropoff_latitude'], trip?['dropoff_longitude']),
      route: _controller.points,
      follow: _controller.follow,
    );
    final moving = _status == 'IN_PROGRESS';
    final completed = _status == 'COMPLETED' && !_payment;
    final title = _payment
        ? 'Collect the ride fare'
        : completed
        ? 'Ride completed'
        : moving
        ? 'Time to drop-off'
        : _status == 'DRIVER_WAITING'
        ? 'Waiting at pickup'
        : 'Arriving at pickup';
    final summary = trip == null
        ? ''
        : rideMoney(trip['final_fare'] ?? trip['estimated_fare']);
    return PopScope(
      canPop: !_controller.active,
      child: RiderFlowScaffold(
        map: widget.mapBuilder?.call(map) ?? map,
        title: title,
        initialPanelFraction: completed ? .90 : .30,
        maximumPanelFraction: completed ? .94 : .86,
        statusStrip: RideArrivalStrip(
          label: title,
          value: _payment || completed
              ? summary
              : _controller.progress == null
              ? 'Updating route'
              : rideDistance(_controller.progress!.remainingMetres),
        ),
        onRefresh: () {
          _reload();
          unawaited(_controller.navigation(force: true));
        },
        onBack: _controller.active
            ? () => Navigator.pushNamed(context, AppRoutes.support)
            : () => Navigator.maybePop(context),
        onRecenter: () => setState(() {
          _controller.follow = true;
        }),
        panelContentHeight: _measuredPhase == _phase ? _height : null,
        panel: Builder(
          builder: (context) {
            if (trip == null || data == null) {
              return SingleChildScrollView(
                child: _controller.error == null
                    ? const RideFlowSkeleton()
                    : AppLoadError(
                        message: _controller.error!,
                        onRetry: _reload,
                      ),
              );
            }
            if (completed) {
              return RiderCompletionPanel(
                data: data,
                driverView: true,
                actions: const SizedBox.shrink(),
                busy: _controller.busy,
                scrollController: PrimaryScrollController.of(context),
                onRate: (_, _) async {},
                onHome: _home,
                onReceipt: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  builder: (_) => FractionallySizedBox(
                    heightFactor: .86,
                    child: TripReceiptSheet(data: data),
                  ),
                ),
              );
            }
            final actions = TripActionsPanel(
              rideId: _controller.id!,
              externalContext: data,
              repository: _controller.ops,
              hideContacts: true,
              onChanged: _controller.load,
            );
            return SingleChildScrollView(
              child: RideContentSizeReporter(
                onSizeChanged: (size) {
                  if (mounted &&
                      (_measuredPhase != _phase ||
                          _height == null ||
                          (_height! - size.height).abs() > 1)) {
                    setState(() {
                      _height = size.height;
                      _measuredPhase = _phase;
                    });
                  }
                },
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (_controller.error != null)
                        AppLoadError(
                          message: _controller.error!,
                          onRetry: _reload,
                        ),
                      if (moving && _controller.navError != null)
                        Text(
                          _controller.navError!,
                          style: const TextStyle(color: RideTokens.muted),
                        ),
                      RideVehicleDriverCard(
                        vehicle: rideMap(trip['vehicle']),
                        driver: {'user': rideMap(trip['rider'])},
                        compact: moving,
                        personLabel: 'Your passenger',
                        showRating: false,
                        contactActions: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            TripActionsPanel(
                              rideId: _controller.id!,
                              externalContext: data,
                              repository: _controller.ops,
                              contactsOnly: true,
                              showSupport: moving || _payment,
                              onChanged: _controller.load,
                            ),
                            if (!_payment && !moving)
                              SolidIconButton(
                                dark: true,
                                icon: Icons.qr_code_scanner_rounded,
                                tooltip: 'Scan rider QR code',
                                onPressed: _controller.busy ? null : _scan,
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      if (moving) ...[
                        RideDestinationProgressBar(
                          remainingDistance:
                              _controller.progress?.remainingMetres,
                          totalDistance: rideNumber(
                            trip['estimated_distance_m'],
                          ),
                        ),
                        const SizedBox(height: 14),
                        _button('Complete ride', _complete),
                      ] else ...[
                        RideRouteTimeline(trip),
                        const SizedBox(height: 16),
                        if (_payment)
                          actions
                        else ...[
                          if (_controller.navError != null)
                            Text(
                              _controller.navError!,
                              style: const TextStyle(color: RideTokens.muted),
                            ),
                          if (_controller.progress != null)
                            Text(_controller.progress!.instruction),
                          if (_controller.tracking.error.value != null)
                            Text(
                              'Location: ${_controller.tracking.error.value}',
                            ),
                          const SizedBox(height: 12),
                          if (_status != 'DRIVER_WAITING')
                            _button(
                              'I have arrived at pickup',
                              () => _act(_arrive),
                            ),
                          ExpansionTile(
                            tilePadding: EdgeInsets.zero,
                            title: const Text('Trip actions and manual code'),
                            children: [actions],
                          ),
                        ],
                      ],
                      if (moving && _controller.offers.isNotEmpty)
                        ExpansionTile(
                          title: Text(
                            '${_controller.offers.length} nearby offers · view only',
                          ),
                          subtitle: const Text(
                            'Finish this ride before accepting another.',
                          ),
                          children: [
                            for (final offer in _controller.offers)
                              ListTile(
                                title: Text(
                                  '${rideMap(offer['ride'])['pickup_address'] ?? 'Nearby pickup'}',
                                ),
                                subtitle: Text(
                                  '${rideMap(offer['ride'])['dropoff_address'] ?? ''}',
                                ),
                              ),
                          ],
                        ),
                      if (!_controller.active && _status != 'COMPLETED')
                        _button('Return to driver home', _home),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

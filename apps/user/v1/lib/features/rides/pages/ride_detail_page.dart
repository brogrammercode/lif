import 'package:user/features/rides/controllers/ride_feedback_controller.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/rides/controllers/rider_trip_controller.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:user/features/rides/widgets/rider_live_panel.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/widgets/trip_actions_panel.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/ride_detail_intent.dart';
import 'package:user/features/rides/ride_fare_summary.dart';
import 'package:user/features/rides/widgets/ride_outcome.dart';
import 'package:user/features/rides/widgets/rider_trip_map.dart';
import 'package:user/features/rides/widgets/trip_cancellation_dialog.dart';
import 'package:user/features/rides/widgets/trip_safety_sheet.dart';
import 'package:user/features/rides/widgets/trip_start_qr_sheet.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:file_picker/file_picker.dart';
import 'package:flutter/rendering.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

class RideDetailPage extends StatefulWidget {
  final UserAppRepository? repository;
  final DriverOperationsRepository? operationsRepository;
  final Widget Function(Widget)? mapBuilder;
  const RideDetailPage({
    super.key,
    this.repository,
    this.operationsRepository,
    this.mapBuilder,
  });
  @override
  State<RideDetailPage> createState() => _RiderTripState();
}

class _RiderTripState extends State<RideDetailPage>
    with WidgetsBindingObserver, RouteAware {
  late RouteObserver<ModalRoute<dynamic>> _routeObserver;
  late RiderTripController _controller;
  bool _initialized = false, _receiptOpen = false, _initialReceipt = false;
  final GlobalKey _billCaptureKey = GlobalKey();
  double? _rideStageContentHeight;
  String? _rideStageContentStatus;
  ModalRoute<dynamic>? _route;
  int _recenter = 0;

  void _updateRideStageContentHeight(String status, double height) {
    if (!mounted ||
        (_rideStageContentStatus == status &&
            _rideStageContentHeight != null &&
            (_rideStageContentHeight! - height).abs() < 1)) {
      return;
    }
    setState(() {
      _rideStageContentStatus = status;
      _rideStageContentHeight = height;
    });
  }

  void _updated() {
    if (!mounted) return;
    setState(() {});
    if (_initialReceipt && _controller.status == 'COMPLETED') {
      _initialReceipt = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_receipt());
      });
    }
  }

  @override
  void initState() {
    super.initState();
    _routeObserver = RideRouteObserverScope.of(context);
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (route != _route) {
      _routeObserver.unsubscribe(this);
      _route = route;
      if (route != null) {
        _routeObserver.subscribe(this, route);
      }
    }
    if (!_initialized) {
      _initialized = true;
      final source = DataSourceScope.of(context);
      _controller = RiderTripController(
        repository:
            widget.repository ?? UserAppRepository(client: source?.client),
        ops:
            widget.operationsRepository ??
            DriverOperationsRepository(client: source?.client),
      )..addListener(_updated);
      final args = route?.settings.arguments;
      _initialReceipt = args is RideDetailIntent && args.receipt;
      _controller.open(
        args is RideDetailIntent ? args.id : args as String? ?? '',
        source: source?.changes,
        livePresentation: args is RideDetailIntent && args.liveJourney,
      );
    }
  }

  Future<void> _load() => _controller.load();
  Future<void> _changed() => _controller.refresh();
  Future<void> _refreshRoute({bool force = false}) =>
      _controller.refreshRoute(force: force);
  @override
  void didPushNext() => _controller.setVisible(false);
  @override
  void didPopNext() => _controller.setVisible(true);
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) =>
      _controller.setVisible(
        state == AppLifecycleState.resumed && _route?.isCurrent == true,
      );
  @override
  void dispose() {
    _controller.removeListener(_updated);
    _controller.dispose();
    _routeObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _act(Future<void> Function() action) async {
    try {
      await action();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    }
  }

  Future<void> _cancel() async {
    final reason = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => TripCancellationDialog(contextData: _controller.data!),
    );
    if (reason == null || !mounted) return;
    await _act(
      () =>
          _controller.cancel('${reason['reason']}', '${reason['reason_code']}'),
    );
  }

  Future<void> _confirm() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => LiquidGlassDialog(
        title: const Text('Confirm pickup and driver'),
        content: const Text(
          'Check the driver, vehicle and registration plate before confirming. Share the trip code only with the correct driver.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Not yet'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (confirm == true && mounted) {
      await _act(_controller.confirm);
    }
  }

  Future<void> _refreshStartCode() async {
    final rideId = _controller.id;
    if (rideId == null || _controller.busy) return;
    await _act(() async {
      await _controller.ops.refreshCode(rideId);
      await _controller.load();
    });
  }

  Future<void> _showTripStartQr() async {
    var start = rideMap(_controller.data?['start']);
    if (start['code'] == null && start['locked'] != true) {
      await _refreshStartCode();
      start = rideMap(_controller.data?['start']);
    }
    if (!mounted) return;
    if (start['code'] == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            start['locked'] == true
                ? 'The trip code is temporarily locked. Try again after it expires.'
                : 'A trip QR code is not available yet. Refresh the trip and try again.',
          ),
        ),
      );
      return;
    }
    if (start['rider_confirmed'] != true) {
      await _act(_controller.confirm);
      start = rideMap(_controller.data?['start']);
      if (!mounted || start['rider_confirmed'] != true) return;
    }

    await showDialog<void>(
      context: context,
      barrierDismissible: true,
      builder: (_) => TripStartQrSheet(code: '${start['code']}'),
    );
  }

  Future<void> _rate() async {
    final input = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _RatingDialog(),
    );
    if (input == null || !mounted) return;
    final userId = rideMap(_controller.trip['driver'])['user_id'];
    if (userId == null) return;
    await _act(
      () =>
          _controller.rate(input['score'] as int, input['comment'] as String?),
    );
  }

  void _safety() => showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    useSafeArea: true,
    builder: (_) => FractionallySizedBox(
      heightFactor: .88,
      child: LiquidGlassSheet(
        child: TripSafetySheet(
          trip: {
            ..._controller.trip,
            'payment': _controller.data?['payment'],
            'settlement_review': _controller.data?['review'],
          },
          repository: _controller.repository,
        ),
      ),
    ),
  );
  Future<void> _receipt() async {
    if (_receiptOpen || _controller.busy) return;
    setState(() => _receiptOpen = true);
    try {
      await _changed();
      if (!mounted ||
          _controller.data == null ||
          _controller.error != null ||
          _controller.status != 'COMPLETED') {
        return;
      }
      final trip = rideMap(_controller.data!['trip']);
      final vehicle = rideMap(trip['vehicle']);
      final brand = rideMap(vehicle['brand']);
      final user = rideMap(rideMap(trip['driver'])['user']);
      final imageUrls = [
        '${brand['logo_url'] ?? vehicle['brand_logo_url'] ?? ''}',
        '${user['avatar_url'] ?? ''}',
      ].where((url) => url.startsWith('http')).toSet();
      await Future.wait(
        imageUrls.map(
          (url) => precacheImage(
            NetworkImage(url),
            context,
          ).timeout(const Duration(seconds: 8), onTimeout: () {}),
        ),
      );
      await WidgetsBinding.instance.endOfFrame;
      if (!mounted) return;
      final renderObject = _billCaptureKey.currentContext?.findRenderObject();
      if (renderObject is! RenderRepaintBoundary) {
        throw StateError('The completed ride view is not ready to export yet.');
      }
      final ui.Image snapshot = await renderObject.toImage(pixelRatio: 2);
      try {
        final byteData = await snapshot.toByteData(
          format: ui.ImageByteFormat.png,
        );
        if (byteData == null) {
          throw StateError('Could not render the completed ride view.');
        }
        final imageBytes = byteData.buffer.asUint8List();
        final pageWidth = 595.0;
        final pageHeight = pageWidth * snapshot.height / snapshot.width;
        final document = pw.Document();
        final image = pw.MemoryImage(imageBytes);
        document.addPage(
          pw.Page(
            pageFormat: PdfPageFormat(pageWidth, pageHeight, marginAll: 0),
            build: (_) => pw.Image(image, fit: pw.BoxFit.fill),
          ),
        );
        final pdfBytes = Uint8List.fromList(await document.save());
        final fileName =
            '1More-${rideReference(trip['id']).replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '-')}.pdf';
        final saved = await FilePicker.saveFile(
          fileName: fileName,
          bytes: pdfBytes,
          mimeType: 'application/pdf',
          dialogTitle: 'Save ride bill',
          type: FileType.custom,
          allowedExtensions: const ['pdf'],
        );
        if (mounted && saved != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Ride bill saved as PDF.')),
          );
        }
      } finally {
        snapshot.dispose();
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _receiptOpen = false);
    }
  }

  void _home() =>
      Navigator.pushNamedAndRemoveUntil(context, AppRoutes.gate, (_) => false);
  void _rebook() => Navigator.pushNamedAndRemoveUntil(
    context,
    AppRoutes.home,
    (_) => false,
    arguments: {'rebook': _controller.trip},
  );
  String _elapsed(dynamic value) {
    final start = DateTime.tryParse('$value');
    final seconds = start == null
        ? 0
        : _controller.now.difference(start).inSeconds.clamp(0, 999999);
    return '${seconds ~/ 60}m ${seconds % 60}s';
  }

  @override
  Widget build(BuildContext context) {
    if (_controller.data != null &&
        (_controller.active || _controller.status == 'COMPLETED')) {
      return _referenceJourney();
    }
    return SolidPage(
      title: 'Trip details',
      action: Wrap(
        children: [
          IconButton(
            tooltip: 'Safety & help',
            onPressed: _controller.data == null ? null : _safety,
            icon: const Icon(Icons.health_and_safety_outlined),
          ),
          IconButton(
            tooltip: 'Refresh ride',
            onPressed: _controller.reading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      child: _controller.data == null
          ? (_controller.error != null
                ? AppLoadError(message: _controller.error!, onRetry: _load)
                : const RidesSkeleton(detail: true))
          : _content(),
    );
  }

  Widget _referenceJourney() {
    final actions = TripActionsPanel(
      rideId: _controller.id!,
      externalContext: _controller.data,
      onChanged: _changed,
      confirmRider: _confirm,
      cancelRide: _cancel,
      repository: _controller.ops,
      hideContacts: true,
      hideCompletedPayment: true,
    );
    final pickup = ridePoint(
      _controller.trip['pickup_latitude'],
      _controller.trip['pickup_longitude'],
    );
    final dropoff = ridePoint(
      _controller.trip['dropoff_latitude'],
      _controller.trip['dropoff_longitude'],
    );
    final location = rideMap(_controller.data!['driver_location']);
    final map = pickup == null || dropoff == null
        ? const Center(child: Text('Route preview unavailable'))
        : RiderTripMap(
            pickup: pickup,
            dropoff: dropoff,
            driver: ridePoint(location['latitude'], location['longitude']),
            driverLabel:
                '${rideMap(rideMap(_controller.trip['driver'])['user'])['first_name'] ?? 'Driver'}',
            points:
                _controller.routeFresh &&
                    _controller.locationFresh &&
                    _controller.remainingPoints.isNotEmpty
                ? _controller.remainingPoints
                : _controller.basePoints,
            recenter: _recenter,
          );
    if (_controller.status == 'COMPLETED') {
      return SolidScope(
        child: Scaffold(
          backgroundColor: Colors.white,
          body: Stack(
            children: [
              Positioned.fill(child: widget.mapBuilder?.call(map) ?? map),
              DraggableScrollableSheet(
                initialChildSize: .90,
                minChildSize: .68,
                maxChildSize: .94,
                builder: (context, scrollController) => Container(
                  decoration: const BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.vertical(
                      top: Radius.circular(24),
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Color(0x18000000),
                        blurRadius: 12,
                        offset: Offset(0, -3),
                      ),
                    ],
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Column(
                    children: [
                      SizedBox(
                        height: 72,
                        child: Column(
                          children: [
                            Container(
                              width: 36,
                              height: 4,
                              margin: const EdgeInsets.only(top: 8, bottom: 4),
                              decoration: BoxDecoration(
                                color: const Color(0xFFCCCCCC),
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                            Expanded(
                              child: Row(
                                children: [
                                  IconButton(
                                    tooltip: 'Back',
                                    onPressed: () {
                                      if (Navigator.of(context).canPop()) {
                                        Navigator.of(context).maybePop();
                                      } else {
                                        _home();
                                      }
                                    },
                                    icon: const Icon(Icons.arrow_back_ios_new),
                                  ),
                                  const Expanded(
                                    child: Text(
                                      "You've arrived",
                                      textAlign: TextAlign.center,
                                      style: TextStyle(
                                        fontSize: 18,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                  IconButton(
                                    tooltip: 'Safety and sharing',
                                    onPressed: _safety,
                                    icon: const Icon(Icons.ios_share_rounded),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(
                        child: RiderCompletionPanel(
                          data: _controller.data!,
                          actions: actions,
                          busy: _controller.busy,
                          scrollController: scrollController,
                          captureKey: _billCaptureKey,
                          onHome: _home,
                          onReceipt: _receipt,
                          onRate: (score, comment) async {
                            final user = rideMap(
                              _controller.trip['driver'],
                            )['user_id'];
                            if (user != null) {
                              await _act(
                                () => _controller.rate(
                                  score,
                                  comment.isEmpty ? null : comment,
                                ),
                              );
                            }
                          },
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
    final estimate = _controller.routeFresh && _controller.locationFresh
        ? '${rideDuration(_controller.routeData?['duration_s'])} ${_controller.status == 'IN_PROGRESS' ? 'to drop-off' : 'to pickup'} · ${rideDistance(_controller.routeData?['distance_m'])} remaining'
        : 'A current route estimate is unavailable';
    final waitingForTripStart = _controller.status == 'DRIVER_WAITING';
    final start = rideMap(_controller.data!['start']);
    final startCode = start['code'];
    return RiderFlowScaffold(
      title: ['SEARCHING', 'REQUESTED'].contains(_controller.status)
          ? 'Your ride request'
          : _controller.status == 'DRIVER_WAITING'
          ? 'Your driver has arrived'
          : _controller.status == 'IN_PROGRESS'
          ? 'On your way to your destination'
          : 'Get ready, the driver will come soon',
      statusStrip: RideArrivalStrip(
        label: ['SEARCHING', 'REQUESTED'].contains(_controller.status)
            ? 'Finding your driver'
            : _controller.status == 'IN_PROGRESS'
            ? (_controller.routeFresh && _controller.locationFresh
                  ? 'Time to drop-off'
                  : 'Route estimate')
            : _controller.status == 'DRIVER_WAITING'
            ? 'Your driver is waiting'
            : 'The driver will arrive in',
        value: ['SEARCHING', 'REQUESTED'].contains(_controller.status)
            ? _elapsed(_controller.trip['requested_at'])
            : waitingForTripStart
            ? startCode == null
                  ? (start['locked'] == true ? 'Locked' : 'Refresh')
                  : '$startCode'
            : _controller.routeFresh && _controller.locationFresh
            ? rideDuration(_controller.routeData?['duration_s'])
            : 'Updating',
        onValueTap:
            waitingForTripStart && startCode == null && start['locked'] != true
            ? _refreshStartCode
            : null,
      ),
      onRefresh: _load,
      panelContentHeight:
          [
                'SEARCHING',
                'REQUESTED',
                'DRIVER_ASSIGNED',
                'DRIVER_ARRIVING',
                'DRIVER_WAITING',
                'IN_PROGRESS',
              ].contains(_controller.status) &&
              _rideStageContentStatus == _controller.status
          ? _rideStageContentHeight
          : null,
      map: widget.mapBuilder?.call(map) ?? map,
      onRecenter: () => setState(() => _recenter++),
      panel: RiderLivePanel(
        data: _controller.data!,
        elapsed: _elapsed(_controller.trip['requested_at']),
        waiting: _elapsed(_controller.trip['arrived_at']),
        estimate: estimate,
        actions: actions,
        contactActions: TripActionsPanel(
          rideId: _controller.id!,
          externalContext: _controller.data,
          onChanged: _changed,
          repository: _controller.ops,
          contactsOnly: true,
          showSupport: _controller.status != 'DRIVER_WAITING',
        ),
        onCancel: _cancel,
        onSafety: _safety,
        onRefresh: _load,
        onContentHeightChanged: (height) =>
            _updateRideStageContentHeight(_controller.status, height),
        onShowTripQr: _showTripStartQr,
        error: _controller.error ?? _controller.routeError,
        busy: _controller.busy,
        locationFresh: _controller.locationFresh,
        remainingDistance: _controller.routeFresh && _controller.locationFresh
            ? rideNumber(_controller.routeData?['distance_m'])
            : null,
      ),
    );
  }

  Widget _content() {
    final pickup = ridePoint(
          _controller.trip['pickup_latitude'],
          _controller.trip['pickup_longitude'],
        ),
        dropoff = ridePoint(
          _controller.trip['dropoff_latitude'],
          _controller.trip['dropoff_longitude'],
        );
    final location = rideMap(_controller.data!['driver_location']),
        driverPoint = ridePoint(location['latitude'], location['longitude']);
    final driver = rideMap(rideMap(_controller.trip['driver'])['user']);
    final payment = rideMap(_controller.data!['payment']);
    final needsActions =
        _controller.status != 'COMPLETED' ||
        ![
          'CAPTURED',
          'CANCELLED',
          'REFUNDED',
          'PARTIALLY_REFUNDED',
        ].contains(payment['status']) ||
        _controller.data!['review'] != null;
    final hasMap = pickup != null && dropoff != null;
    final activeMap = _controller.active && hasMap;
    final map = hasMap
        ? RiderTripMap(
            pickup: pickup,
            dropoff: dropoff,
            driver: _controller.active ? driverPoint : null,
            points:
                !_controller.routeFresh ||
                    !_controller.locationFresh ||
                    _controller.remainingPoints.isEmpty
                ? _controller.basePoints
                : _controller.remainingPoints,
            recenter: _recenter,
          )
        : null;
    final body = ListView(
      padding: const EdgeInsets.only(bottom: 20),
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 12),
          child: SelectableText(
            rideReference(_controller.trip['id']),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: GlassTokens.muted,
            ),
          ),
        ),
        if (!activeMap)
          LiquidGlassSurface(
            padding: const EdgeInsets.all(8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: SizedBox(
                    height: 200,
                    child: map == null
                        ? const Center(
                            child: Text(
                              'Route preview unavailable',
                              style: TextStyle(
                                fontSize: 13,
                                color: GlassTokens.muted,
                              ),
                            ),
                          )
                        : widget.mapBuilder?.call(map) ?? map,
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(10, 14, 10, 10),
                  child: Text(
                    rideTime(
                      _controller.trip['created_at'] ??
                          _controller.trip['requested_at'],
                    ),
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      color: GlassTokens.ink,
                    ),
                  ),
                ),
                if (hasMap)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                    child: Text(
                      _controller.basePoints.length >= 2
                          ? 'Booked route preview'
                          : 'Pickup and drop-off locations',
                      style: const TextStyle(
                        fontSize: 12,
                        color: GlassTokens.muted,
                      ),
                    ),
                  ),
                if (_controller.status == 'COMPLETED')
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: RideStatusBadge(_controller.status),
                    ),
                  ),
              ],
            ),
          ),

        if (_controller.error != null)
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Connection update failed: ${_controller.error}',
                  style: const TextStyle(color: Colors.red),
                ),
                Text(
                  'Showing the last confirmed update from ${rideTime(_controller.checked?.toIso8601String())}. The current ride status could not be verified.',
                ),
                TextButton(onPressed: _load, child: const Text('Retry update')),
              ],
            ),
          ),
        if (_controller.reading && _controller.data != null)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'Updating trip...',
              style: TextStyle(fontSize: 12, color: GlassTokens.muted),
            ),
          ),
        const SizedBox(height: 10),
        if ([
          'CANCELLED',
          'NO_DRIVER_FOUND',
          'EXPIRED',
        ].contains(_controller.status)) ...[
          RideOutcomePanel(trip: _controller.trip, payment: payment),
          const SizedBox(height: 14),
        ],
        if (_controller.active || _controller.status == 'DRAFT')
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  riderStatusLabel(_controller.status),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (_controller.status == 'SEARCHING' ||
                    _controller.status == 'REQUESTED') ...[
                  Text(
                    'Searching for ${_elapsed(_controller.trip['requested_at'])}${_controller.data!['search_radius_km'] == null ? '' : ' · ${_controller.data!['search_radius_km']} km search area'}. No fare is collected before assignment.',
                  ),
                  const Text(
                    'We expand the search while drivers remain unavailable. A booking is confirmed when a driver accepts.',
                  ),
                ],
                if (_controller.status == 'DRIVER_WAITING')
                  Text(
                    'Waiting ${_elapsed(_controller.trip['arrived_at'])} · ${_controller.data!['free_wait_minutes'] ?? 5} minutes free pickup waiting.',
                  ),
                if (_controller.needsRoute &&
                    _controller.routeFresh &&
                    _controller.locationFresh)
                  Text(
                    '${rideDuration(_controller.routeData!['duration_s'])} ${_controller.status == 'IN_PROGRESS' ? 'to drop-off' : 'to pickup'} · ${rideDistance(_controller.routeData!['distance_m'])} remaining',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                if (_controller.needsRoute &&
                    (!_controller.routeFresh || !_controller.locationFresh))
                  const Text(
                    'A current route estimate is unavailable. Contact the driver or Support if needed.',
                  ),
                if (_controller.routeError != null && _controller.needsRoute)
                  TextButton(
                    onPressed: _controller.routing
                        ? null
                        : () => _refreshRoute(force: true),
                    child: Text('${_controller.routeError} · Retry route'),
                  ),
                if (driverPoint != null)
                  Text(
                    '${_controller.locationFresh ? 'Driver location updated' : 'Last known driver location'} ${rideTime(location['captured_at'])}',
                  ),
                if (_controller.status == 'NO_DRIVER_FOUND')
                  const Text(
                    'No driver accepted this request. You have not been charged. Try a fresh quote or change your route/category.',
                  ),
                if (_controller.status == 'EXPIRED')
                  const Text(
                    'This request has expired. Get a fresh quote before requesting another ride.',
                  ),
                if (_controller.status == 'CANCELLED')
                  Text(
                    '${_controller.trip['cancel_reason'] ?? 'The ride was cancelled.'}\nAny proposed fee is reviewed separately and can be disputed below.',
                  ),
                if (_controller.status == 'DRAFT')
                  const Text(
                    'This quote was not booked. Choose fresh ride options before requesting a driver.',
                  ),
              ],
            ),
          ),
        const SizedBox(height: 12),
        RideTripFacts(_controller.trip),
        const SizedBox(height: 14),
        RideCostDetails(
          trip: _controller.trip,
          payment: payment,
          review: rideMap(_controller.data!['review']),
        ),
        const SizedBox(height: 14),
        if (needsActions &&
            ([
                  'DRIVER_ASSIGNED',
                  'DRIVER_ARRIVING',
                  'DRIVER_WAITING',
                  'IN_PROGRESS',
                  'COMPLETED',
                ].contains(_controller.status) ||
                _controller.data!['review'] != null))
          TripActionsPanel(
            rideId: _controller.id!,
            externalContext: _controller.data,
            onChanged: _changed,
            confirmRider: _confirm,
            cancelRide: _cancel,
            repository: _controller.ops,
          ),
        if (['DRAFT', 'REQUESTED', 'SEARCHING'].contains(_controller.status))
          OutlinedButton(
            onPressed: _controller.busy ? null : _cancel,
            child: const Text('Cancel ride'),
          ),
        if (_controller.status == 'COMPLETED') ...[
          const SizedBox(height: 8),
          AppButton(
            onPressed: _controller.busy || _receiptOpen ? null : _receipt,
            isLoading: _receiptOpen && _controller.reading,
            text: 'View receipt',
          ),
          if (_controller.trip['review'] == null && driver.isNotEmpty)
            OutlinedButton(
              onPressed: _controller.busy ? null : _rate,
              child: const Text('Rate your ride'),
            ),
          if (_controller.trip['review'] != null)
            const Padding(
              padding: EdgeInsets.only(top: 12),
              child: Text(
                'Your rating has been saved. Thank you for your feedback.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: GlassTokens.muted,
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 12),
            child: Text(
              'Collection: ${ridePaymentLabel(payment['status'])}. Completion and payment receipt are recorded separately.',
              style: const TextStyle(
                fontSize: 12,
                height: 1.5,
                color: GlassTokens.muted,
              ),
            ),
          ),
        ],
        TextButton(
          onPressed: _safety,
          child: const Text('Safety, sharing & trip support'),
        ),
        RideActivityTimeline(_controller.trip),
        if (!_controller.active) ...[
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: _controller.busy ? null : _rebook,
            child: const Text('Rebook with a fresh quote'),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _home, child: const Text('Return to home')),
        ],
        if (_controller.busy)
          const Padding(
            padding: EdgeInsets.only(top: 10),
            child: AppSkeleton(
              label: 'Updating trip',
              child: SkeletonBox(height: 10),
            ),
          ),
      ],
    );
    if (!activeMap) return body;
    return Column(
      children: [
        Expanded(
          flex: 4,
          child: Stack(
            children: [
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: widget.mapBuilder?.call(map!) ?? map!,
                ),
              ),
              Positioned(
                right: 10,
                bottom: 10,
                child: LiquidGlassIconButton(
                  tooltip: 'Show route and driver',
                  onPressed: () => setState(() => _recenter++),
                  icon: Icons.my_location,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Expanded(flex: 6, child: body),
      ],
    );
  }
}

class _RatingDialog extends StatefulWidget {
  const _RatingDialog();
  @override
  State<_RatingDialog> createState() => _RatingState();
}

class _RatingState extends State<_RatingDialog> {
  late final _controller = RideRatingController()..addListener(_changed);
  int? get _score => _controller.score;
  void _changed() {
    if (mounted) setState(() {});
  }

  final _comment = TextEditingController();
  @override
  void dispose() {
    _controller.removeListener(_changed);
    _controller.dispose();
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => LiquidGlassDialog(
    title: const Text('Rate your ride'),
    content: SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Wrap(
            children: [
              for (var i = 1; i <= 5; i++)
                LiquidGlassChip(
                  label: '$i ★',
                  selected: _score == i,
                  onPressed: () => _controller.select(i),
                ),
            ],
          ),
          TextField(
            controller: _comment,
            maxLength: 500,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(labelText: 'Comment (optional)'),
          ),
          const Text(
            'Submit once. Use trip support for payment or safety issues.',
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: _score == null
            ? null
            : () => Navigator.pop(context, {
                'score': _score,
                'comment': _comment.text.trim().isEmpty
                    ? null
                    : _comment.text.trim(),
              }),
        child: const Text('Submit rating'),
      ),
    ],
  );
}

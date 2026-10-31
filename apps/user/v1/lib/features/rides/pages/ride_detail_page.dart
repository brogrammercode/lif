import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
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
import 'package:user/features/rides/widgets/trip_receipt_sheet.dart';
import 'package:user/features/rides/widgets/trip_safety_sheet.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

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
  late final _repo = widget.repository ?? UserAppRepository();
  late final _ops = widget.operationsRepository ?? DriverOperationsRepository();
  String? _id, _error, _routeError;
  Map<String, dynamic>? _data, _routeData;
  Map<String, dynamic> get _trip => rideMap(_data?['trip']);
  String get _status => '${_data?['status'] ?? ''}';
  bool get _active => riderActiveStatuses.contains(_status);
  bool get _locationFresh {
    final captured = DateTime.tryParse(
      '${rideMap(_data?['driver_location'])['captured_at']}',
    );
    final maxAge =
        rideNumber(rideMap(_data?['settings'])['location_max_age_s']) ?? 60;
    return _data?['driver_location_fresh'] == true &&
        captured != null &&
        _now.difference(captured).inSeconds >= -10 &&
        _now.difference(captured).inSeconds <= maxAge;
  }

  bool get _routeFresh {
    final captured = DateTime.tryParse('${_routeData?['captured_at']}');
    final maxAge =
        rideNumber(rideMap(_data?['settings'])['location_max_age_s']) ?? 60;
    return _routeData?['target'] ==
            (_status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP') &&
        captured != null &&
        _now.difference(captured).inSeconds >= -10 &&
        _now.difference(captured).inSeconds <= maxAge &&
        _lastRouteRequest != null &&
        DateTime.now().difference(_lastRouteRequest!).inSeconds < 60;
  }

  bool get _needsRoute =>
      ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'IN_PROGRESS'].contains(_status);
  bool _reading = false, _busy = false, _foreground = true, _routing = false;
  bool _receiptOpen = false;
  bool _initialReceipt = false;
  Completer<void>? _readDone;
  Timer? _poll, _tick;
  ModalRoute<dynamic>? _route;
  DateTime? _checked, _serverTime, _lastRouteRequest;
  final _clock = Stopwatch();
  List<LatLng> _basePoints = [], _remainingPoints = [];
  int _recenter = 0;
  DateTime get _now => (_serverTime ?? DateTime.now()).add(_clock.elapsed);
  bool get _pollNeeded =>
      _data == null ||
      _active ||
      [
        'REQUESTED',
        'DISPUTED',
        'APPROVED',
      ].contains(rideMap(_data?['review'])['status']) ||
      (_status == 'COMPLETED' &&
          ![
            'CAPTURED',
            'CANCELLED',
            'REFUNDED',
            'PARTIALLY_REFUNDED',
          ].contains(rideMap(_data?['payment'])['status']));
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_foreground && _route?.isCurrent == true && !_busy && _pollNeeded) {
        unawaited(_load());
      }
    });
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _foreground && _route?.isCurrent == true && _active) {
        setState(() {});
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
    if (_id == null) {
      final args = route?.settings.arguments;
      _id = args is RideDetailIntent ? args.id : args as String? ?? '';
      _initialReceipt = args is RideDetailIntent && args.receipt;
      unawaited(_load());
    }
  }

  Future<void> _load() async {
    if (_reading || !mounted || _id == null) return;
    setState(() => _reading = true);
    final done = _readDone = Completer<void>();
    try {
      final data = await _ops.context(_id!);
      if (data['is_driver'] != false ||
          data['trip'] is! Map ||
          !riderTripStatuses.contains(data['status']) ||
          rideMap(data['trip'])['id'] != _id ||
          rideMap(data['trip'])['status'] != data['status'] ||
          '${data['ride_id']}' != _id) {
        throw StateError('This ride is not available to your rider account.');
      }
      if (!mounted) return;
      setState(() {
        _data = data;
        _error = null;
        _checked = DateTime.now();
        _serverTime =
            DateTime.tryParse('${data['server_time']}') ?? DateTime.now();
        _clock
          ..reset()
          ..start();
        if (_basePoints.isEmpty) {
          _basePoints = rideGeometry(
            rideMap(rideMap(_trip['route'])['route_data'])['geometry'],
          );
        }
        if (!_needsRoute ||
            !_locationFresh ||
            _routeData?['target'] !=
                (_status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP')) {
          _routeData = null;
          _remainingPoints = [];
        }
      });
      if (_needsRoute && _locationFresh) {
        unawaited(_refreshRoute());
      }
      if (_initialReceipt && _status == 'COMPLETED') {
        _initialReceipt = false;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) unawaited(_receipt());
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      if (mounted) {
        setState(() => _reading = false);
      } else {
        _reading = false;
      }
      done.complete();
      _readDone = null;
    }
  }

  Future<void> _changed() async {
    await _readDone?.future;
    if (mounted) await _load();
  }

  Future<void> _refreshRoute({bool force = false}) async {
    if (!_needsRoute || _routing || !_locationFresh) {
      return;
    }
    final target = _status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP';
    if (!force &&
        _routeData?['target'] == target &&
        _lastRouteRequest != null &&
        DateTime.now().difference(_lastRouteRequest!).inSeconds < 30) {
      return;
    }
    if (_routeData?['target'] != target) {
      _routeData = null;
      _remainingPoints = [];
    }
    _routing = true;
    _lastRouteRequest = DateTime.now();
    try {
      final route = await _ops.riderRoute(_id!);
      if (!mounted ||
          !_needsRoute ||
          (_status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP') != target) {
        return;
      }
      final points = rideGeometry(route['geometry']);
      if (route['target'] != target ||
          points.length < 2 ||
          rideNumber(route['distance_m']) == null ||
          rideNumber(route['distance_m'])! < 0 ||
          rideNumber(route['duration_s']) == null ||
          rideNumber(route['duration_s'])! <= 0) {
        throw StateError('Route progress could not be verified. Please retry.');
      }
      setState(() {
        _routeData = route;
        _remainingPoints = points;
        _routeError = null;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _routeError = ApiResult.errorMessage(e);
          _routeData = null;
          _remainingPoints = [];
        });
      }
    } finally {
      _routing = false;
      if (mounted &&
          _needsRoute &&
          (_status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP') != target) {
        unawaited(_refreshRoute(force: true));
      }
    }
  }

  @override
  void didPopNext() => unawaited(_load());
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    if (_foreground && _route?.isCurrent == true) unawaited(_load());
  }

  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    _clock.stop();
    appRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

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
      if (mounted) {
        await _load();
        if (mounted) setState(() => _busy = false);
      }
    }
  }

  Future<void> _cancel() async {
    final reason = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => TripCancellationDialog(contextData: _data!),
    );
    if (reason == null || !mounted) return;
    await _act(
      () => _ops.issue(
        _id!,
        'CANCELLATION',
        '${reason['reason']}',
        reasonCode: '${reason['reason_code']}',
      ),
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
      await _act(() => _repo.confirmRideStart(_id!));
    }
  }

  Future<void> _rate() async {
    final input = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => const _RatingDialog(),
    );
    if (input == null || !mounted) return;
    final userId = rideMap(_trip['driver'])['user_id'];
    if (userId == null) return;
    await _act(
      () => _repo.review(
        _id!,
        '$userId',
        input['score'] as int,
        input['comment'] as String?,
      ),
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
            ..._trip,
            'payment': _data?['payment'],
            'settlement_review': _data?['review'],
          },
          repository: _repo,
        ),
      ),
    ),
  );
  Future<void> _receipt() async {
    if (_receiptOpen || _busy) return;
    setState(() => _receiptOpen = true);
    try {
      await _changed();
      if (!mounted ||
          _data == null ||
          _error != null ||
          _status != 'COMPLETED') {
        return;
      }
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        useSafeArea: true,
        builder: (_) => FractionallySizedBox(
          heightFactor: .86,
          child: TripReceiptSheet(data: _data!),
        ),
      );
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
    arguments: {'rebook': _trip},
  );
  String _elapsed(dynamic value) {
    final start = DateTime.tryParse('$value');
    final seconds = start == null
        ? 0
        : _now.difference(start).inSeconds.clamp(0, 999999);
    return '${seconds ~/ 60}m ${seconds % 60}s';
  }

  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: 'Trip details',
    action: Wrap(
      children: [
        IconButton(
          tooltip: 'Safety & help',
          onPressed: _data == null ? null : _safety,
          icon: const Icon(Icons.health_and_safety_outlined),
        ),
        IconButton(
          tooltip: 'Refresh ride',
          onPressed: _reading ? null : _load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    child: _data == null
        ? (_error != null
              ? AppLoadError(message: _error!, onRetry: _load)
              : const RidesSkeleton(detail: true))
        : _content(),
  );
  Widget _content() {
    final pickup = ridePoint(
          _trip['pickup_latitude'],
          _trip['pickup_longitude'],
        ),
        dropoff = ridePoint(
          _trip['dropoff_latitude'],
          _trip['dropoff_longitude'],
        );
    final location = rideMap(_data!['driver_location']),
        driverPoint = ridePoint(location['latitude'], location['longitude']);
    final driver = rideMap(rideMap(_trip['driver'])['user']);
    final payment = rideMap(_data!['payment']);
    final needsActions =
        _status != 'COMPLETED' ||
        ![
          'CAPTURED',
          'CANCELLED',
          'REFUNDED',
          'PARTIALLY_REFUNDED',
        ].contains(payment['status']) ||
        _data!['review'] != null;
    final hasMap = pickup != null && dropoff != null;
    final activeMap = _active && hasMap;
    final map = hasMap
        ? RiderTripMap(
            pickup: pickup,
            dropoff: dropoff,
            driver: _active ? driverPoint : null,
            points: !_routeFresh || !_locationFresh || _remainingPoints.isEmpty
                ? _basePoints
                : _remainingPoints,
            recenter: _recenter,
          )
        : null;
    final body = ListView(
      padding: const EdgeInsets.only(bottom: 20),
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 6, bottom: 12),
          child: SelectableText(
            rideReference(_trip['id']),
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
                    rideTime(_trip['created_at'] ?? _trip['requested_at']),
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
                      _basePoints.length >= 2
                          ? 'Booked route preview'
                          : 'Pickup and drop-off locations',
                      style: const TextStyle(
                        fontSize: 12,
                        color: GlassTokens.muted,
                      ),
                    ),
                  ),
                if (_status == 'COMPLETED')
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: RideStatusBadge(_status),
                    ),
                  ),
              ],
            ),
          ),

        if (_error != null)
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Connection update failed: $_error',
                  style: const TextStyle(color: Colors.red),
                ),
                Text(
                  'Showing the last confirmed update from ${rideTime(_checked?.toIso8601String())}. The current ride status could not be verified.',
                ),
                TextButton(onPressed: _load, child: const Text('Retry update')),
              ],
            ),
          ),
        if (_reading && _data != null)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'Updating trip...',
              style: TextStyle(fontSize: 12, color: GlassTokens.muted),
            ),
          ),
        const SizedBox(height: 10),
        if (['CANCELLED', 'NO_DRIVER_FOUND', 'EXPIRED'].contains(_status)) ...[
          RideOutcomePanel(trip: _trip, payment: payment),
          const SizedBox(height: 14),
        ],
        if (_active || _status == 'DRAFT')
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  riderStatusLabel(_status),
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (_status == 'SEARCHING' || _status == 'REQUESTED') ...[
                  Text(
                    'Searching for ${_elapsed(_trip['requested_at'])}${_data!['search_radius_km'] == null ? '' : ' · ${_data!['search_radius_km']} km search area'}. No fare is collected before assignment.',
                  ),
                  const Text(
                    'We expand the search while drivers remain unavailable. A booking is confirmed when a driver accepts.',
                  ),
                ],
                if (_status == 'DRIVER_WAITING')
                  Text(
                    'Waiting ${_elapsed(_trip['arrived_at'])} · ${_data!['free_wait_minutes'] ?? 5} minutes free pickup waiting.',
                  ),
                if (_needsRoute && _routeFresh && _locationFresh)
                  Text(
                    '${rideDuration(_routeData!['duration_s'])} ${_status == 'IN_PROGRESS' ? 'to drop-off' : 'to pickup'} · ${rideDistance(_routeData!['distance_m'])} remaining',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                if (_needsRoute && (!_routeFresh || !_locationFresh))
                  const Text(
                    'A current route estimate is unavailable. Contact the driver or Support if needed.',
                  ),
                if (_routeError != null && _needsRoute)
                  TextButton(
                    onPressed: _routing
                        ? null
                        : () => _refreshRoute(force: true),
                    child: Text('$_routeError · Retry route'),
                  ),
                if (driverPoint != null)
                  Text(
                    '${_locationFresh ? 'Driver location updated' : 'Last known driver location'} ${rideTime(location['captured_at'])}',
                  ),
                if (_status == 'NO_DRIVER_FOUND')
                  const Text(
                    'No driver accepted this request. You have not been charged. Try a fresh quote or change your route/category.',
                  ),
                if (_status == 'EXPIRED')
                  const Text(
                    'This request has expired. Get a fresh quote before requesting another ride.',
                  ),
                if (_status == 'CANCELLED')
                  Text(
                    '${_trip['cancel_reason'] ?? 'The ride was cancelled.'}\nAny proposed fee is reviewed separately and can be disputed below.',
                  ),
                if (_status == 'DRAFT')
                  const Text(
                    'This quote was not booked. Choose fresh ride options before requesting a driver.',
                  ),
              ],
            ),
          ),
        const SizedBox(height: 12),
        RideTripFacts(_trip),
        const SizedBox(height: 14),
        RideCostDetails(
          trip: _trip,
          payment: payment,
          review: rideMap(_data!['review']),
        ),
        const SizedBox(height: 14),
        if (needsActions &&
            ([
                  'DRIVER_ASSIGNED',
                  'DRIVER_ARRIVING',
                  'DRIVER_WAITING',
                  'IN_PROGRESS',
                  'COMPLETED',
                ].contains(_status) ||
                _data!['review'] != null))
          TripActionsPanel(
            rideId: _id!,
            externalContext: _data,
            onChanged: _changed,
            confirmRider: _confirm,
            cancelRide: _cancel,
            repository: _ops,
          ),
        if (['DRAFT', 'REQUESTED', 'SEARCHING'].contains(_status))
          OutlinedButton(
            onPressed: _busy ? null : _cancel,
            child: const Text('Cancel ride'),
          ),
        if (_status == 'COMPLETED') ...[
          const SizedBox(height: 8),
          AppButton(
            onPressed: _busy || _receiptOpen ? null : _receipt,
            isLoading: _receiptOpen && _reading,
            text: 'View receipt',
          ),
          if (_trip['review'] == null && driver.isNotEmpty)
            OutlinedButton(
              onPressed: _busy ? null : _rate,
              child: const Text('Rate your ride'),
            ),
          if (_trip['review'] != null)
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
        RideActivityTimeline(_trip),
        if (!_active) ...[
          const SizedBox(height: 16),
          OutlinedButton(
            onPressed: _busy ? null : _rebook,
            child: const Text('Rebook with a fresh quote'),
          ),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: _home, child: const Text('Return to home')),
        ],
        if (_busy) const LinearProgressIndicator(),
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
  int? _score;
  final _comment = TextEditingController();
  @override
  void dispose() {
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
                ChoiceChip(
                  label: Text('$i ★'),
                  selected: _score == i,
                  onSelected: (_) => setState(() => _score = i),
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

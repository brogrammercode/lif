import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/rides/controllers/vehicle_selection_controller.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';
import 'package:user/features/rides/widgets/rider_trip_map.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class VehicleSelectionPage extends StatefulWidget {
  final Map<String, dynamic> input, initialQuote;
  final List<LatLng> points;
  final UserAppRepository? repository;
  final Widget Function(Widget)? mapBuilder;
  const VehicleSelectionPage({
    super.key,
    required this.input,
    required this.initialQuote,
    required this.points,
    this.repository,
    this.mapBuilder,
  });
  @override
  State<VehicleSelectionPage> createState() => _VehicleSelectionState();
}

class _VehicleSelectionState extends State<VehicleSelectionPage>
    with WidgetsBindingObserver {
  late VehicleSelectionController _controller;
  bool _initialized = false;
  final _panelContentKey = GlobalKey();
  double? _panelContentHeight;
  int _recenter = 0;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    final source = DataSourceScope.of(context);
    _controller = VehicleSelectionController(
      repository:
          widget.repository ?? UserAppRepository(client: source?.client),
      input: widget.input,
      quote: widget.initialQuote,
    )..addListener(_changed);
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _measurePanelContent() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final renderObject = _panelContentKey.currentContext?.findRenderObject();
      if (renderObject is! RenderBox || !renderObject.hasSize) return;
      final height = renderObject.size.height;
      if (_panelContentHeight != null &&
          (_panelContentHeight! - height).abs() < 1) {
        return;
      }
      setState(() => _panelContentHeight = height);
    });
  }

  Future<void> _submit() async {
    final id = await _controller.submit();
    if (mounted && id != null) {
      await Navigator.pushReplacementNamed(
        context,
        AppRoutes.rideDetail,
        arguments: id,
      );
    }
  }

  Future<void> _back() async {
    if (_controller.booking.busy) return;
    if (await _controller.canLeave() && mounted) {
      setState(() {});
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.pop(context);
      });
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) =>
      _controller.setVisible(state == AppLifecycleState.resumed);
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.removeListener(_changed);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _measurePanelContent();
    final pickup = rideMap(widget.input['pickup']),
        dropoff = rideMap(widget.input['dropoff']);
    final map = RiderTripMap(
      pickup: ridePoint(pickup['latitude'], pickup['longitude'])!,
      dropoff: ridePoint(dropoff['latitude'], dropoff['longitude'])!,
      points: widget.points,
      recenter: _recenter,
    );
    return PopScope(
      canPop: !_controller.booking.busy && !_controller.booking.attempted,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) unawaited(_back());
      },
      child: RiderFlowScaffold(
        title: 'Choose your ride',
        statusStrip: RideArrivalStrip(
          label: 'Choose your ride',
          value: _controller.loading
              ? 'Loading'
              : rideDuration(_controller.selectedQuote['duration_s']),
        ),
        map: widget.mapBuilder?.call(map) ?? map,
        onRecenter: () => setState(() => _recenter++),
        onBack: _back,
        panelContentHeight: _panelContentHeight,
        panel: SingleChildScrollView(
          child: SizedBox(
            key: const ValueKey('vehicle-selection-content'),
            child: Column(
              key: _panelContentKey,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_controller.loading)
                        const RideFlowSkeleton()
                      else ...[
                        SizedBox(
                          height: 94,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            itemCount: _controller.quotes.length,
                            separatorBuilder: (_, _) =>
                                const SizedBox(width: 10),
                            itemBuilder: (_, index) {
                              final category = rideMap(
                                _controller.quotes[index]['category_snapshot'],
                              );
                              return Semantics(
                                selected: index == _controller.selected,
                                button: true,
                                child: InkWell(
                                  onTap: _controller.locked
                                      ? null
                                      : () => _controller.select(index),
                                  borderRadius: BorderRadius.circular(20),
                                  child: SolidSurface(
                                    dark: index == _controller.selected,
                                    padding: const EdgeInsets.all(10),
                                    child: SizedBox(
                                      width: 60,
                                      height: 60,
                                      child: Column(
                                        children: [
                                          Expanded(
                                            child: RideFlowImage(
                                              url:
                                                  category['image_url']
                                                      as String?,
                                              size: 30,
                                              iconColor:
                                                  index == _controller.selected
                                                  ? Colors.white
                                                  : RideTokens.ink,
                                              fallback:
                                                  ['BIKE', 'SCOOTER'].contains(
                                                    _controller
                                                        .quotes[index]['vehicle_type'],
                                                  )
                                                  ? Icons.two_wheeler
                                                  : Icons
                                                        .directions_car_outlined,
                                            ),
                                          ),
                                          Text(
                                            '${category['name'] ?? 'Ride'}',
                                            maxLines: 2,
                                            textAlign: TextAlign.center,
                                            style: TextStyle(
                                              fontSize: 12,
                                              color:
                                                  index == _controller.selected
                                                  ? Colors.white
                                                  : RideTokens.ink,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                        const SizedBox(height: 14),
                        if (_controller.previewLoading)
                          const RideFlowSkeleton()
                        else if (_controller.previews.isEmpty)
                          const SizedBox.shrink()
                        else ...[
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              for (final preview in _controller.previews)
                                Padding(
                                  padding: const EdgeInsets.only(bottom: 8),
                                  child: SizedBox(
                                    width: double.infinity,
                                    child: RideVehicleDriverCard(
                                      vehicle: rideMap(preview['vehicle']),
                                      driver: rideMap(preview['driver']),
                                      preview: true,
                                      distanceLabel: _controller
                                          .driverDistanceLabel(preview),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ],
                        const SizedBox(height: 14),
                        Row(
                          children: [
                            const Expanded(child: Text('Passengers')),
                            IconButton(
                              onPressed:
                                  _controller.locked ||
                                      _controller.passengers <= 1
                                  ? null
                                  : () {
                                      _controller.changePassengers(-1);
                                    },
                              icon: const Icon(Icons.remove_circle_outline),
                            ),
                            Text('${_controller.passengers}'),
                            IconButton(
                              onPressed:
                                  _controller.locked ||
                                      _controller.passengers >=
                                          (rideNumber(
                                                _controller
                                                    .category['capacity'],
                                              ) ??
                                              1)
                                  ? null
                                  : () {
                                      _controller.changePassengers(1);
                                    },
                              icon: const Icon(Icons.add_circle_outline),
                            ),
                          ],
                        ),
                        if (_controller.error != null ||
                            _controller.booking.error != null)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Text(
                              _controller.booking.error ?? _controller.error!,
                              style: const TextStyle(color: Colors.red),
                            ),
                          ),
                      ],
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
                  child: SizedBox(
                    width: double.infinity,
                    height: 60,
                    child: _bookingAction(),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _bookingAction() => SolidButton(
    text: 'Continue',
    busy: _controller.booking.busy,
    onPressed:
        _controller.booking.busy ||
            _controller.loading ||
            _controller.quotes.isEmpty ||
            _controller.methods.isEmpty
        ? null
        : _controller.expired
        ? _controller.refresh
        : _submit,
  );
}

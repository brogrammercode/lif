import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/driver_vehicles/controllers/driver_request_controller.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';

class DriverRequestPage extends StatefulWidget {
  final Map<String, dynamic> offer;
  final DriverOperationsRepository? repository;
  final Widget Function(Widget)? mapBuilder;
  const DriverRequestPage({
    super.key,
    required this.offer,
    this.repository,
    this.mapBuilder,
  });
  @override
  State<DriverRequestPage> createState() => _DriverRequestState();
}

class _DriverRequestState extends State<DriverRequestPage> {
  late DriverRequestController _controller;
  Timer? _poll;
  bool _initialized = false;
  double? _height;
  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    _controller = DriverRequestController(
      widget.repository ??
          DriverOperationsRepository(
            client: DataSourceScope.of(context)?.client,
          ),
      widget.offer,
    )..addListener(_changed);
    _poll = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted &&
          ModalRoute.of(context)?.isCurrent == true &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        _changed();
        if (DateTime.now().second % 5 == 0) unawaited(_controller.refresh());
      }
    });
    unawaited(_controller.refresh());
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  Future<void> _respond(bool accept) async {
    final id = await _controller.respond(accept);
    if (!mounted || id == null) return;
    if (accept) {
      Navigator.pushReplacementNamed(
        context,
        AppRoutes.driverRideDetail,
        arguments: id,
      );
    } else {
      Navigator.pop(context);
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    _controller.removeListener(_changed);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final trip = rideMap(_controller.offer['ride']);
    final map = DriverMap(
      pickup: ridePoint(trip['pickup_latitude'], trip['pickup_longitude']),
      dropoff: ridePoint(trip['dropoff_latitude'], trip['dropoff_longitude']),
    );
    return RiderFlowScaffold(
      title: 'New ride request',
      map: widget.mapBuilder?.call(map) ?? map,
      statusStrip: RideArrivalStrip(
        label: _controller.valid ? 'New ride request' : 'Request unavailable',
        value: rideMoney(trip['estimated_fare']),
      ),
      panelContentHeight: _height,
      onRefresh: () => _controller.refresh(),
      panel: SingleChildScrollView(
        child: RideContentSizeReporter(
          onSizeChanged: (size) {
            if (mounted &&
                (_height == null || (_height! - size.height).abs() > 1)) {
              setState(() => _height = size.height);
            }
          },
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                RideVehicleDriverCard(
                  vehicle: rideMap(
                    _controller.offer['vehicle'] ?? trip['vehicle'],
                  ),
                  driver: {'user': rideMap(trip['rider'])},
                  personLabel: 'Ride request',
                  showRating: false,
                ),
                const SizedBox(height: 16),
                RideRouteTimeline(trip),
                const SizedBox(height: 16),
                Text(
                  '${trip['passenger_count'] ?? 1} passenger(s) · ${rideDistance(trip['estimated_distance_m'])}',
                ),
                if ('${trip['rider_note'] ?? ''}'.isNotEmpty)
                  Text('${trip['rider_note']}'),
                if (_controller.error != null)
                  Text(
                    _controller.error!,
                    style: const TextStyle(color: Colors.red),
                  ),
                const SizedBox(height: 16),
                SizedBox(
                  height: 60,
                  child: FilledButton(
                    onPressed: _controller.busy || !_controller.valid
                        ? null
                        : () => _respond(true),
                    child: Text(_controller.busy ? 'Updating…' : 'Accept ride'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  height: 60,
                  child: OutlinedButton(
                    onPressed: _controller.busy || !_controller.valid
                        ? null
                        : () => _respond(false),
                    child: const Text('Decline'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

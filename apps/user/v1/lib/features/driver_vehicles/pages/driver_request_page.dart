import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/driver_vehicles/controllers/driver_request_controller.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';

class DriverRequestPage extends StatefulWidget {
  final Map<String, dynamic> offer;
  final DriverOperationsRepository? repository;
  final Widget Function(Widget)? mapBuilder;
  final ValueListenable<Position?>? currentPosition;
  const DriverRequestPage({
    super.key,
    required this.offer,
    this.repository,
    this.mapBuilder,
    this.currentPosition,
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
        _controller.tick();
        _changed();
        if (_controller.dismissed) {
          Future<void>.delayed(const Duration(milliseconds: 350), () {
            if (mounted && ModalRoute.of(context)?.isCurrent == true) {
              Navigator.maybePop(context);
            }
          });
          _poll?.cancel();
          return;
        }
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
    final position =
        widget.currentPosition?.value ??
        (DataSourceScope.of(context)?.isDemo == true
            ? null
            : DriverTrackingService.instance.position.value);
    final pickup = ridePoint(trip['pickup_latitude'], trip['pickup_longitude']);
    final pickupDistance = position == null || pickup == null
        ? null
        : _distanceMeters(
            position.latitude,
            position.longitude,
            pickup.latitude,
            pickup.longitude,
          );
    final map = DriverMap(
      pickup: ridePoint(trip['pickup_latitude'], trip['pickup_longitude']),
      dropoff: ridePoint(trip['dropoff_latitude'], trip['dropoff_longitude']),
    );
    return AnimatedOpacity(
      opacity: _controller.dismissed ? 0 : 1,
      duration: const Duration(milliseconds: 300),
      child: RiderFlowScaffold(
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
                    personBadge: _passengerBadge(
                      '${trip['passenger_count'] ?? 1}',
                    ),
                    vehicleSubtitle:
                        '${rideDistance(trip['estimated_distance_m'])} · ${rideDuration(trip['estimated_duration_s'])} trip\n${pickupDistance == null ? 'Pickup distance unavailable' : '${rideDistance(pickupDistance)} from you to pickup'}',
                  ),
                  const SizedBox(height: 16),
                  RideRouteTimeline(trip),
                  const SizedBox(height: 16),
                  if ('${trip['rider_note'] ?? ''}'.isNotEmpty)
                    Text('${trip['rider_note']}'),
                  if (_controller.error != null)
                    Text(
                      _controller.error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: SizedBox(
                          height: 60,
                          child: FilledButton(
                            onPressed: _controller.busy || !_controller.valid
                                ? null
                                : () => _respond(true),
                            style: FilledButton.styleFrom(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(16),
                              ),
                            ),
                            child: Text(
                              _controller.busy ? 'Updating…' : 'Accept ride',
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: SizedBox(
                          height: 60,
                          child: CustomPaint(
                            foregroundPainter: _ButtonCountdownPainter(
                              _controller.remainingFraction,
                            ),
                            child: FilledButton(
                              onPressed: _controller.busy || !_controller.valid
                                  ? null
                                  : () => _respond(false),
                              style: FilledButton.styleFrom(
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                backgroundColor: Colors.white,
                                foregroundColor: Colors.black,
                                elevation: 0,
                              ),
                              child: Text(
                                'Decline ? ${_controller.secondsRemaining}s',
                              ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  static double _distanceMeters(
    double lat1,
    double lon1,
    double lat2,
    double lon2,
  ) {
    const radius = 6371000.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLon = (lon2 - lon1) * math.pi / 180;
    final a =
        math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) *
            math.cos(lat2 * math.pi / 180) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  }

  Widget _passengerBadge(String count) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      const Icon(Icons.people_alt_outlined, size: 10),
      const SizedBox(width: 2),
      Text(
        count,
        style: const TextStyle(
          fontSize: 10,
          height: 1.2,
          fontWeight: FontWeight.w600,
        ),
      ),
    ],
  );
}

class _ButtonCountdownPainter extends CustomPainter {
  final double progress;
  const _ButtonCountdownPainter(this.progress);
  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(16)),
      );
    final metric = path.computeMetrics().first;
    final paint = Paint()
      ..color = const Color(0xFF315FEA)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3;
    canvas.drawPath(
      metric.extractPath(0, metric.length * progress.clamp(0, 1)),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant _ButtonCountdownPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

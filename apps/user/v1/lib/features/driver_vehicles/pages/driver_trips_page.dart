import 'package:user/features/driver_vehicles/controllers/driver_trips_controller.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class DriverTripsPage extends StatefulWidget {
  const DriverTripsPage({super.key});
  @override
  State<DriverTripsPage> createState() => _DriverTripsPageState();
}

class _DriverTripsPageState extends State<DriverTripsPage> {
  late final _controller = DriverTripsController(UserAppRepository())
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  Future<Map<String, dynamic>> get _data => _controller.data;
  int get _page => _controller.page;

  Future<void> _load([int? page]) => _controller.load(page);

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: 'Driver trips',
    action: IconButton(
      tooltip: 'Refresh trips',
      onPressed: _load,
      icon: const Icon(Icons.refresh_rounded),
    ),
    child: FutureBuilder<Map<String, dynamic>>(
      future: _data,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: _load,
          );
        }
        if (!snapshot.hasData) return const DriverListSkeleton(rows: 5);
        final rows = vehicleMaps(snapshot.data!['rows']);
        final total = (snapshot.data!['total'] as num?)?.toInt() ?? rows.length;
        return RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              DriverPageIntro(
                icon: Icons.route_rounded,
                title: '$total assigned ${total == 1 ? 'trip' : 'trips'}',
                description:
                    'Review routes, fare collection and issues for rides assigned to your driver profile.',
                trailing: DriverStatusPill(
                  label: 'Page $_page',
                  icon: Icons.layers_outlined,
                ),
              ),
              const SizedBox(height: 18),
              if (rows.isEmpty)
                const AppEmptyState(
                  icon: Icons.history_rounded,
                  title: 'No driver trips yet',
                  subtitle:
                      'Rides assigned to your driver account will appear here.',
                ),
              for (final ride in rows) ...[
                LiquidGlassSurface(
                  padding: EdgeInsets.zero,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(24),
                    onTap: () => Navigator.pushNamed(
                      context,
                      AppRoutes.driverRideDetail,
                      arguments: ride['id'],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          DriverInfoRow(
                            label: 'Trip ${ride['id']}',
                            value: '${ride['status']}',
                            valueWidget: DriverStatusPill(
                              label: '${ride['status']}',
                              status: '${ride['status']}',
                            ),
                          ),
                          const SizedBox(height: 16),
                          _RouteLine(
                            icon: Icons.trip_origin_rounded,
                            label: 'Pickup',
                            value: '${ride['pickup_address'] ?? 'Unavailable'}',
                          ),
                          const Padding(
                            padding: EdgeInsets.only(left: 9),
                            child: SizedBox(
                              height: 18,
                              child: VerticalDivider(width: 1),
                            ),
                          ),
                          _RouteLine(
                            icon: Icons.location_on_rounded,
                            label: 'Drop-off',
                            value:
                                '${ride['dropoff_address'] ?? 'Unavailable'}',
                          ),
                          const SizedBox(height: 14),
                          const Divider(height: 1),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  rideTime(
                                    ride['completed_at'] ??
                                        ride['created_at'] ??
                                        ride['updated_at'],
                                  ),
                                  style: const TextStyle(
                                    color: GlassTokens.muted,
                                    fontSize: 12.5,
                                  ),
                                ),
                              ),
                              Text(
                                rideMoney(
                                  ride['final_fare'] ?? ride['estimated_fare'],
                                ),
                                style: const TextStyle(
                                  color: GlassTokens.ink,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              const SizedBox(width: 6),
                              const Icon(
                                Icons.chevron_right_rounded,
                                color: GlassTokens.muted,
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],
              Row(
                children: [
                  TextButton.icon(
                    onPressed: _page > 1 ? () => _load(_page - 1) : null,
                    icon: const Icon(Icons.chevron_left_rounded),
                    label: const Text('Previous'),
                  ),
                  Expanded(
                    child: Text(
                      'Page $_page',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: GlassTokens.muted),
                    ),
                  ),
                  TextButton.icon(
                    onPressed: _page * 20 < total
                        ? () => _load(_page + 1)
                        : null,
                    iconAlignment: IconAlignment.end,
                    icon: const Icon(Icons.chevron_right_rounded),
                    label: const Text('Next'),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    ),
  );
}

class _RouteLine extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _RouteLine({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Icon(icon, size: 19, color: GlassTokens.accent),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: const TextStyle(color: GlassTokens.muted, fontSize: 12),
            ),
            const SizedBox(height: 2),
            Text(
              value,
              style: const TextStyle(
                color: GlassTokens.ink,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    ],
  );
}

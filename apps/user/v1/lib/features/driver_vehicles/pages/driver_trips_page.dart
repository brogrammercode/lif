import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class DriverTripsPage extends StatefulWidget {
  const DriverTripsPage({super.key});
  @override
  State<DriverTripsPage> createState() => _DriverTripsPageState();
}

class _DriverTripsPageState extends State<DriverTripsPage> {
  final _repo = UserAppRepository();
  late Future<Map<String, dynamic>> _data = _repo.driverRides();
  int _page = 1;
  Future<void> _load([int? page]) async {
    if (!mounted) return;
    setState(() {
      _page = page ?? _page;
      _data = _repo.driverRides(page: _page);
    });
    try {
      await _data;
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: 'Driver trips',
    child: FutureBuilder<Map<String, dynamic>>(
      future: _data,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: _load,
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final rows = vehicleMaps(snapshot.data!['rows']);
        return RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            children: [
              if (rows.isEmpty)
                const AppEmptyState(
                  icon: Icons.history,
                  title: 'No driver trips yet',
                  subtitle:
                      'Rides assigned to your driver account will appear here.',
                ),
              for (final ride in rows)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AppCard(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text('${ride['status']}'.replaceAll('_', ' ')),
                      subtitle: Text(
                        '${ride['pickup_address']}\n${ride['dropoff_address']}',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.pushNamed(
                        context,
                        AppRoutes.driverRideDetail,
                        arguments: ride['id'],
                      ),
                    ),
                  ),
                ),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextButton(
                    onPressed: _page > 1 ? () => _load(_page - 1) : null,
                    child: const Text('Previous'),
                  ),
                  Text('Page $_page'),
                  TextButton(
                    onPressed: _page * 20 < (snapshot.data!['total'] as num)
                        ? () => _load(_page + 1)
                        : null,
                    child: const Text('Next'),
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

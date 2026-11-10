import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/demos/controllers/driver_demo_controller.dart';
import 'package:user/features/demos/controllers/ride_demo_controller.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/pages/trip_chat_page.dart';
import 'package:user/features/driver_vehicles/pages/driver_request_page.dart';
import 'package:user/features/driver_vehicles/pages/driver_trip_page.dart';

class DriverDemoHost extends StatefulWidget {
  final Widget Function(Widget)? mapBuilder;
  const DriverDemoHost({super.key, this.mapBuilder});
  @override
  State<DriverDemoHost> createState() => _DriverDemoHostState();
}

class _DriverDemoHostState extends State<DriverDemoHost> {
  final _controller = DriverDemoController();
  final _navigator = GlobalKey<NavigatorState>();
  late final _repo = DriverOperationsRepository(client: _controller.transport);
  @override
  void initState() {
    super.initState();
    _controller.addListener(_changed);
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  void _preview(DriverDemoPhase phase) {
    _controller.previewDriver(phase);
    _navigator.currentState?.pushNamedAndRemoveUntil(
      phase == DriverDemoPhase.request
          ? '/demo/driver/request'
          : AppRoutes.driverRideDetail,
      (_) => false,
      arguments: RideDemoController.tripId,
    );
  }

  Route<dynamic> _route(RouteSettings settings) => MaterialPageRoute(
    settings: settings,
    builder: (_) => switch (settings.name) {
      '/demo/driver/request' => DriverRequestPage(
        offer: _controller.offer,
        repository: _repo,
        mapBuilder: widget.mapBuilder,
      ),
      AppRoutes.driverRideDetail => DriverTripPage(
        repository: _repo,
        tracking: _controller.tracking,
        mapBuilder: widget.mapBuilder,
      ),
      AppRoutes.tripChat => const TripChatPage(),
      AppRoutes.gate => const SolidPage(
        title: 'Demo complete',
        child: Center(child: Text('Use Restart below to try the flow again.')),
      ),
      _ => const SolidPage(
        title: 'Demo',
        child: Center(
          child: Text('External actions are unavailable in this demo.'),
        ),
      ),
    },
  );
  @override
  void dispose() {
    _controller.removeListener(_changed);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => DataSourceScope(
    client: _controller.transport,
    changes: _controller,
    userId: 'demo-driver-user',
    isDemo: true,
    child: SolidScope(
      child: Scaffold(
        body: SafeArea(
          top: false,
          child: Column(
            children: [
              Expanded(
                child: Navigator(
                  key: _navigator,
                  onGenerateInitialRoutes: (_, _) => [
                    _route(const RouteSettings(name: '/demo/driver/request')),
                  ],
                  onGenerateRoute: _route,
                ),
              ),
              Container(
                color: const Color(0xFFF5F5F5),
                child: SafeArea(
                  top: false,
                  child: Row(
                    children: [
                      Expanded(
                        child: PopupMenuButton<DriverDemoPhase>(
                          onSelected: _preview,
                          itemBuilder: (_) => [
                            for (final phase in DriverDemoPhase.values)
                              PopupMenuItem(
                                value: phase,
                                child: Text(DriverDemoController.label(phase)),
                              ),
                          ],
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Text(
                              'DEMO · ${DriverDemoController.label(_controller.phase)} ▾',
                            ),
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed:
                            _controller.phase == DriverDemoPhase.completed
                            ? null
                            : () => _preview(
                                DriverDemoPhase.values[_controller.phase.index +
                                    1],
                              ),
                        child: const Text('Next'),
                      ),
                      IconButton(
                        onPressed: () => _preview(DriverDemoPhase.request),
                        icon: const Icon(Icons.restart_alt),
                        tooltip: 'Restart demo',
                      ),
                      IconButton(
                        onPressed: () => Navigator.pop(context),
                        icon: const Icon(Icons.close),
                        tooltip: 'Close demo',
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

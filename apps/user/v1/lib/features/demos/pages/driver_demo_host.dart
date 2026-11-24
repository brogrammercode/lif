import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/demos/controllers/driver_demo_controller.dart';
import 'package:user/features/demos/controllers/ride_demo_controller.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/pages/trip_chat_page.dart';
import 'package:user/features/driver_operations/widgets/driver_go_online_stage.dart';
import 'package:user/features/driver_operations/widgets/driver_map.dart';
import 'package:user/features/rides/widgets/ride_sheet_route.dart';
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
  final _observer = _DriverDemoRouteObserver();
  final _stageMap = ValueNotifier<DriverMap?>(null);

  Widget _reportMap(Widget map) {
    if (map is! DriverMap) return const SizedBox.shrink();
    return reportRideSheetMap(map, (next) {
      if (mounted) _stageMap.value = next;
    });
  }

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
    _showPhase(phase);
  }

  void _showPhase(DriverDemoPhase phase) {
    final navigator = _navigator.currentState;
    if (navigator == null) return;
    final name = _routeName(phase);
    if (_observer.current?.settings.name == name) return;
    navigator.popUntil((route) => route.isFirst);
    if (phase == DriverDemoPhase.goOnline) return;
    navigator.push(
      _route(RouteSettings(name: name, arguments: RideDemoController.tripId)),
    );
  }

  String _routeName(DriverDemoPhase phase) => switch (phase) {
    DriverDemoPhase.goOnline => '/demo/driver/go-online',
    DriverDemoPhase.request => '/demo/driver/request',
    _ => AppRoutes.driverRideDetail,
  };

  void _goOnline() {
    _controller.goOnline();
    _showPhase(DriverDemoPhase.request);
  }

  Route<dynamic> _route(RouteSettings settings) {
    switch (settings.name) {
      case '/demo/driver/go-online':
        return MaterialPageRoute(
          settings: settings,
          builder: (context) => ListenableBuilder(
            listenable: Listenable.merge([_controller, _stageMap]),
            builder: (context, _) {
              final covered = ModalRoute.isCurrentOf(context) == false;
              return DriverGoOnlineStage(
                vehicles: _controller.ownedVehicles,
                selectedVehicleId: _controller.selectedVehicleId,
                loading: false,
                busy: false,
                canGoOnline: true,
                position: _controller.tracking.position,
                onSelectVehicle: _controller.selectVehicle,
                onGoOnline: _goOnline,
                mapOnly: covered,
                mapBuilder: (map) {
                  final effective = covered ? _stageMap.value ?? map : map;
                  return widget.mapBuilder?.call(effective) ?? effective;
                },
              );
            },
          ),
        );
      case '/demo/driver/request':
        return RideSheetRoute<void>(
          settings: settings,
          builder: (_) => DriverRequestPage(
            offer: _controller.offer,
            repository: _repo,
            mapBuilder: _reportMap,
            currentPosition: _controller.tracking.position,
          ),
        );
      case AppRoutes.driverRideDetail:
        return RideSheetRoute<void>(
          settings: settings,
          builder: (_) => DriverTripPage(
            repository: _repo,
            tracking: _controller.tracking,
            mapBuilder: _reportMap,
          ),
        );
      default:
        return MaterialPageRoute(
          settings: settings,
          builder: (_) => settings.name == AppRoutes.tripChat
              ? const TripChatPage()
              : const SolidPage(
                  title: 'Demo',
                  child: Center(
                    child: Text(
                      'External actions are unavailable in this demo.',
                    ),
                  ),
                ),
        );
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_changed);
    _controller.dispose();
    _stageMap.dispose();
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
                    _route(const RouteSettings(name: '/demo/driver/go-online')),
                  ],
                  onGenerateRoute: _route,
                  observers: [_observer],
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
                        onPressed: () => _preview(DriverDemoPhase.goOnline),
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

class _DriverDemoRouteObserver extends NavigatorObserver {
  Route<dynamic>? current;

  @override
  void didChangeTop(Route<dynamic> topRoute, Route<dynamic>? previousTopRoute) {
    current = topRoute;
  }
}

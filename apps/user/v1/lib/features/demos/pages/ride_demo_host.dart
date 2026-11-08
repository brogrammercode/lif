import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/routes.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/core/state/data_source_scope.dart';
import 'package:user/features/demos/controllers/ride_demo_controller.dart';
import 'package:user/features/home/pages/home_page.dart';
import 'package:user/features/rides/pages/vehicle_selection_page.dart';
import 'package:user/features/rides/pages/ride_detail_page.dart';
import 'package:user/features/rides/ride_detail_intent.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/driver_operations/pages/trip_chat_page.dart';

/// Only a source/Navigator and scenario toolbar. All flow pages are production pages.
class RideDemoHost extends StatefulWidget {
  final Widget Function(Widget)? mapBuilder;
  const RideDemoHost({super.key, this.mapBuilder});
  @override
  State<RideDemoHost> createState() => _RideDemoHostState();
}

class _RideDemoHostState extends State<RideDemoHost> {
  final _controller = RideDemoController();
  final _navigator = GlobalKey<NavigatorState>();
  final _observer = RouteObserver<ModalRoute<dynamic>>();
  int _navigationRevision = 0;
  @override
  void initState() {
    super.initState();
    _controller.addListener(_changed);
  }

  void _changed() {
    if (!mounted) return;
    setState(() {});
    if (_navigationRevision == _controller.navigationRevision) return;
    _navigationRevision = _controller.navigationRevision;
    final revision = _navigationRevision;
    final step = _controller.step;
    final route = step == RideDemoStep.home
        ? AppRoutes.home
        : step == RideDemoStep.locations
        ? '/demo/locations'
        : step == RideDemoStep.vehicles
        ? '/demo/vehicles'
        : AppRoutes.rideDetail;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && revision == _navigationRevision) {
        _navigator.currentState?.pushNamedAndRemoveUntil(
          route,
          (_) => false,
          arguments: route == AppRoutes.rideDetail
              ? const RideDetailIntent(
                  RideDemoController.tripId,
                  liveJourney: true,
                )
              : null,
        );
      }
    });
  }

  Route<dynamic> _route(RouteSettings settings) {
    final page = switch (settings.name) {
      AppRoutes.home ||
      '/' => HomePage(showDemoLauncher: false, mapBuilder: widget.mapBuilder),
      '/demo/locations' => HomePage(
        mapBuilder: widget.mapBuilder,
        locationSelection: true,
        endpoints: _controller.endpoints,
        showDemoLauncher: false,
      ),
      '/demo/vehicles' => VehicleSelectionPage(
        mapBuilder: widget.mapBuilder,
        input: _controller.endpoints,
        initialQuote: _controller.quote,
        points: rideGeometry(_controller.geometry),
      ),
      AppRoutes.rideDetail => RideDetailPage(mapBuilder: widget.mapBuilder),
      AppRoutes.tripChat => const TripChatPage(),
      _ => const SolidPage(
        title: 'UI demo',
        child: Center(
          child: Text(
            'This destination is outside the ride demo. Use Back to return.',
          ),
        ),
      ),
    };
    return MaterialPageRoute(settings: settings, builder: (_) => page);
  }

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
    initialEndpoints: () => _controller.endpoints,
    userId: RideDemoController.riderId,
    isDemo: true,
    child: RideRouteObserverScope(
      observer: _observer,
      child: SolidScope(
        child: Scaffold(
          body: SafeArea(
            top: false,
            child: Column(
              children: [
                Expanded(
                  child: NavigatorPopHandler<Object?>(
                    onPopWithResult: (_) => _navigator.currentState?.maybePop(),
                    child: Navigator(
                      key: _navigator,
                      onGenerateInitialRoutes: (_, _) => [
                        _route(const RouteSettings(name: AppRoutes.home)),
                      ],
                      observers: [_observer],
                      onGenerateRoute: _route,
                    ),
                  ),
                ),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 6,
                  ),
                  decoration: const BoxDecoration(
                    color: Color(0xFFF5F5F5),
                    border: Border(top: BorderSide(color: RideTokens.line)),
                  ),
                  child: Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 6,
                    children: [
                      PopupMenuButton<RideDemoStep>(
                        tooltip: 'Choose demo stage',
                        initialValue: _controller.step,
                        onSelected: _controller.preview,
                        itemBuilder: (_) => [
                          for (final step in RideDemoStep.values)
                            PopupMenuItem(
                              value: step,
                              child: Text(RideDemoController.label(step)),
                            ),
                        ],
                        child: Padding(
                          padding: const EdgeInsets.all(10),
                          child: Text(
                            'DEMO · ${RideDemoController.label(_controller.step)} ▾',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: _controller.step == RideDemoStep.completed
                            ? null
                            : _controller.next,
                        child: const Text('Next'),
                      ),
                      IconButton(
                        tooltip: 'Restart demo',
                        onPressed: _controller.restart,
                        icon: const Icon(Icons.restart_alt),
                      ),
                      IconButton(
                        tooltip: 'Close demo',
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

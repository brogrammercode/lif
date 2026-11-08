import 'package:user/features/driver_vehicles/controllers/driver_vehicle_gate_controller.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/models/user.model.dart';
import 'package:user/features/driver_vehicles/pages/driver_vehicles_page.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

class DriverVehicleGate extends StatefulWidget {
  final Widget child;
  final VehicleVerificationRepository? repository;
  final Future<UserModel> Function()? loadUser;
  const DriverVehicleGate({
    super.key,
    required this.child,
    this.repository,
    this.loadUser,
  });
  @override
  State<DriverVehicleGate> createState() => _DriverVehicleGateState();
}

class _DriverVehicleGateState extends State<DriverVehicleGate>
    with WidgetsBindingObserver, RouteAware {
  late final _controller = DriverVehicleGateController(
    widget.repository ?? VehicleVerificationRepository(),
    widget.loadUser ?? AuthRepository().currentUser,
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  Map<String, dynamic>? get _registration => _controller.registration;
  ModalRoute<dynamic>? _route;
  bool get _homeAllowed => _controller.homeAllowed;
  bool get _checking => _controller.checking;
  Future<bool> get _ready => _controller.ready;
  set _ready(Future<bool> value) => _controller.ready = value;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (_route != route) {
      appRouteObserver.unsubscribe(this);
      _route = route;
      if (route != null) appRouteObserver.subscribe(this, route);
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    appRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didPopNext() => _refreshHome();

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refreshHome();
  }

  void _refreshHome() {
    // Registration owns its draft and camera lifecycle. Only recheck a home
    // that was previously unlocked, and only when its route is visible.
    if (mounted && _homeAllowed && !_checking && _route?.isCurrent == true) {
      setState(() {
        _ready = _check();
      });
    }
  }

  Future<bool> _check() => _controller.check();

  @override
  Widget build(BuildContext context) => FutureBuilder<bool>(
    future: _ready,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return AppPage(
          glass: true,
          title: 'Vehicle registration',
          child: AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: () => setState(() {
              _ready = _check();
            }),
          ),
        );
      }
      if (snapshot.connectionState == ConnectionState.waiting ||
          !snapshot.hasData) {
        return const LiquidGlassScope(
          child: Scaffold(
            body: LiquidGlassBackdrop(
              child: SafeArea(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(20, 76, 20, 20),
                  child: LiquidGlassFormSkeleton(),
                ),
              ),
            ),
          ),
        );
      }
      return snapshot.data!
          ? widget.child
          : DriverVehiclesPage(
              registrationRequired: true,
              initialData: _registration,
              repository: widget.repository,
            );
    },
  );
}

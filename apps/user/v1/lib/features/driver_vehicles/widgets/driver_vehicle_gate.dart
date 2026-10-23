import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
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
  Map<String, dynamic>? _registration;
  ModalRoute<dynamic>? _route;
  bool _homeAllowed = false;
  bool _checking = false;
  late Future<bool> _ready = _check();

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

  Future<bool> _check() async {
    _checking = true;
    _homeAllowed = false;
    try {
      final user = await (widget.loadUser ?? AuthRepository().currentUser)();
      if (!mounted) return false;
      if (user.partnerStatus == 'EXITED') return _homeAllowed = true;
      final data = await (widget.repository ?? VehicleVerificationRepository())
          .mine();
      if (!mounted) return false;
      _registration = data;
      return _homeAllowed = vehicleMaps(
        data['vehicles'],
      ).any((v) => v['is_eligible'] == true);
    } finally {
      _checking = false;
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<bool>(
    future: _ready,
    builder: (context, snapshot) {
      if (snapshot.hasError) {
        return AppPage(
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
        return const Scaffold(
          body: Center(
            child: CircularProgressIndicator(color: AppColors.primaryGreen),
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

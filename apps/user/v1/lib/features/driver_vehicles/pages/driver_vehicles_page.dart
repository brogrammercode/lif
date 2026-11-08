import 'package:user/features/driver_vehicles/controllers/driver_vehicles_controller.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/driver_operations/widgets/driver_glass.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/driver_vehicles/widgets/vehicle_registration_form.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class DriverVehiclesPage extends StatefulWidget {
  final bool registrationRequired;
  final Map<String, dynamic>? initialData;
  final VehicleVerificationRepository? repository;
  const DriverVehiclesPage({
    super.key,
    this.registrationRequired = false,
    this.initialData,
    this.repository,
  });
  @override
  State<DriverVehiclesPage> createState() => _DriverVehiclesPageState();
}

class _DriverVehiclesPageState extends State<DriverVehiclesPage>
    with WidgetsBindingObserver {
  late final _controller = DriverVehiclesController(
    widget.repository ?? VehicleVerificationRepository(),
    widget.initialData,
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  Future<Map<String, dynamic>> get _data => _controller.data;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool _editing = false;
  bool _inlineForm = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        ModalRoute.of(context)?.isCurrent == true &&
        !_editing &&
        !_inlineForm &&
        !_busy) {
      _reload();
    }
  }

  Future<void> _reload() => _controller.reload();

  Future<void> _edit([Map<String, dynamic>? vehicle]) async {
    if (_busy || _editing) return;
    _editing = true;
    try {
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (context) => AppPage(
            glass: true,
            title: vehicle == null ? 'Register vehicle' : 'Vehicle corrections',
            child: VehicleRegistrationForm(
              vehicle: vehicle,
              onSaved: () async {
                if (context.mounted) Navigator.pop(context);
              },
            ),
          ),
        ),
      );
    } finally {
      _editing = false;
    }
    if (mounted) await _reload();
  }

  Future<void> _active(String id) async {
    setState(() => _busy = true);
    try {
      await UserAppRepository().selectActiveVehicle(id);
      if (!mounted) return;
      if (widget.registrationRequired) {
        Navigator.pushNamedAndRemoveUntil(
          context,
          AppRoutes.driverHome,
          (_) => false,
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Active vehicle updated.')),
        );
        await _reload();
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !widget.registrationRequired && !_busy,
    child: AppPage(
      glass: true,
      title: widget.registrationRequired
          ? 'Vehicle registration'
          : 'My vehicles',
      action: widget.registrationRequired
          ? Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  tooltip: 'Settings',
                  onPressed: _busy
                      ? null
                      : () => Navigator.pushNamed(context, AppRoutes.settings),
                  icon: const Icon(Icons.settings_outlined),
                ),
                IconButton(
                  tooltip: 'Help',
                  onPressed: _busy
                      ? null
                      : () => Navigator.pushNamed(context, AppRoutes.support),
                  icon: const Icon(Icons.support_agent),
                ),
                IconButton(
                  tooltip: 'Sign out',
                  onPressed: _busy
                      ? null
                      : () async {
                          await AuthRepository().signOut();
                          if (context.mounted) {
                            Navigator.pushNamedAndRemoveUntil(
                              context,
                              AppRoutes.login,
                              (_) => false,
                            );
                          }
                        },
                  icon: const Icon(Icons.logout),
                ),
              ],
            )
          : null,
      child: FutureBuilder<Map<String, dynamic>>(
        future: _data,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return AppLoadError(
              message: ApiResult.errorMessage(snapshot.error!),
              onRetry: _reload,
            );
          }
          if (!snapshot.hasData) {
            return const LiquidGlassFormSkeleton();
          }
          final vehicles = vehicleMaps(snapshot.data!['vehicles']);
          _inlineForm = vehicles.isEmpty;
          if (vehicles.isEmpty) {
            return VehicleRegistrationForm(onSaved: _reload);
          }
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                DriverPageIntro(
                  icon: Icons.garage_outlined,
                  title: widget.registrationRequired
                      ? 'Vehicle verification required'
                      : '${vehicles.length} registered ${vehicles.length == 1 ? 'vehicle' : 'vehicles'}',
                  description: widget.registrationRequired
                      ? 'At least one vehicle must finish review before driver operations unlock.'
                      : 'Choose one eligible vehicle for offers, or review its documents and catalog status.',
                  trailing: DriverStatusPill(
                    label:
                        '${vehicles.where((v) => v['is_eligible'] == true).length} ready',
                    status: vehicles.any((v) => v['is_eligible'] == true)
                        ? 'ACTIVE'
                        : 'PENDING',
                  ),
                ),
                const SizedBox(height: 18),
                for (final vehicle in vehicles)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              LiquidGlassSurface(
                                radius: 99,
                                padding: const EdgeInsets.all(12),
                                child: Icon(
                                  [
                                        'BIKE',
                                        'SCOOTER',
                                      ].contains(vehicle['vehicle_type'])
                                      ? Icons.two_wheeler_rounded
                                      : Icons.directions_car_filled_outlined,
                                  color: GlassTokens.accent,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '${vehicle['make']} ${vehicle['model']}',
                                      style: const TextStyle(
                                        color: GlassTokens.ink,
                                        fontSize: 18,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      '${vehicle['plate_number']}',
                                      style: const TextStyle(
                                        color: GlassTokens.muted,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              DriverStatusPill(
                                label: '${vehicle['status']}',
                                status: '${vehicle['status']}',
                              ),
                            ],
                          ),
                          const SizedBox(height: 16),
                          if (vehicle['status'] == 'ACTIVE' &&
                              vehicle['is_eligible'] != true &&
                              vehicleMaps(
                                vehicle['verification_fields'],
                              ).isNotEmpty)
                            const Padding(
                              padding: EdgeInsets.only(bottom: 12),
                              child: DriverNotice(
                                icon: Icons.warning_amber_rounded,
                                message:
                                    'This approved vehicle is unavailable. Ask an administrator to check its brand, model and category configuration.',
                                warning: true,
                              ),
                            ),
                          for (final field in vehicleMaps(
                            vehicle['verification_fields'],
                          ))
                            Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(child: Text('${field['label']}')),
                                  DriverStatusPill(
                                    label: '${field['status']}',
                                    status: '${field['status']}',
                                  ),
                                ],
                              ),
                            ),
                          for (final field in vehicleMaps(
                            vehicle['verification_fields'],
                          ).where((field) => field['rejection_reason'] != null))
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: DriverNotice(
                                icon: Icons.info_outline_rounded,
                                message:
                                    '${field['label']}: ${field['rejection_reason']}',
                                error: true,
                              ),
                            ),
                          if (vehicleMaps(
                                vehicle['verification_fields'],
                              ).isEmpty ||
                              [
                                'UNDER_REVIEW',
                                'REJECTED',
                              ].contains(vehicle['status']))
                            OutlinedButton(
                              onPressed: _busy ? null : () => _edit(vehicle),
                              child: Text(
                                vehicleMaps(
                                      vehicle['verification_fields'],
                                    ).isEmpty
                                    ? 'Complete verification'
                                    : 'View or correct submission',
                              ),
                            ),
                          if (vehicle['is_eligible'] == true)
                            LiquidGlassButton(
                              onPressed: _busy
                                  ? null
                                  : () => _active('${vehicle['id']}'),
                              busy: _busy,
                              text: 'Use this vehicle',
                            ),
                        ],
                      ),
                    ),
                  ),
                LiquidGlassButton(
                  onPressed: _busy ? null : () => _edit(),
                  icon: const Icon(Icons.add),
                  text: 'Register another vehicle',
                ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    ),
  );
}

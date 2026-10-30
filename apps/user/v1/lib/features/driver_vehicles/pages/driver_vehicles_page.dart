import 'package:user/components/ui/liquid_glass.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
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
  late final _repo = widget.repository ?? VehicleVerificationRepository();
  late Future<Map<String, dynamic>> _data = widget.initialData == null
      ? _repo.mine()
      : Future.value(widget.initialData!);
  bool _busy = false;
  bool _editing = false;
  bool _inlineForm = false;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
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

  Future<void> _reload() async {
    if (!mounted) return;
    setState(() {
      _data = _repo.mine();
    });
    try {
      await _data;
    } catch (_) {}
  }

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
                if (widget.registrationRequired)
                  const Padding(
                    padding: EdgeInsets.only(bottom: 20),
                    child: Text(
                      'Your vehicle must be verified before you can start driving. Pull down to refresh your review status.',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        height: 1.5,
                      ),
                    ),
                  ),
                for (final vehicle in vehicles)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: AppCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            '${vehicle['make']} ${vehicle['model']}',
                            style: const TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${vehicle['plate_number']} · ${vehicle['status']}'
                                .replaceAll('_', ' '),
                          ),
                          const SizedBox(height: 12),
                          if (vehicle['status'] == 'ACTIVE' &&
                              vehicle['is_eligible'] != true &&
                              vehicleMaps(
                                vehicle['verification_fields'],
                              ).isNotEmpty)
                            const Padding(
                              padding: EdgeInsets.only(bottom: 12),
                              child: Text(
                                'This approved vehicle is currently unavailable. Ask your administrator to check its brand, model, and category configuration.',
                                style: TextStyle(
                                  color: AppColors.textSecondary,
                                ),
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
                                  Expanded(
                                    child: Text(
                                      '${field['status']}${field['rejection_reason'] == null ? '' : '\n${field['rejection_reason']}'}',
                                      textAlign: TextAlign.end,
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: field['status'] == 'REJECTED'
                                            ? AppColors.googleRed
                                            : AppColors.textSecondary,
                                      ),
                                    ),
                                  ),
                                ],
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
                            FilledButton(
                              onPressed: _busy
                                  ? null
                                  : () => _active('${vehicle['id']}'),
                              child: const Text('Use this vehicle'),
                            ),
                        ],
                      ),
                    ),
                  ),
                FilledButton.icon(
                  onPressed: _busy ? null : () => _edit(),
                  icon: const Icon(Icons.add),
                  label: const Text('Register another vehicle'),
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

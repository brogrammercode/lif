import 'package:user/features/driver_vehicles/controllers/driver_vehicles_controller.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/driver_vehicles/widgets/vehicle_registration_form.dart';
import 'package:user/features/driver_vehicles/widgets/catalog_selector.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:user/components/ui/solid_ui.dart';

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

  Future<void> _edit({
    Map<String, dynamic>? vehicle,
    Map<String, dynamic>? initialBrand,
    Map<String, dynamic>? initialModel,
  }) async {
    if (_busy || _editing) return;
    _editing = true;
    try {
      await Navigator.push<void>(
        context,
        MaterialPageRoute(
          builder: (context) => AppPage(
            glass: true,
            title: vehicle == null ? 'Add Vehicle' : 'Edit Vehicle',
            child: VehicleRegistrationForm(
              vehicle: vehicle,
              initialBrand: initialBrand,
              initialModel: initialModel,
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

  Future<void> _addVehicle() async {
    if (_busy || _editing) return;
    final brand = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => const CatalogSelector()),
    );
    if (brand == null || !mounted) return;
    final model = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (_) => CatalogSelector(brand: brand)),
    );
    if (model == null || !mounted) return;
    await _edit(initialBrand: brand, initialModel: model);
  }

  Future<void> _vehicleMenu(Map<String, dynamic> vehicle) async {
    final action = await showSolidActionSheet<String>(
      context: context,
      title: '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''}'.trim(),
      actions: const [
        SolidSheetAction(
          value: 'edit',
          label: 'Edit vehicle',
          icon: Icons.edit_outlined,
        ),
        SolidSheetAction(
          value: 'remove',
          label: 'Delete vehicle',
          icon: Icons.delete_outline_rounded,
          destructive: true,
        ),
      ],
    );
    if (!mounted || action == null) return;
    if (action == 'edit') {
      await _edit(vehicle: vehicle);
    } else {
      await _confirmRemove(vehicle);
    }
  }

  Future<void> _confirmRemove(Map<String, dynamic> vehicle) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: Colors.white,
        title: const Text('Delete vehicle?'),
        content: Text(
          'Remove ${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''} from your vehicles? Ride history will be kept.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFFB3261E),
            ),
            child: const Text('Delete vehicle'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await _controller.repo.remove('${vehicle['id']}');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vehicle removed. Ride history is retained.'),
        ),
      );
      await _reload();
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

  Map<String, dynamic> _brandFor(Map<String, dynamic> vehicle) {
    final brand = vehicle['brand'];
    if (brand is Map) return Map<String, dynamic>.from(brand);
    final model = vehicle['catalog_model'];
    if (model is Map && model['brand'] is Map) {
      return Map<String, dynamic>.from(model['brand'] as Map);
    }
    final name = '${vehicle['make'] ?? 'Vehicle'}';
    return {
      'id': 'make:${name.toLowerCase()}',
      'name': name,
      'logo_url': vehicle['brand_logo_url'],
    };
  }

  List<Map<String, dynamic>> _registeredBrands(
    List<Map<String, dynamic>> vehicles,
  ) {
    final brands = <String, Map<String, dynamic>>{};
    for (final vehicle in vehicles) {
      final brand = _brandFor(vehicle);
      brands.putIfAbsent('${brand['id']}', () => brand);
    }
    return brands.values.toList(growable: false);
  }

  Widget _brandChoice(Map<String, dynamic> brand, bool selected) {
    final logo = '${brand['logo_url'] ?? ''}'.trim();
    return SizedBox(
      width: 88,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 70,
            height: 70,
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: Colors.white,
              border: Border.all(
                color: selected ? RideTokens.ink : RideTokens.line,
                width: selected ? 1.6 : 1,
              ),
            ),
            child: Container(
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
              ),
              clipBehavior: Clip.antiAlias,
              padding: const EdgeInsets.all(12),
              child: logo.isEmpty
                  ? const Icon(Icons.directions_car_filled_outlined, size: 27)
                  : Image.network(
                      logo,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.directions_car_filled_outlined,
                        size: 27,
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 7),
          Text(
            '${brand['name'] ?? 'Vehicle'}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              color: selected ? RideTokens.ink : RideTokens.muted,
              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }

  Widget _vehicleTile(Map<String, dynamic> vehicle) {
    final brand = _brandFor(vehicle);
    final logo = '${brand['logo_url'] ?? ''}'.trim();
    final fields = vehicleMaps(vehicle['verification_fields']);
    final rejection = fields
        .where((field) => field['rejection_reason'] != null)
        .map((field) => '${field['label']}: ${field['rejection_reason']}')
        .join('\n');
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: SolidSurface(
        radius: 14,
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  padding: const EdgeInsets.all(9),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                    border: Border.all(color: RideTokens.line),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: logo.isEmpty
                      ? const Icon(Icons.directions_car_filled_outlined)
                      : Image.network(
                          logo,
                          fit: BoxFit.contain,
                          errorBuilder: (_, _, _) =>
                              const Icon(Icons.directions_car_filled_outlined),
                        ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${vehicle['make'] ?? brand['name'] ?? ''} ${vehicle['model'] ?? ''}'
                            .trim(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                          color: RideTokens.ink,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${vehicle['plate_number'] ?? ''}',
                        style: const TextStyle(
                          fontSize: 13,
                          color: RideTokens.muted,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 5),
                IconButton(
                  tooltip: 'Vehicle options',
                  onPressed: _busy ? null : () => _vehicleMenu(vehicle),
                  icon: const Icon(Icons.more_vert_rounded),
                ),
              ],
            ),
            const SizedBox(height: 11),
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${vehicle['color'] ?? ''} · ${vehicle['vehicle_category'] is Map ? (vehicle['vehicle_category'] as Map)['name'] ?? '' : ''}'
                        .replaceAll(RegExp(r'^ · | · $'), ''),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: RideTokens.muted,
                    ),
                  ),
                ),
                Text(
                  '${vehicle['status'] ?? 'PENDING'}',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: vehicle['is_eligible'] == true
                        ? const Color(0xFF16834A)
                        : RideTokens.muted,
                  ),
                ),
              ],
            ),
            if (rejection.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                rejection,
                style: const TextStyle(fontSize: 12, color: Color(0xFFB3261E)),
              ),
            ],
            if (vehicle['is_eligible'] == true) ...[
              const SizedBox(height: 12),
              SolidButton(
                text: 'Use this vehicle',
                minHeight: 46,
                busy: _busy,
                onPressed: () => _active('${vehicle['id']}'),
              ),
            ],
          ],
        ),
      ),
    );
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
          final vehicles = vehicleMaps(snapshot.data!['vehicles'])
              .where((vehicle) => vehicle['status'] != 'INACTIVE')
              .toList(growable: false);
          _inlineForm = widget.registrationRequired && vehicles.isEmpty;
          if (_inlineForm) {
            return VehicleRegistrationForm(onSaved: _reload);
          }
          final brands = _registeredBrands(vehicles);
          _controller.ensureSelectedBrand(brands);
          final selectedBrand = brands
              .where((brand) => '${brand['id']}' == _controller.selectedBrandId)
              .firstOrNull;
          final selectedVehicles = selectedBrand == null
              ? const <Map<String, dynamic>>[]
              : vehicles
                    .where(
                      (vehicle) =>
                          '${_brandFor(vehicle)['id']}' ==
                          '${selectedBrand['id']}',
                    )
                    .toList(growable: false);
          return RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: const EdgeInsets.only(top: 20, bottom: 24),
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                SizedBox(
                  height: 110,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: brands.length + 1,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      if (index == brands.length) {
                        return SizedBox(
                          width: 76,
                          child: Column(
                            children: [
                              SizedBox(
                                width: 70,
                                height: 70,
                                child: Material(
                                  color: Colors.white,
                                  shape: const CircleBorder(
                                    side: BorderSide(color: RideTokens.line),
                                  ),
                                  child: InkWell(
                                    customBorder: const CircleBorder(),
                                    onTap: _busy ? null : _addVehicle,
                                    child: const Icon(Icons.add_rounded),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 7),
                              const Text(
                                'Add',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: RideTokens.muted,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        );
                      }
                      final brand = brands[index];
                      final selected =
                          '${brand['id']}' == _controller.selectedBrandId;
                      return GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () => _controller.selectBrand('${brand['id']}'),
                        child: _brandChoice(brand, selected),
                      );
                    },
                  ),
                ),
                const SizedBox(height: 20),
                if (selectedBrand == null)
                  const AppEmptyState(
                    icon: Icons.directions_car_outlined,
                    title: 'No vehicles yet',
                    subtitle: 'Add a vehicle to get started.',
                  )
                else ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      '${selectedBrand['name']} vehicles',
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                        color: RideTokens.ink,
                      ),
                    ),
                  ),
                  if (selectedVehicles.isEmpty)
                    const AppEmptyState(
                      icon: Icons.directions_car_outlined,
                      title: 'No vehicles for this brand',
                      subtitle: 'Choose Add to register another vehicle.',
                    )
                  else
                    for (final vehicle in selectedVehicles)
                      _vehicleTile(vehicle),
                ],
              ],
            ),
          );
        },
      ),
    ),
  );
}

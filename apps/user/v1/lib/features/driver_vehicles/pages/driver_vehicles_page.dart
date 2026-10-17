import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_vehicles/driver_vehicles.constant.dart';
import 'package:user/features/user_app/user_app.constant.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class DriverVehiclesPage extends StatefulWidget {
  const DriverVehiclesPage({super.key});
  @override
  State<DriverVehiclesPage> createState() => _DriverVehiclesPageState();
}

class _DriverVehiclesPageState extends State<DriverVehiclesPage> {
  final _repository = UserAppRepository();
  late Future<Map<String, dynamic>> _profile = _repository.driverProfile();
  bool _busy = false;

  Future<void> _reload() async {
    if (!mounted) return;
    setState(() => _profile = _repository.driverProfile());
    try {
      await _profile;
    } catch (_) {}
  }

  String _label(Map<String, dynamic> category) {
    final parent = category['parent'];
    final parentName =
        category['parent_name'] ?? (parent is Map ? parent['name'] : null);
    return parentName == null
        ? '${category['name']}'
        : '$parentName / ${category['name']}';
  }

  Future<void> _edit([Map<String, dynamic>? vehicle]) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final categories = (await _repository.vehicleCategories())
          .where(
            (category) =>
                category['is_selectable'] == true &&
                (vehicle == null ||
                    (category['vehicle_type'] == vehicle['type'] &&
                        (category['capacity'] as num) <=
                            (vehicle['capacity'] as num))),
          )
          .toList();
      if (!mounted) return;
      if (categories.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text(DriverVehicleCopy.unavailable)),
        );
        return;
      }
      final saved = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (_) => _VehicleEditor(
          repository: _repository,
          categories: categories,
          vehicle: vehicle,
        ),
      );
      if (saved == true && mounted) await _reload();
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

  Future<void> _selectActive(Map<String, dynamic> vehicle) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await _repository.selectActiveVehicle('${vehicle['id']}');
      if (mounted) await _reload();
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
  Widget build(BuildContext context) => AppPage(
    title: DriverVehicleCopy.title,
    action: IconButton(
      onPressed: _busy ? null : () => _edit(),
      icon: const Icon(Icons.add, color: AppColors.primaryGreen),
    ),
    scrollable: true,
    child: FutureBuilder<Map<String, dynamic>>(
      future: _profile,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return AppLoadError(
            message: ApiResult.errorMessage(snapshot.error!),
            onRetry: _reload,
          );
        }
        if (!snapshot.hasData) {
          return const Center(
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.primaryGreen,
            ),
          );
        }
        final vehicles = (snapshot.data!['vehicles'] as List? ?? [])
            .map((value) => Map<String, dynamic>.from(value as Map))
            .toList();
        return RefreshIndicator(
          onRefresh: _reload,
          color: AppColors.primaryGreen,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: EdgeInsets.all(16.r),
            children: [
              if (vehicles.isEmpty) ...[
                SizedBox(height: 100.r),
                const AppEmptyState(
                  icon: Icons.directions_car_outlined,
                  title: DriverVehicleCopy.empty,
                  subtitle: DriverVehicleCopy.emptyDescription,
                ),
              ],
              for (final vehicle in vehicles)
                Padding(
                  padding: EdgeInsets.only(bottom: 12.r),
                  child: AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${vehicle['make']} ${vehicle['model']}',
                          style: TextStyle(
                            fontSize: 16.r,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        SizedBox(height: 4.r),
                        Text(
                          '${vehicle['plate_number']} · ${vehicle['status']}',
                          style: TextStyle(
                            fontSize: 12.r,
                            color: AppColors.textSecondary,
                          ),
                        ),
                        SizedBox(height: 8.r),
                        Text(
                          vehicle['vehicle_category'] is Map
                              ? _label(
                                  Map<String, dynamic>.from(
                                    vehicle['vehicle_category'] as Map,
                                  ),
                                )
                              : DriverVehicleCopy.category,
                          style: TextStyle(fontSize: 13.r),
                        ),
                        TextButton(
                          onPressed: _busy ? null : () => _edit(vehicle),
                          child: const Text(DriverVehicleCopy.changeCategory),
                        ),
                        if (vehicle['id'] ==
                            snapshot.data!['active_vehicle_id'])
                          const Text(DriverVehicleCopy.activeVehicle)
                        else if (vehicle['status'] == 'ACTIVE')
                          TextButton(
                            onPressed: _busy
                                ? null
                                : () => _selectActive(vehicle),
                            child: const Text(DriverVehicleCopy.useVehicle),
                          ),
                        if (vehicle['status'] == 'UNDER_REVIEW')
                          const Text(DriverVehicleCopy.reviewHint),
                      ],
                    ),
                  ),
                ),
              SizedBox(height: 16.r),
              FilledButton(
                onPressed: _busy ? null : () => _edit(),
                child: const Text(DriverVehicleCopy.addVehicle),
              ),
            ],
          ),
        );
      },
    ),
  );
}

class _VehicleEditor extends StatefulWidget {
  final UserAppRepository repository;
  final List<Map<String, dynamic>> categories;
  final Map<String, dynamic>? vehicle;
  const _VehicleEditor({
    required this.repository,
    required this.categories,
    this.vehicle,
  });
  @override
  State<_VehicleEditor> createState() => _VehicleEditorState();
}

class _VehicleEditorState extends State<_VehicleEditor> {
  final _form = GlobalKey<FormState>();
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _plate = TextEditingController();
  final _color = TextEditingController();
  final _capacity = TextEditingController();
  String? _categoryId;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final currentId = widget.vehicle?['vehicle_category_id'];
    if (widget.categories.any((category) => category['id'] == currentId)) {
      _categoryId = currentId as String?;
    }
  }

  @override
  void dispose() {
    for (final controller in [_make, _model, _plate, _color, _capacity]) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (widget.vehicle != null) {
        await widget.repository.changeVehicleCategory(
          '${widget.vehicle!['id']}',
          _categoryId!,
        );
      } else {
        final category = widget.categories.firstWhere(
          (value) => value['id'] == _categoryId,
        );
        await widget.repository.registerVehicle({
          'vehicle_category_id': _categoryId,
          'make': _make.text.trim(),
          'model': _model.text.trim(),
          'plate_number': _plate.text.trim(),
          'color': _color.text.trim(),
          'capacity': int.tryParse(_capacity.text) ?? category['capacity'],
        });
      }
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _input(
    TextEditingController controller,
    String label, {
    int minimum = 1,
    int maximum = 80,
    bool optional = false,
  }) => Padding(
    padding: EdgeInsets.only(top: 14.r),
    child: TextFormField(
      controller: controller,
      enabled: !_saving,
      maxLength: maximum,
      decoration: InputDecoration(labelText: label, counterText: ''),
      validator: (value) => !optional && (value?.trim().length ?? 0) < minimum
          ? DriverVehicleCopy.required
          : null,
    ),
  );

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_saving,
    child: AlertDialog(
      title: Text(
        widget.vehicle == null
            ? DriverVehicleCopy.addVehicle
            : DriverVehicleCopy.changeCategory,
      ),
      content: SingleChildScrollView(
        child: Form(
          key: _form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                DriverVehicleCopy.categoryHint,
                style: TextStyle(
                  fontSize: 12.r,
                  color: AppColors.textSecondary,
                ),
              ),
              SizedBox(height: 14.r),
              DropdownButtonFormField<String>(
                initialValue: _categoryId,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: DriverVehicleCopy.category,
                ),
                items: widget.categories
                    .map(
                      (category) => DropdownMenuItem(
                        value: '${category['id']}',
                        child: Text(
                          category['parent_name'] == null
                              ? '${category['name']}'
                              : '${category['parent_name']} / ${category['name']}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: _saving
                    ? null
                    : (value) => setState(() => _categoryId = value),
                validator: (value) =>
                    value == null ? DriverVehicleCopy.required : null,
              ),
              if (widget.vehicle == null) ...[
                _input(_make, DriverVehicleCopy.make),
                _input(_model, DriverVehicleCopy.model),
                _input(
                  _plate,
                  DriverVehicleCopy.plate,
                  minimum: 3,
                  maximum: 30,
                ),
                _input(
                  _color,
                  DriverVehicleCopy.color,
                  optional: true,
                  maximum: 40,
                ),
                SizedBox(height: 14.r),
                TextFormField(
                  controller: _capacity,
                  enabled: !_saving,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: DriverVehicleCopy.seats,
                    helperText: DriverVehicleCopy.capacityHint,
                    helperMaxLines: 2,
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) return null;
                    final seats = int.tryParse(value.trim());
                    if (seats == null || seats < 1 || seats > 8) {
                      return DriverVehicleCopy.validSeats;
                    }
                    final minimum =
                        widget.categories.firstWhere(
                              (category) => category['id'] == _categoryId,
                              orElse: () => <String, dynamic>{'capacity': 1},
                            )['capacity']
                            as num;
                    return seats < minimum
                        ? DriverVehicleCopy.capacityHint
                        : null;
                  },
                ),
              ],
              if (_error != null)
                Padding(
                  padding: EdgeInsets.only(top: 12.r),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: AppColors.googleRed),
                  ),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _saving ? null : () => Navigator.pop(context),
          child: const Text(UserAppCopy.CANCEL),
        ),
        FilledButton(
          onPressed: _saving ? null : _save,
          child: _saving
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text(UserAppCopy.SAVE_CHANGES),
        ),
      ],
    ),
  );
}

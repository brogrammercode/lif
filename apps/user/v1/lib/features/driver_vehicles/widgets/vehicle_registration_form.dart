import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_vehicles/vehicle_draft.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/driver_vehicles/widgets/catalog_selector.dart';
import 'package:user/features/partner_program/widgets/partner_upload_tile.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class VehicleRegistrationForm extends StatefulWidget {
  final Map<String, dynamic>? vehicle;
  final Future<void> Function() onSaved;
  final VehicleVerificationRepository? repository;
  final Future<List<Map<String, dynamic>>> Function()? loadCategories;
  const VehicleRegistrationForm({
    super.key,
    this.vehicle,
    required this.onSaved,
    this.repository,
    this.loadCategories,
  });
  @override
  State<VehicleRegistrationForm> createState() =>
      _VehicleRegistrationFormState();
}

class _VehicleRegistrationFormState extends State<VehicleRegistrationForm> {
  late final _repo = widget.repository ?? VehicleVerificationRepository();
  Map<String, dynamic>? _vehicle;
  final _form = GlobalKey<FormState>();
  final _plate = TextEditingController();
  final _color = TextEditingController();
  final _storage = const FlutterSecureStorage();
  final _documents = <String, String>{};
  final _local = <String, Uint8List>{};
  final _paths = <String, String>{};
  final _names = <String, String>{};
  final _obsoleteUploads = <String>{};
  Map<String, dynamic>? _brand;
  Map<String, dynamic>? _model;
  List<Map<String, dynamic>> _categories = [];
  String? _categoryId;
  String? _draftKey;
  String _registrationKey = VehicleVerificationRepository.registrationKey();
  String? _pendingCapture;
  String? _error;
  String? _progress;
  bool _loading = true;
  bool _busy = false;
  bool _submitted = false;
  bool _needsReload = false;
  bool _loadFailed = false;
  bool _disposed = false;
  Timer? _draftTimer;
  Future<void> _draftWrites = Future<void>.value();
  int _version = 0;
  Map<String, dynamic>? _field(String key) => vehicleMaps(
    _vehicle?['verification_fields'],
  ).where((f) => f['key'] == key).firstOrNull;
  bool _locked(String key) => _field(key)?['status'] == 'APPROVED';
  @override
  void initState() {
    super.initState();
    _vehicle = widget.vehicle;
    _load();
  }

  @override
  void dispose() {
    _draftTimer?.cancel();
    if (!_loading && !_loadFailed && !_submitted && _draftKey != null) {
      unawaited(_saveDraft().catchError((Object _) {}));
    }
    _disposed = true;
    _plate.dispose();
    _color.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
      _loadFailed = false;
    });
    try {
      final results = await Future.wait<Object>([
        _repo.mine(),
        (widget.loadCategories ?? UserAppRepository().vehicleCategories)(),
      ]);
      if (!mounted) return;
      final registration = results[0] as Map<String, dynamic>;
      final categories = results[1] as List<Map<String, dynamic>>;
      final vehicles = vehicleMaps(registration['vehicles']);
      final requestedId = widget.vehicle?['id'];
      _vehicle = requestedId == null
          ? null
          : vehicles.where((v) => v['id'] == requestedId).firstOrNull;
      if (requestedId != null && _vehicle == null) {
        throw StateError('This vehicle is unavailable. Reload your vehicles.');
      }
      final vehicle = _vehicle;
      _draftKey =
          'vehicle_registration_${(registration['user'] as Map)['id']}_${requestedId ?? 'new'}';
      _documents.clear();
      _paths.clear();
      _names.clear();
      _local.clear();
      _obsoleteUploads.clear();
      _categories = categories
          .where((c) => c['is_selectable'] == true)
          .toList();
      if (vehicle != null) {
        _brand = vehicle['brand'] is Map
            ? Map<String, dynamic>.from(vehicle['brand'] as Map)
            : null;
        _model = vehicle['catalog_model'] is Map
            ? Map<String, dynamic>.from(vehicle['catalog_model'] as Map)
            : null;
        _categoryId = vehicle['vehicle_category_id'] as String?;
        _plate.text = '${vehicle['plate_number']}';
        _color.text = '${vehicle['color'] ?? ''}';
        _version = (vehicle['verification_version'] as num?)?.toInt() ?? 0;
        _registrationKey =
            vehicle['registration_key'] as String? ?? _registrationKey;
        for (final field in vehicleMaps(vehicle['verification_fields'])) {
          if (vehicleDocuments.containsKey(field['key'])) {
            _documents['${field['key']}'] = '${field['value']}';
          }
        }
      }
      final saved = await _storage.read(key: _draftKey!);
      if (!mounted) return;
      if (saved != null) {
        Map<String, dynamic>? draft;
        try {
          draft = decodeVehicleDraft(saved);
        } catch (_) {
          await _storage.delete(key: _draftKey!);
        }
        if (!mounted) return;
        if (draft != null &&
            requestedId == null &&
            vehicles.any(
              (v) => v['registration_key'] == draft!['registration_key'],
            )) {
          _submitted = true;
          await _storage.delete(key: _draftKey!);
          if (mounted) await widget.onSaved();
          return;
        }
        if (draft != null) {
          if (draft['version'] == _version) {
            _brand = draft['brand'] is Map
                ? Map<String, dynamic>.from(draft['brand'] as Map)
                : _brand;
            _model = draft['model'] is Map
                ? Map<String, dynamic>.from(draft['model'] as Map)
                : _model;
            _categoryId = draft['category_id'] as String?;
            _plate.text = '${draft['plate'] ?? ''}';
            _color.text = '${draft['color'] ?? ''}';
            _registrationKey = '${draft['registration_key']}';
            _documents
              ..clear()
              ..addAll(
                reusableVehicleDocuments(
                  Map<String, String>.from(draft['documents'] as Map),
                  _fieldList,
                  vehicleMaps(registration['pending_assets']),
                ),
              );
            _paths.addAll(
              Map<String, String>.from(draft['paths'] as Map? ?? {}),
            );
            _names.addAll(
              Map<String, String>.from(draft['names'] as Map? ?? {}),
            );
            // Reviews and catalog edits are authoritative even when the saved
            // draft shares this vehicle version.
            if (_locked('brand_id') ||
                _brand?['id'] == (vehicle?['brand'] as Map?)?['id']) {
              _brand = vehicle?['brand'] is Map
                  ? Map<String, dynamic>.from(vehicle!['brand'] as Map)
                  : _brand;
            }
            if (_locked('model_id') ||
                _model?['id'] == (vehicle?['catalog_model'] as Map?)?['id']) {
              _model = vehicle?['catalog_model'] is Map
                  ? Map<String, dynamic>.from(vehicle!['catalog_model'] as Map)
                  : _model;
            }
            if (_locked('vehicle_category_id')) {
              _categoryId = vehicle?['vehicle_category_id'] as String?;
            }
            if (_locked('plate_number')) {
              _plate.text = '${vehicle?['plate_number'] ?? ''}';
            }
            if (_locked('color')) _color.text = '${vehicle?['color'] ?? ''}';
            _paths.removeWhere((key, _) => _locked(key));
            _names.removeWhere((key, _) => _locked(key));
            _pendingCapture = draft['pending_capture'] as String?;
            _obsoleteUploads.addAll(
              List<String>.from(draft['obsolete_uploads'] as List? ?? []),
            );
            if (_pendingCapture != null && _locked(_pendingCapture!)) {
              _pendingCapture = null;
            }
            for (final entry in _paths.entries) {
              final file = File(entry.value);
              if (await file.exists() && await file.length() <= 3000000) {
                final bytes = await file.readAsBytes();
                if (!mounted) return;
                _local[entry.key] = bytes;
              }
            }
          } else {
            await _storage.delete(key: _draftKey!);
          }
        }
      }
      if (Platform.isAndroid && _pendingCapture != null) {
        final recovered = await ImagePicker().retrieveLostData();
        if (!mounted) return;
        if (recovered.exception != null) throw recovered.exception!;
        if (recovered.files?.firstOrNull case final XFile file) {
          await _useImage(_pendingCapture!, file);
        }
        _pendingCapture = null;
        await _saveDraft();
      }
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = ApiResult.errorMessage(error);
          _loadFailed = true;
        });
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> get _fieldList =>
      vehicleMaps(_vehicle?['verification_fields']);

  Future<void> _saveDraft() async {
    if (_draftKey == null || _disposed) return;
    final key = _draftKey!;
    final value = jsonEncode({
      'version': _version,
      'brand': _brand,
      'model': _model,
      'category_id': _categoryId,
      'plate': _plate.text,
      'color': _color.text,
      'registration_key': _registrationKey,
      'documents': _documents,
      'paths': _paths,
      'names': _names,
      'pending_capture': _pendingCapture,
      'obsolete_uploads': _obsoleteUploads.toList(),
    });
    final write = _draftWrites
        .catchError((Object _) {})
        .then((_) => _storage.write(key: key, value: value));
    _draftWrites = write;
    await write;
  }

  void _scheduleDraft() {
    _draftTimer?.cancel();
    _draftTimer = Timer(const Duration(milliseconds: 300), () async {
      try {
        await _saveDraft();
      } catch (error) {
        if (mounted) setState(() => _error = ApiResult.errorMessage(error));
      }
    });
  }

  Future<void> _useImage(String key, XFile file) async {
    if (await file.length() > 3000000) {
      throw StateError('Choose an image up to 3 MB.');
    }
    final bytes = await file.readAsBytes();
    if (!mounted) return;
    VehicleVerificationRepository.imagePayload(file.name, bytes);
    _discardPendingImage(key);
    if (!mounted) return;
    _local[key] = bytes;
    _paths[key] = file.path;
    _names[key] = file.name;
    _documents.remove(key);
  }

  void _discardPendingImage(String key) {
    final id = _documents[key];
    if (id != null &&
        !_fieldList.any(
          (field) => field['key'] == key && field['value'] == id,
        )) {
      _obsoleteUploads.add(id);
    }
  }

  Future<void> _removeImage(String key) async {
    if (_busy || _locked(key)) return;
    setState(() => _busy = true);
    try {
      _discardPendingImage(key);
      if (!mounted) return;
      setState(() {
        _documents.remove(key);
        _local.remove(key);
        _paths.remove(key);
        _names.remove(key);
      });
      await _saveDraft();
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pick(String key) async {
    if (_busy || _locked(key)) return;
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take photo'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose image'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null || !mounted) return;
    setState(() => _busy = true);
    try {
      _pendingCapture = key;
      await _saveDraft();
      if (!mounted) return;
      final file = await ImagePicker().pickImage(
        source: source,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 80,
        requestFullMetadata: false,
      );
      if (!mounted) return;
      if (file != null) await _useImage(key, file);
      _pendingCapture = null;
      await _saveDraft();
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _preview(String key) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final bytes = _local[key] ?? await _repo.image(_documents[key]!);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => Dialog(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Padding(
                padding: const EdgeInsets.all(12),
                child: Text(vehicleDocuments[key]!),
              ),
              Flexible(
                child: InteractiveViewer(
                  child: Image(
                    image: PartnerUploadTile.previewImage(bytes),
                    fit: BoxFit.contain,
                  ),
                ),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Done'),
              ),
            ],
          ),
        ),
      );
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _choose(bool model) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final result = await Navigator.push<Map<String, dynamic>>(
        context,
        MaterialPageRoute(
          builder: (_) => CatalogSelector(brand: model ? _brand : null),
        ),
      );
      if (result == null || !mounted) return;
      setState(() {
        if (model) {
          _model = result;
          if (!_locked('vehicle_category_id')) _categoryId = null;
        } else {
          _brand = result;
          _model = null;
          if (!_locked('vehicle_category_id')) _categoryId = null;
        }
      });
      await _saveDraft();
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_busy || _needsReload || !_form.currentState!.validate()) return;
    if (vehicleDocuments.keys.any(
      (key) => !_local.containsKey(key) && !_documents.containsKey(key),
    )) {
      setState(
        () => _error = 'Add all six required vehicle and document images.',
      );
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _saveDraft();
      if (!mounted) return;
      for (final id in _obsoleteUploads.toList()) {
        await _repo.discardUpload(id);
        if (!mounted) return;
        _obsoleteUploads.remove(id);
        await _saveDraft();
      }
      var done = 0;
      final total = vehicleDocuments.keys
          .where((key) => !_documents.containsKey(key))
          .length;
      for (final key in vehicleDocuments.keys) {
        if (!_documents.containsKey(key)) {
          if (mounted) {
            setState(
              () => _progress =
                  'Uploading ${vehicleDocuments[key]} (${++done} of $total)',
            );
          }
          final asset = await _repo.upload(key, _names[key]!, _local[key]!);
          if (!mounted) return;
          _documents[key] = '${asset['id']}';
          await _saveDraft();
        }
      }
      if (!mounted) return;
      if (mounted) setState(() => _progress = 'Submitting vehicle for review');
      await _repo.submit({
        'registration_key': _registrationKey,
        if (_vehicle != null) 'expected_version': _version,
        'brand_id': _brand!['id'],
        'model_id': _model!['id'],
        'vehicle_category_id': _categoryId,
        'plate_number': _plate.text.trim().toUpperCase(),
        'color': _color.text.trim(),
        'documents': _documents,
      }, id: _vehicle?['id'] as String?);
      _submitted = true;
      _draftTimer?.cancel();
      // A failed local cleanup must not turn a committed registration into a failed submission.
      try {
        await _draftWrites;
        await _storage.delete(key: _draftKey!);
      } catch (_) {}
      if (mounted) await widget.onSaved();
    } catch (error) {
      if (mounted) {
        setState(() {
          _error = ApiResult.errorMessage(error);
          final code = error is DioException && error.response?.data is Map
              ? (error.response!.data as Map)['error_code']
              : null;
          _needsReload = [
            'VEHICLE_VERIFICATION_CONFLICT',
            'VEHICLE_FIELD_LOCKED',
            'VEHICLE_LOCKED',
          ].contains(code);
          if (code == 'VEHICLE_ASSET_INVALID') {
            _documents.removeWhere(
              (key, id) => !_fieldList.any(
                (field) => field['key'] == key && field['value'] == id,
              ),
            );
            _error =
                '${_error!} Submit again to refresh pending uploads, or replace any missing images.';
          }
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _progress = null;
        });
      }
    }
  }

  Future<void> _reloadLatest() async {
    if (_busy) return;
    _submitted = true;
    _draftTimer?.cancel();
    try {
      await _draftWrites;
      if (_draftKey != null) await _storage.delete(key: _draftKey!);
    } catch (_) {}
    if (mounted) await widget.onSaved();
  }

  Widget _reviewNote(String key) {
    final field = _field(key);
    if (field == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 6, bottom: 12),
      child: Text(
        '${field['status']}${field['rejection_reason'] == null ? '' : ': ${field['rejection_reason']}'}',
        style: TextStyle(
          fontSize: 12,
          color: field['status'] == 'REJECTED'
              ? AppColors.googleRed
              : AppColors.textSecondary,
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> children) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 16),
          ...children,
        ],
      ),
    ),
  );
  Widget _catalog(bool model) {
    final key = model ? 'model_id' : 'brand_id';
    final selected = model ? _model : _brand;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FormField<String>(
          initialValue: selected?['id'] as String?,
          key: ValueKey('$key:${selected?['id']}'),
          validator: (_) =>
              selected == null ? 'Select a ${model ? 'model' : 'brand'}' : null,
          builder: (state) => Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              OutlinedButton(
                onPressed:
                    _busy ||
                        _locked(key) ||
                        (model && _brand == null) ||
                        (!model && _locked('model_id'))
                    ? null
                    : () => _choose(model),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        selected == null
                            ? 'Select ${model ? 'model' : 'brand'}'
                            : '${selected['name']}',
                      ),
                    ),
                    const Icon(Icons.expand_more),
                  ],
                ),
              ),
              if (state.hasError)
                Text(
                  state.errorText!,
                  style: const TextStyle(color: AppColors.googleRed),
                ),
            ],
          ),
        ),
        if (selected?['status'] == 'REQUESTED')
          const Text(
            'Your suggestion is awaiting catalog verification.',
            style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
          ),
        _reviewNote(key),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primaryGreen),
      );
    }
    if (_loadFailed || _categories.isEmpty) {
      return AppLoadError(
        message:
            _error ??
            'No vehicle categories are available. Please contact your administrator.',
        onRetry: _load,
      );
    }
    final categories = _categories
        .where(
          (c) =>
              _model != null &&
              c['vehicle_type'] == _model!['vehicle_type'] &&
              (c['capacity'] as num) <=
                  (_model!['seating_capacity'] as num? ?? 0),
        )
        .toList();
    final selectedCategory = categories.any((c) => c['id'] == _categoryId)
        ? _categoryId
        : null;
    return PopScope(
      canPop: !_busy,
      child: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 24),
          children: [
            const Text(
              'Register your vehicle',
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            const Text(
              'Choose one compatible category and add clear document images. You can register more vehicles later.',
              style: TextStyle(color: AppColors.textSecondary, height: 1.5),
            ),
            const SizedBox(height: 20),
            _section('Vehicle details', [
              _catalog(false),
              _catalog(true),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                key: ValueKey('category:$_categoryId:${_model?['id']}'),
                initialValue: selectedCategory,
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Vehicle category',
                ),
                items: categories
                    .map(
                      (c) => DropdownMenuItem<String>(
                        value: '${c['id']}',
                        child: Text(
                          c['parent_name'] == null
                              ? '${c['name']}'
                              : '${c['parent_name']} / ${c['name']}',
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: _busy || _locked('vehicle_category_id')
                    ? null
                    : (v) => setState(() {
                        _categoryId = v;
                        _scheduleDraft();
                      }),
                validator: (v) =>
                    v == null ? 'Select a compatible category' : null,
              ),
              if (_model != null && categories.isEmpty)
                const Text(
                  'No compatible category is configured for this model. Contact your administrator.',
                  style: TextStyle(color: AppColors.googleRed),
                ),
              _reviewNote('vehicle_category_id'),
              const SizedBox(height: 12),
              TextFormField(
                controller: _plate,
                enabled: !_busy && !_locked('plate_number'),
                textCapitalization: TextCapitalization.characters,
                maxLength: 30,
                decoration: const InputDecoration(
                  labelText: 'Registration number',
                  counterText: '',
                ),
                onChanged: (_) => _scheduleDraft(),
                validator: (v) =>
                    RegExp(r'^[A-Z0-9]{3,20}$').hasMatch(
                      (v ?? '').replaceAll(RegExp(r'[\s-]+'), '').toUpperCase(),
                    )
                    ? null
                    : 'Enter a valid registration number',
              ),
              _reviewNote('plate_number'),
              const SizedBox(height: 12),
              TextFormField(
                controller: _color,
                enabled: !_busy && !_locked('color'),
                maxLength: 40,
                decoration: const InputDecoration(
                  labelText: 'Color',
                  counterText: '',
                ),
                onChanged: (_) => _scheduleDraft(),
                validator: (v) => (v?.trim().isEmpty ?? true)
                    ? 'Enter the vehicle color'
                    : null,
              ),
              _reviewNote('color'),
            ]),
            _section('Photos and documents', [
              for (final entry in vehicleDocuments.entries) ...[
                Text(
                  entry.value,
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 8),
                PartnerUploadTile(
                  files: [
                    if (_local.containsKey(entry.key) ||
                        _documents.containsKey(entry.key))
                      PartnerUploadFile(
                        name: _names[entry.key] ?? '${entry.value}.webp',
                        bytes: _local[entry.key],
                        onOpen: () => _preview(entry.key),
                        onRemove: _locked(entry.key)
                            ? null
                            : () => _removeImage(entry.key),
                      ),
                  ],
                  image: true,
                  camera: false,
                  busy: _busy,
                  onChoose: _locked(entry.key) ? null : () => _pick(entry.key),
                  limitText:
                      'Camera or gallery · up to 3 MB. Uploaded on submission.',
                ),
                _reviewNote(entry.key),
                const SizedBox(height: 16),
              ],
            ]),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppColors.googleRed),
                ),
              ),
            if (_progress != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  _progress!,
                  style: const TextStyle(color: AppColors.textSecondary),
                ),
              ),
            if (_needsReload)
              OutlinedButton(
                onPressed: _busy ? null : _reloadLatest,
                child: const Text('Reload latest vehicle'),
              ),
            AppButton(
              text: _vehicle == null
                  ? 'Submit vehicle for verification'
                  : 'Submit corrections',
              isLoading: _busy,
              onPressed: _busy || _needsReload ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}

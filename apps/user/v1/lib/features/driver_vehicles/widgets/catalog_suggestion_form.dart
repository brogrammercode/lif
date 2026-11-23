import 'package:user/features/driver_vehicles/controllers/catalog_suggestion_controller.dart';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/solid_file_upload.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

class CatalogSuggestionForm extends StatefulWidget {
  final Map<String, dynamic>? brand;
  final Map<String, dynamic>? initial;
  const CatalogSuggestionForm({super.key, this.brand, this.initial});
  @override
  State<CatalogSuggestionForm> createState() => _CatalogSuggestionFormState();
}

class _CatalogSuggestionFormState extends State<CatalogSuggestionForm> {
  late final _controller = CatalogSuggestionController()
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  final _form = GlobalKey<FormState>();
  final _controllers = {
    for (final key in [
      'name',
      'description',
      'country',
      'website_url',
      'seating_capacity',
      'year_from',
      'year_to',
    ])
      key: TextEditingController(),
  };
  String get _type => _controller.type;
  set _type(String value) => _controller.type = value;
  String get _fuel => _controller.fuel;
  set _fuel(String value) => _controller.fuel = value;
  Uint8List? get _logo => _controller.logo;
  set _logo(Uint8List? value) => _controller.logo = value;
  String get _logoName => _controller.logoName;
  set _logoName(String value) => _controller.logoName = value;
  String? get _error => _controller.error;
  set _error(String? value) => _controller.error = value;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool get _model => widget.brand != null;
  @override
  void initState() {
    super.initState();
    final row = widget.initial;
    if (row != null) {
      for (final e in _controllers.entries) {
        e.value.text = '${row[e.key] ?? ''}';
      }
      _type = '${row['vehicle_type'] ?? 'BIKE'}';
      _fuel = '${row['fuel_type'] ?? 'PETROL'}';
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pick() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 80,
        requestFullMetadata: false,
      );
      if (file == null) return;
      if (await file.length() > 3000000) {
        throw StateError('Choose an image up to 3 MB.');
      }
      final bytes = await file.readAsBytes();
      VehicleVerificationRepository.imagePayload(file.name, bytes);
      if (mounted) {
        setState(() {
          _logo = bytes;
          _logoName = file.name;
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final input = <String, dynamic>{
        'name': _controllers['name']!.text.trim(),
        'description': _controllers['description']!.text.trim(),
        if (widget.initial != null)
          'expected_updated_at': widget.initial!['updated_at'],
        if (widget.initial?['logo_url'] != null && _logo == null)
          'logo_url': widget.initial!['logo_url'],
        if (_logo != null)
          'image_upload': VehicleVerificationRepository.imagePayload(
            _logoName,
            _logo!,
          ),
      };
      if (_model) {
        input.addAll({
          'brand_id': widget.brand!['id'],
          'vehicle_type': _type,
          'fuel_type': _fuel,
          'seating_capacity': int.parse(
            _controllers['seating_capacity']!.text.trim(),
          ),
          'year_from': int.tryParse(_controllers['year_from']!.text.trim()),
          'year_to': int.tryParse(_controllers['year_to']!.text.trim()),
        });
      } else {
        input.addAll({
          'country': _controllers['country']!.text.trim(),
          'website_url': _controllers['website_url']!.text.trim().isEmpty
              ? null
              : _controllers['website_url']!.text.trim(),
        });
      }
      final result = widget.initial != null
          ? await VehicleVerificationRepository().correctCatalog(
              _model,
              '${widget.initial!['id']}',
              input,
            )
          : await VehicleVerificationRepository().requestCatalog(_model, input);
      if (mounted) Navigator.pop(context, result);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _input(
    String key,
    String label, {
    bool required = false,
    int max = 100,
    bool number = false,
    int lines = 1,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: SolidTextFormField(
      controller: _controllers[key],
      label: label,
      enabled: !_busy,
      keyboardType: number ? TextInputType.number : TextInputType.text,
      maxLength: max,
      minLines: lines == 1 ? null : lines,
      maxLines: lines,
      validator: (value) {
        final text = value?.trim() ?? '';
        if (required && text.isEmpty) return 'This field is required';
        if (number && text.isNotEmpty) {
          final n = int.tryParse(text);
          if (n == null ||
              (key == 'seating_capacity'
                  ? n < 1 || n > 8
                  : n < 1900 || n > 2050)) {
            return key == 'seating_capacity'
                ? 'Enter 1 to 8 passenger seats'
                : 'Enter a year from 1900 to 2050';
          }
          if (key == 'year_to' &&
              n < (int.tryParse(_controllers['year_from']!.text) ?? 1900)) {
            return 'Must be after the first model year';
          }
        }
        if (key == 'website_url' && text.isNotEmpty) {
          final uri = Uri.tryParse(text);
          if (uri == null || uri.scheme != 'https' || uri.host.isEmpty) {
            return 'Enter an https:// website';
          }
        }
        return null;
      },
    ),
  );

  Widget _brandAvatar() {
    final brandLogo = '${widget.brand?['logo_url'] ?? ''}'.trim();
    final initialLogo = '${widget.initial?['logo_url'] ?? ''}'.trim();
    final logo = brandLogo.isNotEmpty ? brandLogo : initialLogo;
    return Center(
      child: SizedBox(
        width: 98,
        height: 98,
        child: Stack(
          children: [
            Container(
              width: 90,
              height: 90,
              padding: const EdgeInsets.all(17),
              decoration: BoxDecoration(
                color: Colors.white,
                shape: BoxShape.circle,
                border: Border.all(color: RideTokens.line),
              ),
              clipBehavior: Clip.antiAlias,
              child: _logo != null
                  ? Image.memory(_logo!, fit: BoxFit.contain)
                  : logo.isNotEmpty
                  ? Image.network(
                      logo,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) =>
                          const Icon(Icons.directions_car_outlined, size: 34),
                    )
                  : const Icon(Icons.directions_car_outlined, size: 34),
            ),
            Positioned(
              right: 0,
              bottom: 1,
              child: Material(
                color: Colors.white,
                shape: const CircleBorder(),
                child: IconButton(
                  tooltip: 'Choose logo',
                  onPressed: _busy ? null : _pick,
                  constraints: const BoxConstraints.tightFor(
                    width: 34,
                    height: 34,
                  ),
                  padding: EdgeInsets.zero,
                  icon: const Icon(Icons.camera_alt_outlined, size: 18),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AppPage(
      title: widget.initial == null
          ? 'Suggest ${_model ? 'Model' : 'Brand'}'
          : 'Edit Suggestion',
      child: Form(
        key: _form,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(top: 18, bottom: 18),
                children: [
                  _brandAvatar(),
                  const SizedBox(height: 18),
                  if (_model) ...[
                    Text(
                      'Model for ${widget.brand!['name']}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w500,
                        color: RideTokens.ink,
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],
                  _input(
                    'name',
                    _model ? 'Model name' : 'Brand name',
                    required: true,
                  ),
                  _input('description', 'Description', max: 1000, lines: 3),
                  if (!_model) ...[
                    _input('country', 'Country', max: 80),
                    _input('website_url', 'Website (optional)', max: 2000),
                  ],
                  if (_model) ...[
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: SolidDropdownFormField<String>(
                        initialValue: _type,
                        label: 'Vehicle type',
                        items: ['BIKE', 'SCOOTER', 'AUTO', 'SEDAN', 'SUV']
                            .map(
                              (value) => DropdownMenuItem(
                                value: value,
                                child: Text(
                                  value == 'SUV'
                                      ? value
                                      : '${value[0]}${value.substring(1).toLowerCase()}',
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: _busy
                            ? null
                            : (value) => setState(() => _type = value!),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: SolidDropdownFormField<String>(
                        initialValue: _fuel,
                        label: 'Fuel type',
                        items:
                            [
                                  'PETROL',
                                  'DIESEL',
                                  'CNG',
                                  'ELECTRIC',
                                  'HYBRID',
                                  'OTHER',
                                ]
                                .map(
                                  (value) => DropdownMenuItem(
                                    value: value,
                                    child: Text(
                                      value == 'CNG'
                                          ? value
                                          : '${value[0]}${value.substring(1).toLowerCase()}',
                                    ),
                                  ),
                                )
                                .toList(),
                        onChanged: _busy
                            ? null
                            : (value) => setState(() => _fuel = value!),
                      ),
                    ),
                    _input(
                      'seating_capacity',
                      'Passenger seats',
                      required: true,
                      number: true,
                      max: 1,
                    ),
                    _input(
                      'year_from',
                      'First model year (optional)',
                      number: true,
                      max: 4,
                    ),
                    _input(
                      'year_to',
                      'Last model year (optional)',
                      number: true,
                      max: 4,
                    ),
                  ],
                  const Padding(
                    padding: EdgeInsets.only(bottom: 8),
                    child: Text(
                      'Logo (optional)',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: RideTokens.ink,
                      ),
                    ),
                  ),
                  SolidFileUpload(
                    files: [
                      if (_logo != null)
                        SolidUploadFile(
                          name: _logoName,
                          bytes: _logo,
                          onRemove: () => setState(() => _logo = null),
                        ),
                    ],
                    image: true,
                    camera: false,
                    busy: _busy,
                    onChoose: _pick,
                    limitText:
                        'Supported files: JPEG, PNG, or WebP · Max file size: 3 MB',
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        _error!,
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFFB3261E),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(0, 8, 0, 12),
                child: SizedBox(
                  width: double.infinity,
                  height: 60,
                  child: SolidButton(
                    text: _busy
                        ? 'Submitting suggestion'
                        : widget.initial == null
                        ? 'Submit suggestion'
                        : 'Save changes',
                    busy: _busy,
                    onPressed: _busy ? null : _submit,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/core/color.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';
import 'package:user/features/partner_program/widgets/partner_upload_tile.dart';

class CatalogSuggestionForm extends StatefulWidget {
  final Map<String, dynamic>? brand;
  const CatalogSuggestionForm({super.key, this.brand});
  @override
  State<CatalogSuggestionForm> createState() => _CatalogSuggestionFormState();
}

class _CatalogSuggestionFormState extends State<CatalogSuggestionForm> {
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
  String _type = 'BIKE';
  String _fuel = 'PETROL';
  Uint8List? _logo;
  String _logoName = 'logo.jpg';
  String? _error;
  bool _busy = false;
  bool get _model => widget.brand != null;
  @override
  void dispose() {
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
      final result = await VehicleVerificationRepository().requestCatalog(
        _model,
        input,
      );
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
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: TextFormField(
      controller: _controllers[key],
      enabled: !_busy,
      keyboardType: number ? TextInputType.number : TextInputType.text,
      maxLength: max,
      decoration: InputDecoration(labelText: label, counterText: ''),
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
  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AppPage(
      title: 'Suggest ${_model ? 'model' : 'brand'}',
      child: Form(
        key: _form,
        child: ListView(
          children: [
            const Text(
              'Your suggestion can be used in this registration while the admin reviews it. It remains Requested until approved.',
            ),
            const SizedBox(height: 20),
            if (_model) ...[
              Text('Brand: ${widget.brand!['name']}'),
              const SizedBox(height: 16),
            ],
            _input('name', 'Name', required: true),
            _input('description', 'Description', max: 1000),
            if (!_model) ...[
              _input('country', 'Country', max: 80),
              _input('website_url', 'Website (optional)', max: 2000),
            ],
            if (_model) ...[
              DropdownButtonFormField<String>(
                initialValue: _type,
                decoration: const InputDecoration(labelText: 'Vehicle type'),
                items: ['BIKE', 'SCOOTER', 'AUTO', 'SEDAN', 'SUV']
                    .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                    .toList(),
                onChanged: _busy ? null : (v) => setState(() => _type = v!),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _fuel,
                decoration: const InputDecoration(labelText: 'Fuel type'),
                items:
                    ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID', 'OTHER']
                        .map((v) => DropdownMenuItem(value: v, child: Text(v)))
                        .toList(),
                onChanged: _busy ? null : (v) => setState(() => _fuel = v!),
              ),
              const SizedBox(height: 16),
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
            const Text(
              'Logo (optional)',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            PartnerUploadTile(
              files: [
                if (_logo != null)
                  PartnerUploadFile(
                    name: _logoName,
                    bytes: _logo,
                    onRemove: () => setState(() => _logo = null),
                  ),
              ],
              image: true,
              camera: false,
              busy: _busy,
              onChoose: _pick,
              limitText: 'Image up to 3 MB. Uploaded only when you submit.',
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(
                  _error!,
                  style: const TextStyle(color: AppColors.googleRed),
                ),
              ),
            const SizedBox(height: 20),
            AppButton(
              text: 'Submit suggestion',
              isLoading: _busy,
              onPressed: _busy ? null : _submit,
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    ),
  );
}

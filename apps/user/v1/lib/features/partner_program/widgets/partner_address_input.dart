import 'package:user/features/partner_program/controllers/partner_address_controller.dart';
import 'package:user/components/ui/glass_dropdown.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:flutter/material.dart';
import 'package:user/core/color.dart';

/// Canonical postal selections; the combined requirement remains one answer.
class PartnerAddressInput extends StatefulWidget {
  final TextEditingController controller;
  final String kind;
  final bool enabled;
  final bool required;
  final VoidCallback onChanged;
  final String? linkedState;
  final String? linkedCity;
  const PartnerAddressInput({
    super.key,
    required this.controller,
    required this.kind,
    required this.enabled,
    required this.required,
    required this.onChanged,
    this.linkedState,
    this.linkedCity,
  });
  @override
  State<PartnerAddressInput> createState() => _PartnerAddressInputState();
}

class _PartnerAddressInputState extends State<PartnerAddressInput> {
  late final _controller = PartnerAddressController()
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  List<String> get _states => _controller.states;
  List<String> get _cities => _controller.cities;
  set _cities(List<String> value) => _controller.cities = value;
  List<String> get _pins => _controller.pins;
  set _pins(List<String> value) => _controller.pins = value;
  String? get _state => _controller.state;
  set _state(String? value) => _controller.state = value;
  String? get _city => _controller.city;
  set _city(String? value) => _controller.city = value;
  String? get _pin => _controller.pin;
  set _pin(String? value) => _controller.pin = value;
  String? get _error => _controller.error;
  bool get _loading => _controller.loading;
  @override
  void initState() {
    super.initState();
    final match = RegExp(
      r'^(.*), (.*) - ([1-9]\d{5})$',
    ).firstMatch(widget.controller.text);
    if (match != null && widget.kind == 'ADDRESS') {
      _city = match[1];
      _state = match[2];
      _pin = match[3];
    } else if (widget.kind == 'STATE' && widget.controller.text.isNotEmpty) {
      _state = widget.controller.text;
    } else if (widget.kind == 'CITY' && widget.controller.text.isNotEmpty) {
      _city = widget.controller.text;
    } else if (widget.kind == 'PINCODE' && widget.controller.text.isNotEmpty) {
      _pin = widget.controller.text;
    }
    if (widget.linkedState != null) {
      _state = widget.linkedState!.isEmpty ? null : widget.linkedState;
    }
    if (widget.linkedCity != null) {
      _city = widget.linkedCity!.isEmpty ? null : widget.linkedCity;
    }
    _load();
  }

  Future<void> _load() {
    _controller.linkedState = widget.linkedState;
    _controller.linkedCity = widget.linkedCity;
    return _controller.load();
  }

  void _write() {
    widget.controller.text = switch (widget.kind) {
      'STATE' => _state ?? '',
      'CITY' => _city ?? '',
      'PINCODE' => _pin ?? '',
      _ =>
        _state != null && _city != null && _pin != null
            ? '$_city, $_state - $_pin'
            : '',
    };
    widget.onChanged();
  }

  Widget _select(
    String label,
    List<String> options,
    String? value,
    ValueChanged<String?> changed, {
    bool linked = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: LiquidGlassDropdownFormField<String>(
      key: ValueKey('$label-$value-${options.length}'),
      initialValue: options.contains(value) ? value : null,
      loading: _loading,
      decoration: InputDecoration(
        labelText: label,
        border: GlassTokens.inputBorder,
      ),
      items: options
          .map(
            (item) => DropdownMenuItem(
              value: item,
              child: Text(item, overflow: TextOverflow.ellipsis),
            ),
          )
          .toList(),
      onChanged: widget.enabled && !_loading && options.isNotEmpty && !linked
          ? changed
          : null,
      validator: (value) {
        if (!widget.enabled) return null;
        final hasValue =
            widget.controller.text.isNotEmpty ||
            (widget.kind == 'ADDRESS' &&
                (_state != null || _city != null || _pin != null));
        if (_error != null && (widget.required || hasValue)) {
          return 'Load the address options before submitting.';
        }
        if ((widget.required || hasValue) && value == null) {
          return 'Select $label.';
        }
        return null;
      },
    ),
  );
  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) {
      return Text(
        widget.controller.text.isEmpty
            ? 'Not provided'
            : widget.controller.text,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.controller.text.isNotEmpty && _state == null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Previous value: ${widget.controller.text}. Select from the directory to update it.',
              style: const TextStyle(
                fontSize: 12,
                color: AppColors.textSecondary,
              ),
            ),
          ),
        if (widget.linkedState == '' || widget.linkedCity == '')
          const Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text('Choose the related state and city fields first.'),
          ),
        _select('State / territory', _states, _state, (value) {
          setState(() {
            _state = value;
            _city = null;
            _pin = null;
            _cities = [];
            _pins = [];
          });
          _write();
          _load();
        }, linked: widget.linkedState != null),
        if (widget.kind != 'STATE')
          _select('City / postal district', _cities, _city, (value) {
            setState(() {
              _city = value;
              _pin = null;
              _pins = [];
            });
            _write();
            if (widget.kind != 'CITY') _load();
          }, linked: widget.linkedCity != null || widget.linkedState == ''),
        if (widget.kind == 'ADDRESS' || widget.kind == 'PINCODE')
          _select('PIN code', _pins, _pin, (value) {
            setState(() => _pin = value);
            _write();
          }),
        if (_error != null) ...[
          Text(_error!, style: const TextStyle(color: AppColors.googleRed)),
          TextButton(
            onPressed: _loading
                ? null
                : () {
                    _state = widget.linkedState?.isNotEmpty == true
                        ? widget.linkedState
                        : null;
                    _city = widget.linkedCity?.isNotEmpty == true
                        ? widget.linkedCity
                        : null;
                    _pin = null;
                    _load();
                  },
            child: const Text('Retry address options'),
          ),
        ],
        if (!widget.required && widget.controller.text.isNotEmpty)
          TextButton(
            onPressed: _loading
                ? null
                : () {
                    setState(() {
                      _state = widget.linkedState?.isNotEmpty == true
                          ? widget.linkedState
                          : null;
                      _city = widget.linkedCity?.isNotEmpty == true
                          ? widget.linkedCity
                          : null;
                      _pin = null;
                      widget.controller.clear();
                    });
                    widget.onChanged();
                    _load();
                  },
            child: const Text('Clear optional address'),
          ),
        const Text(
          'Postal directory: GeoNames (CC BY 4.0). City selections use postal districts.',
          style: TextStyle(fontSize: 11, color: AppColors.textTertiary),
        ),
      ],
    );
  }
}

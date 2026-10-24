import 'dart:async';
import 'package:flutter/material.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class SavedPlaceEditor extends StatefulWidget {
  final Map<String, dynamic>? initial;
  final UserAppRepository repository;
  const SavedPlaceEditor({super.key, this.initial, required this.repository});
  @override
  State<SavedPlaceEditor> createState() => _PlaceEditorState();
}

class _PlaceEditorState extends State<SavedPlaceEditor> {
  final _form = GlobalKey<FormState>();
  late final _label = TextEditingController(
    text: '${widget.initial?['label'] ?? ''}',
  );
  late final _address = TextEditingController(
    text: '${widget.initial?['address'] ?? ''}',
  );
  late String _type = '${widget.initial?['place_type'] ?? 'OTHER'}';
  late LatLng? _selected = ridePoint(
    widget.initial?['latitude'],
    widget.initial?['longitude'],
  );
  Timer? _debounce;
  int _generation = 0;
  bool _searching = false;
  String? _error;
  List<Map<String, dynamic>> _results = [];
  void _change(String value) {
    _debounce?.cancel();
    final generation = ++_generation;
    setState(() {
      _selected = null;
      _results = [];
      _error = null;
      _searching = false;
    });
    if (value.trim().length < 3) return;
    _debounce = Timer(
      const Duration(seconds: 3),
      () => _search(value.trim(), generation),
    );
  }

  Future<void> _search(String query, int generation) async {
    if (!mounted || generation != _generation) return;
    setState(() => _searching = true);
    try {
      final results = await widget.repository.searchPlaces(query);
      if (!mounted || generation != _generation) return;
      setState(
        () => _results = results
            .where((v) => ridePoint(v['lat'], v['lon']) != null)
            .toList(),
      );
    } catch (e) {
      if (mounted && generation == _generation) {
        setState(() => _error = ApiResult.errorMessage(e));
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _searching = false);
      }
    }
  }

  @override
  void dispose() {
    _generation++;
    _debounce?.cancel();
    _label.dispose();
    _address.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text(
      widget.initial == null ? 'Add saved place' : 'Edit saved place',
    ),
    content: SingleChildScrollView(
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _label,
              maxLength: 80,
              decoration: const InputDecoration(labelText: 'Label'),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Enter a label' : null,
            ),
            DropdownButtonFormField<String>(
              initialValue: _type,
              decoration: const InputDecoration(labelText: 'Place type'),
              items: const [
                DropdownMenuItem(value: 'HOME', child: Text('Home')),
                DropdownMenuItem(value: 'WORK', child: Text('Work')),
                DropdownMenuItem(value: 'OTHER', child: Text('Other')),
              ],
              onChanged: (v) => setState(() => _type = v!),
            ),
            TextFormField(
              controller: _address,
              maxLength: 300,
              decoration: const InputDecoration(
                labelText: 'Search address',
                helperText:
                    'Pause for 3 seconds, then dismiss the keyboard to see results.',
              ),
              textInputAction: TextInputAction.search,
              onChanged: _change,
              onFieldSubmitted: (_) => FocusScope.of(context).unfocus(),
              validator: (_) => _selected == null
                  ? 'Choose an address from the results'
                  : null,
            ),
            if (_searching) const LinearProgressIndicator(),
            if (_error != null)
              TextButton(
                onPressed: () => _search(_address.text.trim(), _generation),
                child: Text('$_error · Retry'),
              ),
            if (_results.isNotEmpty &&
                MediaQuery.viewInsetsOf(context).bottom == 0)
              SizedBox(
                height: 180,
                width: 320,
                child: ListView.builder(
                  itemCount: _results.length,
                  itemBuilder: (context, index) {
                    final place = _results[index];
                    return ListTile(
                      title: Text(
                        '${place['display_name']}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      onTap: () {
                        _debounce?.cancel();
                        _generation++;
                        final name = '${place['display_name']}'.trim();
                        setState(() {
                          _selected = ridePoint(place['lat'], place['lon']);
                          _address.text = name.length > 300
                              ? name.substring(0, 300)
                              : name;
                          _results = [];
                          _searching = false;
                        });
                        FocusScope.of(context).unfocus();
                      },
                    );
                  },
                ),
              ),
            if (_selected == null && !_searching && _results.isEmpty)
              const Text(
                'Search and select an address to set its coordinates.',
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (!_form.currentState!.validate()) return;
          Navigator.pop(context, {
            'label': _label.text.trim(),
            'address': _address.text.trim(),
            'latitude': _selected!.latitude,
            'longitude': _selected!.longitude,
            'place_type': _type,
          });
        },
        child: const Text('Save place'),
      ),
    ],
  );
}

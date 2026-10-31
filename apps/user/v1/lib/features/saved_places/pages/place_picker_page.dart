import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/components/ui/glass_dropdown.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/places.repo.dart';
import 'package:user/features/saved_places/place_display.dart';
import 'package:user/features/saved_places/widgets/place_components.dart';
import 'package:user/features/saved_places/widgets/place_map.dart';

class PlacePickerPage extends StatefulWidget {
  final PlacesRepository repository;
  final Map<String, dynamic>? initial;
  final Widget Function(PlaceMap)? mapBuilder;
  final Future<XFile?> Function()? selectPhoto;
  const PlacePickerPage({
    super.key,
    required this.repository,
    this.initial,
    this.mapBuilder,
    this.selectPhoto,
  });
  @override
  State<PlacePickerPage> createState() => _PickerState();
}

class _PickerState extends State<PlacePickerPage> {
  final _search = TextEditingController();
  late LatLng? _point = ridePoint(
    widget.initial?['latitude'],
    widget.initial?['longitude'],
  );
  late Map<String, dynamic> _selected = {...?widget.initial};
  final _photos = <XFile>[];
  List<Map<String, dynamic>> _results = [];
  Timer? _searchTimer, _reverseTimer;
  int _searchGeneration = 0, _reverseGeneration = 0;
  bool _searching = false, _resolving = false, _picking = false;
  String? _error;
  @override
  void dispose() {
    _searchTimer?.cancel();
    _reverseTimer?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _find(String value) {
    _searchTimer?.cancel();
    final generation = ++_searchGeneration;
    setState(() {
      _results = [];
      _searching = false;
      _error = null;
    });
    if (value.trim().length < 3) return;
    _searchTimer = Timer(const Duration(seconds: 3), () async {
      if (!mounted) return;
      setState(() => _searching = true);
      try {
        final rows = await widget.repository.search(value.trim());
        if (mounted && generation == _searchGeneration) {
          setState(
            () => _results = rows
                .where((p) => ridePoint(p['lat'], p['lon']) != null)
                .toList(),
          );
        }
      } catch (error) {
        if (mounted && generation == _searchGeneration) {
          setState(() => _error = ApiResult.errorMessage(error));
        }
      } finally {
        if (mounted && generation == _searchGeneration) {
          setState(() => _searching = false);
        }
      }
    });
  }

  void _choose(Map<String, dynamic> place) {
    final point = ridePoint(place['lat'], place['lon']);
    if (point == null) return;
    _searchTimer?.cancel();
    _reverseTimer?.cancel();
    _searchGeneration++;
    _reverseGeneration++;
    final address = '${place['display_name'] ?? ''}';
    setState(() {
      _point = point;
      _selected = {
        ..._selected,
        'name': '${place['name'] ?? address.split(',').first}',
        'address': address,
        'place_type': 'OTHER',
      };
      _results = [];
      _searching = false;
      _resolving = false;
      _error = null;
    });
    FocusScope.of(context).unfocus();
  }

  void _picked(LatLng point) {
    if (_point != null &&
        (point.latitude - _point!.latitude).abs() < .00001 &&
        (point.longitude - _point!.longitude).abs() < .00001) {
      return;
    }
    _reverseTimer?.cancel();
    final generation = ++_reverseGeneration;
    setState(() {
      _point = point;
      _selected = {
        ..._selected,
        'name': 'Selected location',
        'address': '',
        'place_type': _selected['place_type'] ?? 'OTHER',
      };
      _resolving = true;
      _error = null;
    });
    _reverseTimer = Timer(const Duration(milliseconds: 1000), () async {
      try {
        final result = await widget.repository.reverse(
          point.latitude,
          point.longitude,
        );
        if (!mounted || generation != _reverseGeneration) return;
        final address = '${result['display_name'] ?? ''}';
        setState(
          () => _selected = {
            ..._selected,
            'name': '${result['name'] ?? address.split(',').first}',
            'address': address,
          },
        );
      } catch (_) {
        if (mounted && generation == _reverseGeneration) {
          setState(
            () => _error =
                'Address unavailable. You can enter it in the next step.',
          );
        }
      } finally {
        if (mounted && generation == _reverseGeneration) {
          setState(() => _resolving = false);
        }
      }
    });
  }

  Future<void> _photo() async {
    if (_picking || _photos.length >= 3) return;
    setState(() => _picking = true);
    try {
      final photo = widget.selectPhoto != null
          ? await widget.selectPhoto!()
          : await ImagePicker().pickImage(
              source: ImageSource.gallery,
              maxWidth: 1800,
              maxHeight: 1800,
              imageQuality: 85,
              requestFullMetadata: false,
            );
      if (photo == null || !mounted) return;
      if (await photo.length() > 3000000) {
        throw StateError('Choose a photo up to 3 MB.');
      }
      if (mounted) setState(() => _photos.add(photo));
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _continue() async {
    if (_point == null || _resolving) return;
    FocusScope.of(context).unfocus();
    final initial = {
      ..._selected,
      'latitude': _point!.latitude,
      'longitude': _point!.longitude,
    };
    for (final (key, limit) in [('name', 80), ('address', 300)]) {
      final value = '${initial[key] ?? ''}';
      initial[key] = value.length > limit ? value.substring(0, limit) : value;
    }
    if (widget.initial?['version'] != null) {
      initial['id'] = widget.initial!['id'];
      initial['version'] = widget.initial!['version'];
    }
    final id = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FractionallySizedBox(
        heightFactor: .92,
        child: PlaceSaveForm(
          repository: widget.repository,
          initial: initial,
          photos: _photos,
          onDraftChanged: (draft) {
            if (mounted) setState(() => _selected = {..._selected, ...draft});
          },
        ),
      ),
    );
    if (mounted && id != null) Navigator.pop(context, id);
  }

  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: Scaffold(
      resizeToAvoidBottomInset: false,
      body: LiquidGlassBackdrop(
        child: LayoutBuilder(
          builder: (context, bounds) {
            final safe = MediaQuery.paddingOf(context);
            final compact =
                MediaQuery.sizeOf(context).height < 640 ||
                MediaQuery.textScalerOf(context).scale(14) > 20;
            final previewHeight = compact
                ? 360.0
                : math.min(340.0, bounds.maxHeight * .46);
            final map = PlaceMap(
              onPicked: _picked,
              target: _point,
              topInset: compact ? 0 : safe.top + 150,
              bottomInset: compact ? 0 : previewHeight + safe.bottom + 30,
            );
            final header = Column(
              children: [
                Row(
                  children: [
                    LiquidGlassIconButton(
                      icon: Icons.chevron_left,
                      tooltip: 'Back',
                      onPressed: () => Navigator.maybePop(context),
                    ),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'Pick a place',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: GlassTokens.ink,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                LiquidGlassSurface(
                  padding: EdgeInsets.zero,
                  radius: 20,
                  child: TextField(
                    controller: _search,
                    key: const ValueKey('place-picker-search'),
                    onChanged: _find,
                    decoration: const InputDecoration(
                      hintText: 'Search or move the map',
                      prefixIcon: Icon(Icons.search),
                    ),
                    textInputAction: TextInputAction.search,
                    onSubmitted: (_) => FocusScope.of(context).unfocus(),
                  ),
                ),
                if (_searching)
                  const Padding(
                    padding: EdgeInsets.only(top: 10),
                    child: LiquidGlassSurface(
                      child: AppSkeleton(child: SkeletonBox(height: 18)),
                    ),
                  ),
                if (_results.isNotEmpty &&
                    MediaQuery.viewInsetsOf(context).bottom == 0)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: LiquidGlassSurface(
                      padding: EdgeInsets.zero,
                      child: SizedBox(
                        height: math.min(200, bounds.maxHeight * .32),
                        child: ListView(
                          children: [
                            for (final result in _results)
                              ListTile(
                                title: Text(
                                  '${result['display_name']}',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                onTap: () => _choose(result),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            );
            final preview = SizedBox(
              height: previewHeight,
              child: LiquidGlassSurface(
                padding: const EdgeInsets.all(14),
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_photos.isEmpty)
                        PlacePhoto(
                          url: placePhotos(_selected).firstOrNull,
                          height: 110,
                        )
                      else
                        ClipRRect(
                          borderRadius: BorderRadius.circular(18),
                          child: Image.file(
                            File(_photos.first.path),
                            height: 110,
                            fit: BoxFit.cover,
                            cacheWidth: 600,
                            errorBuilder: (_, error, stack) =>
                                const PlacePhoto(height: 110),
                          ),
                        ),
                      const SizedBox(height: 12),
                      Text(
                        _point == null
                            ? 'Choose your spot'
                            : placeName(_selected),
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                          color: GlassTokens.ink,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        _resolving
                            ? 'Finding this address…'
                            : '${_selected['address'] ?? 'Drag the map or search for a place.'}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          color: GlassTokens.muted,
                        ),
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            _error!,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.red,
                            ),
                          ),
                        ),
                      Wrap(
                        alignment: WrapAlignment.spaceBetween,
                        children: [
                          TextButton.icon(
                            onPressed: _picking || _photos.length >= 3
                                ? null
                                : _photo,
                            icon: const Icon(
                              Icons.add_photo_alternate_outlined,
                            ),
                            label: Text('Add photo (${_photos.length}/3)'),
                          ),
                          if (_photos.isNotEmpty)
                            TextButton(
                              onPressed: () =>
                                  setState(() => _photos.removeLast()),
                              child: const Text('Remove last'),
                            ),
                        ],
                      ),
                      AppButton(
                        text: 'Use this location',
                        onPressed: _point == null || _resolving
                            ? null
                            : _continue,
                      ),
                    ],
                  ),
                ),
              ),
            );
            final mapView = widget.mapBuilder?.call(map) ?? map;
            if (compact) {
              return SafeArea(
                child: SingleChildScrollView(
                  padding: EdgeInsets.only(
                    bottom: MediaQuery.viewInsetsOf(context).bottom,
                  ),
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
                        child: header,
                      ),
                      SizedBox(height: 280, child: mapView),
                      if (MediaQuery.viewInsetsOf(context).bottom == 0)
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: preview,
                        ),
                    ],
                  ),
                ),
              );
            }
            return Stack(
              children: [
                Positioned.fill(child: mapView),
                Positioned(
                  top: safe.top + 10,
                  left: 20,
                  right: 20,
                  child: header,
                ),
                if (MediaQuery.viewInsetsOf(context).bottom == 0)
                  Positioned(
                    left: 26,
                    right: 26,
                    bottom: safe.bottom + 20,
                    child: preview,
                  ),
              ],
            );
          },
        ),
      ),
    ),
  );
}

class PlaceSaveForm extends StatefulWidget {
  final PlacesRepository repository;
  final Map<String, dynamic> initial;
  final List<XFile> photos;
  final ValueChanged<Map<String, dynamic>>? onDraftChanged;
  const PlaceSaveForm({
    super.key,
    required this.repository,
    required this.initial,
    required this.photos,
    this.onDraftChanged,
  });
  @override
  State<PlaceSaveForm> createState() => _SaveFormState();
}

class _SaveFormState extends State<PlaceSaveForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: placeName(widget.initial));
  late final _address = TextEditingController(
    text: '${widget.initial['address'] ?? ''}',
  );
  late final _description = TextEditingController(
    text: '${widget.initial['description'] ?? ''}',
  );
  late final _phone = TextEditingController(
    text: '${widget.initial['phone'] ?? ''}',
  );
  late final _website = TextEditingController(
    text: '${widget.initial['website'] ?? ''}',
  );
  late String _type = '${widget.initial['place_type'] ?? 'OTHER'}';
  late final _keys = List.generate(
    widget.photos.length,
    (i) => 'place-photo-${DateTime.now().microsecondsSinceEpoch}-$i',
  );
  String? _savedId, _error;
  bool _busy = false, _attempted = false;
  int _uploaded = 0;
  @override
  void dispose() {
    for (final c in [_name, _address, _description, _phone, _website]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _attempted = true;
      _error = null;
    });
    try {
      _savedId ??= await widget.repository.save(
        {
          'name': _name.text.trim(),
          'address': _address.text.trim(),
          'latitude': widget.initial['latitude'],
          'longitude': widget.initial['longitude'],
          'place_type': _type,
          'description': _description.text.trim(),
          'phone': _phone.text.trim().isEmpty ? null : _phone.text.trim(),
          'website': _website.text.trim().isEmpty ? null : _website.text.trim(),
          if (widget.initial['version'] != null)
            'version': widget.initial['version'],
        },
        id: widget.initial['version'] == null
            ? null
            : '${widget.initial['id']}',
      );
      while (_uploaded < widget.photos.length) {
        final photo = widget.photos[_uploaded];
        if (mounted) setState(() {});
        await widget.repository.photo(
          _savedId!,
          photo.path,
          photo.name,
          _keys[_uploaded],
        );
        _uploaded++;
      }
      if (mounted) Navigator.pop(context, _savedId);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error =
              '${ApiResult.errorMessage(error)}${_savedId != null ? ' Your place is saved. Retry to finish the remaining photos.' : ''}',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _field(
    TextEditingController controller,
    String label,
    int max, {
    String? Function(String?)? validator,
    int lines = 1,
    TextInputType? keyboard,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 20),
    child: LiquidGlassSurface(
      padding: EdgeInsets.zero,
      radius: 20,
      child: TextFormField(
        controller: controller,
        readOnly: _busy || _attempted,
        maxLength: max,
        maxLines: lines,
        keyboardType: keyboard,
        decoration: InputDecoration(labelText: label),
        validator: validator,
      ),
    ),
  );
  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy && _savedId == null,
    onPopInvokedWithResult: (didPop, result) {
      if (didPop) {
        widget.onDraftChanged?.call({
          'name': _name.text,
          'address': _address.text,
          'description': _description.text,
          'phone': _phone.text,
          'website': _website.text,
          'place_type': _type,
        });
        return;
      }
      if (!didPop && !_busy && _savedId != null) {
        Navigator.pop(context, _savedId);
      }
    },
    child: LiquidGlassScope(
      child: LiquidGlassSheet(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(
            20,
            8,
            20,
            24 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: Form(
            key: _form,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Save shared place',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w600,
                    color: GlassTokens.ink,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'This place, photos, visits and reviews are visible to all signed-in members. Add only information you want to share.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.5,
                    color: GlassTokens.muted,
                  ),
                ),
                const SizedBox(height: 20),
                _field(
                  _name,
                  'Place name',
                  80,
                  validator: (v) =>
                      v?.trim().isEmpty != false ? 'Enter a name' : null,
                ),
                _field(
                  _address,
                  'Address',
                  300,
                  lines: 2,
                  validator: (v) =>
                      v?.trim().isEmpty != false ? 'Enter an address' : null,
                ),
                LiquidGlassDropdownFormField<String>(
                  initialValue: _type,
                  decoration: const InputDecoration(labelText: 'Place type'),
                  items: const [
                    DropdownMenuItem(value: 'HOME', child: Text('Home')),
                    DropdownMenuItem(value: 'WORK', child: Text('Work')),
                    DropdownMenuItem(value: 'OTHER', child: Text('Other')),
                  ],
                  onChanged: _busy || _attempted
                      ? null
                      : (v) => setState(() => _type = v!),
                ),
                const SizedBox(height: 20),
                _field(
                  _description,
                  'About this place (optional)',
                  2000,
                  lines: 3,
                ),
                _field(
                  _phone,
                  'Public contact number (optional)',
                  25,
                  keyboard: TextInputType.phone,
                  validator: (v) =>
                      v!.trim().isEmpty ||
                          RegExp(r'^\+?[\d ()-]{7,25}$').hasMatch(v.trim())
                      ? null
                      : 'Enter a valid contact number',
                ),
                _field(
                  _website,
                  'Website (optional)',
                  500,
                  keyboard: TextInputType.url,
                  validator: (v) {
                    if (v!.trim().isEmpty) return null;
                    final uri = Uri.tryParse(v.trim());
                    return uri != null &&
                            ['http', 'https'].contains(uri.scheme) &&
                            uri.host.isNotEmpty &&
                            uri.userInfo.isEmpty
                        ? null
                        : 'Enter a complete http or https URL';
                  },
                ),
                for (final photo in widget.photos)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 14),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(18),
                      child: Image.file(
                        File(photo.path),
                        height: 130,
                        fit: BoxFit.cover,
                        cacheWidth: 600,
                        errorBuilder: (_, error, stack) => const PlacePhoto(),
                      ),
                    ),
                  ),
                if (_busy)
                  Text(
                    _savedId == null
                        ? 'Saving place…'
                        : 'Uploading photo ${_uploaded + 1} of ${widget.photos.length}…',
                    style: const TextStyle(color: GlassTokens.muted),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.red, fontSize: 13),
                    ),
                  ),
                AppButton(
                  text: _savedId == null
                      ? 'Save shared place'
                      : 'Retry remaining photos',
                  isLoading: _busy,
                  onPressed: _busy ? null : _save,
                ),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => Navigator.pop(context, _savedId),
                  child: Text(
                    _savedId == null
                        ? 'Back to map'
                        : 'Finish without remaining photos',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

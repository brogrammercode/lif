import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/components/ui/solid_file_upload.dart';
import 'package:user/features/saved_places/controllers/place_save_controller.dart';
import 'package:user/features/saved_places/controllers/place_picker_controller.dart';
import 'dart:async';
import 'dart:io';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/saved_places/places.repo.dart';
import 'package:user/features/saved_places/place_display.dart';
import 'package:user/features/rides/ride_display.dart';
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
  late final _controller = PlacePickerController(
    widget.initial,
    widget.repository,
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  final _search = TextEditingController();
  LatLng? get _point => _controller.point;
  Map<String, dynamic> get _selected => _controller.selected;
  set _selected(Map<String, dynamic> value) => _controller.selected = value;
  List<XFile> get _photos => _controller.photos;
  List<Map<String, dynamic>> get _results => _controller.results;
  String? get _userId => _controller.userId;
  bool get _searching => _controller.searching;
  bool get _resolving => _controller.resolving;
  bool get _picking => _controller.picking;
  set _picking(bool value) => _controller.picking = value;
  String? get _error => _controller.error;
  set _error(String? value) => _controller.error = value;

  @override
  void initState() {
    super.initState();
    unawaited(_controller.loadProfile());
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _search.dispose();
    super.dispose();
  }

  void _find(String value) {
    _controller.find(value);
  }

  void _choose(Map<String, dynamic> place) {
    _controller.choose(place);
    FocusScope.of(context).unfocus();
  }

  void _picked(LatLng point) {
    _controller.picked(point);
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
      builder: (_) => PlaceSaveForm(
        repository: widget.repository,
        initial: initial,
        photos: _photos,
        userId: _userId,
        onDraftChanged: (draft) {
          if (mounted) setState(() => _selected = {..._selected, ...draft});
        },
      ),
    );
    if (mounted && id != null) Navigator.pop(context, id);
  }

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'Pick a Place',
    resizeToAvoidBottomInset: false,
    child: LayoutBuilder(
      builder: (context, bounds) {
        final safe = MediaQuery.paddingOf(context);
        final compact =
            MediaQuery.sizeOf(context).height < 640 ||
            MediaQuery.textScalerOf(context).scale(14) > 20;
        final previewMaxHeight = math.min(
          MediaQuery.sizeOf(context).height * .58,
          bounds.maxHeight * .68,
        );
        final map = PlaceMap(
          onPicked: _picked,
          target: _point,
          topInset: compact ? 0 : safe.top + 72,
          bottomInset: compact ? 0 : previewMaxHeight + safe.bottom + 24,
        );
        final header = Column(
          children: [
            AppErrorNotice(message: _error),
            SolidTextFormField(
              controller: _search,
              key: const ValueKey('place-picker-search'),
              label: '',
              hint: 'Search destinations',
              showLabel: false,
              prefixIcon: const Icon(Icons.search, size: 20),
              textInputAction: TextInputAction.search,
              onChanged: _find,
              onFieldSubmitted: (_) => FocusScope.of(context).unfocus(),
            ),
            if (_searching)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: LinearProgressIndicator(minHeight: 2),
              ),
            if (_results.isNotEmpty &&
                MediaQuery.viewInsetsOf(context).bottom == 0)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: SolidSurface(
                  padding: EdgeInsets.zero,
                  child: SizedBox(
                    height: math.min(200, bounds.maxHeight * .32),
                    child: ListView(
                      children: [
                        for (final result in _results)
                          ListTile(
                            leading: const Icon(Icons.place_outlined, size: 20),
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
        final preview = SolidSurface(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                _point == null ? 'Choose your spot' : placeName(_selected),
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: RideTokens.ink,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _resolving
                    ? 'Finding this address…'
                    : '${_selected['address'] ?? 'Drag the map or search for a place.'}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, color: RideTokens.muted),
              ),
              const SizedBox(height: 14),
              SolidFileUpload(
                label: 'Place photos (optional)',
                files: [
                  for (final url in placePhotos(_selected))
                    SolidUploadFile(name: 'Place photo', imageUrl: url),
                  for (final photo in _photos)
                    SolidUploadFile(
                      name: photo.name,
                      path: photo.path,
                      onRemove: () => setState(() => _photos.remove(photo)),
                    ),
                ],
                image: true,
                camera: false,
                busy: _picking,
                allowAdditional: true,
                onChoose: _photos.length >= 3 ? null : _photo,
                limitText:
                    'Supported files: JPEG, PNG, or WebP · Max file size: 3 MB · Up to 3 photos',
              ),
              const SizedBox(height: 16),
              SolidButton(
                text: widget.initial == null ? 'Continue' : 'Save place',
                minHeight: 54,
                onPressed: _point == null || _resolving ? null : _continue,
              ),
            ],
          ),
        );
        final mapView = widget.mapBuilder?.call(map) ?? map;
        return Stack(
          children: [
            Positioned.fill(child: mapView),
            Positioned(
              top: safe.top + (compact ? 6 : 10),
              left: compact ? 14 : 20,
              right: compact ? 14 : 20,
              child: header,
            ),
            if (MediaQuery.viewInsetsOf(context).bottom == 0)
              Positioned(
                left: compact ? 12 : 20,
                right: compact ? 12 : 20,
                bottom: safe.bottom + (compact ? 8 : 14),
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: previewMaxHeight),
                  child: ListView(
                    shrinkWrap: true,
                    primary: false,
                    padding: EdgeInsets.zero,
                    children: [preview],
                  ),
                ),
              ),
          ],
        );
      },
    ),
  );
}

class PlaceSaveForm extends StatefulWidget {
  final PlacesRepository repository;
  final Map<String, dynamic> initial;
  final List<XFile> photos;
  final String? userId;
  final ValueChanged<Map<String, dynamic>>? onDraftChanged;
  const PlaceSaveForm({
    super.key,
    required this.repository,
    required this.initial,
    required this.photos,
    this.userId,
    this.onDraftChanged,
  });
  @override
  State<PlaceSaveForm> createState() => _SaveFormState();
}

class _SaveFormState extends State<PlaceSaveForm> {
  late final _controller = PlaceSaveController(
    widget.initial,
    widget.photos,
    widget.repository,
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: placeName(widget.initial));
  late final _address = TextEditingController(
    text: '${widget.initial['address'] ?? ''}',
  );
  String get _type => _controller.type;
  set _type(String value) => _controller.type = value;
  List<String> get _keys => _controller.keys;
  String? get _savedId => _controller.savedId;
  set _savedId(String? value) => _controller.savedId = value;
  String? get _error => _controller.error;
  set _error(String? value) => _controller.error = value;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool get _attempted => _controller.attempted;
  set _attempted(bool value) => _controller.attempted = value;
  int get _uploaded => _controller.uploaded;
  set _uploaded(int value) => _controller.uploaded = value;
  bool _pickingPhoto = false;

  List<Map<String, dynamic>> get _existingPhotos =>
      rideMaps(widget.initial['photos'])
          .where(
            (photo) => !_controller.removedPhotoIds.contains('${photo['id']}'),
          )
          .toList();

  Future<void> _addPhoto() async {
    if (_busy ||
        _pickingPhoto ||
        _existingPhotos.length + widget.photos.length >= 10) {
      return;
    }
    setState(() => _pickingPhoto = true);
    try {
      final photo = await ImagePicker().pickImage(
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
      _controller.addPhoto(photo);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
  }

  bool get _hasChangesOrPhotos =>
      _savedId != null ||
      widget.photos.isNotEmpty ||
      _controller.removedPhotoIds.isNotEmpty ||
      (widget.initial['version'] == null &&
          widget.initial['latitude'] != null &&
          widget.initial['longitude'] != null) ||
      _name.text.trim() != placeName(widget.initial).trim() ||
      _address.text.trim() != '${widget.initial['address'] ?? ''}'.trim() ||
      _type != '${widget.initial['place_type'] ?? 'OTHER'}';
  bool get _canDelete =>
      widget.userId != null &&
      widget.initial['created_by_id'] == widget.userId &&
      widget.initial['version'] is num;
  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    for (final c in [_name, _address]) {
      c.dispose();
    }
    for (final photo in widget.photos) {
      unawaited(ResizeImage(FileImage(File(photo.path)), width: 600).evict());
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    if (widget.initial['latitude'] is! num ||
        widget.initial['longitude'] is! num) {
      setState(() => _error = 'Choose a map location before saving.');
      return;
    }
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
          'description': widget.initial['description'],
          'phone': widget.initial['phone'],
          'website': widget.initial['website'],
          if (widget.initial['version'] != null)
            'version': widget.initial['version'],
        },
        id: widget.initial['version'] == null
            ? null
            : '${widget.initial['id']}',
      );
      while (_controller.removedPhotoIds.isNotEmpty) {
        final photoId = _controller.removedPhotoIds.first;
        await widget.repository.removePhoto(_savedId!, photoId);
        _controller.removedPhotoIds.remove(photoId);
      }
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

  Future<void> _removePlace() async {
    if (!_canDelete || _busy) return;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: const Text('Delete this place?'),
        content: const Text(
          'It will no longer appear in Saved Places. Existing contribution history will be retained.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialog, true),
            style: TextButton.styleFrom(foregroundColor: Color(0xFFB3261E)),
            child: const Text('Delete place'),
          ),
        ],
      ),
    );
    if (confirm != true || !mounted) return;
    try {
      await _controller.removePlace();
      if (mounted) Navigator.pop(context, 'deleted:${widget.initial['id']}');
    } catch (_) {}
  }

  Widget _field(
    TextEditingController controller,
    String label,
    int max, {
    String? Function(String?)? validator,
    int lines = 1,
    TextInputType? keyboard,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: SolidTextFormField(
      controller: controller,
      label: label,
      enabled: !_busy && !_attempted,
      maxLength: max,
      maxLines: lines,
      keyboardType: keyboard,
      textInputAction: lines > 1
          ? TextInputAction.newline
          : TextInputAction.next,
      onChanged: (_) => setState(() {}),
      validator: validator,
    ),
  );
  @override
  Widget build(BuildContext context) =>
      AppErrorNotice(message: _error, child: _buildSheet(context));

  Widget _buildSheet(BuildContext context) => PopScope(
    canPop: !_busy && _savedId == null,
    onPopInvokedWithResult: (didPop, result) {
      if (didPop) {
        widget.onDraftChanged?.call({
          'name': _name.text,
          'address': _address.text,
          'description': widget.initial['description'],
          'phone': widget.initial['phone'],
          'website': widget.initial['website'],
          'place_type': _type,
        });
        return;
      }
      if (!didPop && !_busy && _savedId != null) {
        Navigator.pop(context, _savedId);
      }
    },
    child: SolidSheet(
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            4,
            20,
            18 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: math.max(
                240,
                (MediaQuery.sizeOf(context).height -
                        MediaQuery.viewInsetsOf(context).bottom -
                        72) *
                    .88,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    widget.initial['version'] == null
                        ? 'Save place'
                        : 'Edit place',
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                ConstrainedBox(
                  constraints: BoxConstraints(
                    maxHeight: math.max(
                      120,
                      (MediaQuery.sizeOf(context).height -
                              MediaQuery.viewInsetsOf(context).bottom -
                              240) *
                          .62,
                    ),
                  ),
                  child: ListView(
                    shrinkWrap: true,
                    primary: false,
                    padding: EdgeInsets.zero,
                    children: [
                      Form(
                        key: _form,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _field(
                              _name,
                              'Place name',
                              80,
                              validator: (v) => v?.trim().isEmpty != false
                                  ? 'Enter a name'
                                  : null,
                            ),
                            _field(
                              _address,
                              'Address',
                              300,
                              lines: 2,
                              validator: (v) => v?.trim().isEmpty != false
                                  ? 'Enter an address'
                                  : null,
                            ),
                            Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: SolidDropdownFormField<String>(
                                initialValue: _type,
                                label: 'Place type',
                                items: const [
                                  DropdownMenuItem(
                                    value: 'HOME',
                                    child: Text('Home'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'WORK',
                                    child: Text('Work'),
                                  ),
                                  DropdownMenuItem(
                                    value: 'OTHER',
                                    child: Text('Other'),
                                  ),
                                ],
                                onChanged: _busy || _attempted
                                    ? null
                                    : (v) {
                                        if (v != null) {
                                          setState(() => _type = v);
                                        }
                                      },
                                enabled: !_busy && !_attempted,
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: SolidFileUpload(
                                label: 'Place photos (optional)',
                                files: [
                                  for (final photo in _existingPhotos)
                                    SolidUploadFile(
                                      id: 'saved-${photo['id']}',
                                      name: 'Place photo',
                                      imageUrl: '${photo['url']}',
                                      onRemove:
                                          _busy ||
                                              _attempted ||
                                              widget.userId == null ||
                                              photo['author_id'] !=
                                                  widget.userId
                                          ? null
                                          : () => setState(
                                              () => _controller
                                                  .removeExistingPhoto(
                                                    '${photo['id']}',
                                                  ),
                                            ),
                                    ),
                                  for (final photo in widget.photos)
                                    SolidUploadFile(
                                      id: 'local-${photo.path}',
                                      name: photo.name,
                                      path: photo.path,
                                      onRemove: _busy || _attempted
                                          ? null
                                          : () => _controller.removeNewPhoto(
                                              photo,
                                            ),
                                    ),
                                ],
                                image: true,
                                camera: false,
                                busy: _pickingPhoto || _busy,
                                allowAdditional:
                                    _existingPhotos.length +
                                        widget.photos.length <
                                    10,
                                onChoose: _busy || _attempted
                                    ? null
                                    : _addPhoto,
                                limitText:
                                    'JPEG, PNG, or WebP | Max 3 MB | Up to 10 photos',
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                if (_hasChangesOrPhotos)
                  SolidButton(
                    text: _savedId == null
                        ? 'Save place'
                        : 'Retry photo upload',
                    busy: _busy,
                    onPressed: _busy ? null : _save,
                    minHeight: 54,
                  )
                else
                  SolidButton(
                    text: 'Done',
                    onPressed: () => Navigator.pop(context, _savedId),
                    minHeight: 54,
                  ),
                if (_canDelete) ...[
                  const SizedBox(height: 4),
                  TextButton.icon(
                    onPressed: _busy || _attempted ? null : _removePlace,
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('Delete place'),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFFB3261E),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

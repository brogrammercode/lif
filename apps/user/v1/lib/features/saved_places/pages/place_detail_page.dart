import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/places.repo.dart';
import 'package:user/features/saved_places/place_display.dart';
import 'package:user/features/saved_places/pages/place_picker_page.dart';
import 'package:user/features/saved_places/pages/place_directions_page.dart';
import 'package:user/features/saved_places/widgets/place_components.dart';
import 'package:user/features/saved_places/widgets/place_map.dart';

class PlaceDetailPage extends StatefulWidget {
  final String id;
  final PlacesRepository repository;
  final Widget Function(PlaceMap)? mapBuilder;
  const PlaceDetailPage({
    super.key,
    required this.id,
    required this.repository,
    this.mapBuilder,
  });
  @override
  State<PlaceDetailPage> createState() => _PlaceDetailState();
}

class _PlaceDetailState extends State<PlaceDetailPage> {
  final _scroll = ScrollController();
  Map<String, dynamic>? _place, _reviews;
  String? _error, _reviewError, _userId;
  bool _loading = false, _busy = false, _reviewsLoading = false;
  int _recenter = 0, _reviewPage = 1, _generation = 0, _reviewGeneration = 0;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
    unawaited(_profile());
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _profile() async {
    try {
      final user = await widget.repository.profile();
      if (mounted) setState(() => _userId = '${user['id']}');
    } catch (_) {}
  }

  Future<void> _load({bool replace = false}) async {
    if (_loading && !replace) return;
    final generation = ++_generation;
    setState(() => _loading = true);
    try {
      final place = await widget.repository.detail(widget.id);
      if (place['id'] != widget.id) {
        throw StateError('This place could not be verified. Please refresh.');
      }
      if (mounted && generation == _generation) {
        setState(() {
          _place = place;
          _error = null;
        });
        unawaited(_loadReviews(replace: true));
      }
    } catch (error) {
      if (mounted && generation == _generation) {
        setState(() => _error = ApiResult.errorMessage(error));
      }
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _loadReviews({int? page, bool replace = false}) async {
    if (_reviewsLoading && !replace) return;
    final generation = ++_reviewGeneration;
    setState(() {
      _reviewsLoading = true;
      if (page != null) {
        _reviewPage = page;
        _reviews = null;
      }
    });
    try {
      final data = await widget.repository.reviews(
        widget.id,
        page: _reviewPage,
      );
      if (mounted && generation == _reviewGeneration) {
        setState(() {
          _reviews = data;
          _reviewError = null;
        });
      }
    } catch (error) {
      if (mounted && generation == _reviewGeneration) {
        setState(() => _reviewError = ApiResult.errorMessage(error));
      }
    } finally {
      if (mounted && generation == _reviewGeneration) {
        setState(() => _reviewsLoading = false);
      }
    }
  }

  Future<void> _change(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) await _load(replace: true);
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

  Future<void> _open(Uri uri) async {
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
    } catch (_) {}
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This action could not be opened.')),
      );
    }
  }

  Future<void> _review() async {
    final changed = await showDialog<bool>(
      context: context,
      builder: (_) => PlaceReviewEditor(
        id: widget.id,
        repository: widget.repository,
        initial: rideMap(_place?['own_review']),
      ),
    );
    if (changed == true && mounted) await _load(replace: true);
  }

  Future<void> _photo() async {
    if (_busy) return;
    try {
      final file = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1800,
        maxHeight: 1800,
        imageQuality: 85,
        requestFullMetadata: false,
      );
      if (file == null || !mounted) return;
      if (await file.length() > 3000000) {
        throw StateError('Choose a photo up to 3 MB.');
      }
      if (!mounted) return;
      final key = 'place-photo-${DateTime.now().microsecondsSinceEpoch}';
      bool uploading = false;
      String? error;
      final saved = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (dialog) => StatefulBuilder(
          builder: (_, update) => PopScope(
            canPop: !uploading,
            child: LiquidGlassDialog(
              title: const Text('Share this place photo?'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(18),
                    child: Image.file(
                      File(file.path),
                      height: 180,
                      cacheWidth: 600,
                      fit: BoxFit.cover,
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'This photo will be visible to all signed-in members.',
                  ),
                  if (error != null)
                    Text(error!, style: const TextStyle(color: Colors.red)),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: uploading ? null : () => Navigator.pop(dialog),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  onPressed: uploading
                      ? null
                      : () async {
                          update(() {
                            uploading = true;
                            error = null;
                          });
                          try {
                            await widget.repository.photo(
                              widget.id,
                              file.path,
                              file.name,
                              key,
                            );
                            if (dialog.mounted) Navigator.pop(dialog, true);
                          } catch (e) {
                            if (dialog.mounted) {
                              update(() => error = ApiResult.errorMessage(e));
                            }
                          } finally {
                            if (dialog.mounted) update(() => uploading = false);
                          }
                        },
                  child: Text(uploading ? 'Saving photo…' : 'Save photo'),
                ),
              ],
            ),
          ),
        ),
      );
      if (saved == true && mounted) await _load(replace: true);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    }
  }

  Future<void> _edit() async {
    await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) => PlacePickerPage(
          repository: widget.repository,
          initial: _place,
          mapBuilder: widget.mapBuilder,
        ),
      ),
    );
    if (mounted) await _load(replace: true);
  }

  Future<void> _managePhotos() async {
    final own = rideMaps(_place?['photos'])
        .where((photo) => _userId != null && photo['author_id'] == _userId)
        .toList();
    final remove = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheet) => FractionallySizedBox(
        heightFactor: .65,
        child: LiquidGlassSheet(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              const Text(
                'Your place photos',
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w600,
                  color: GlassTokens.ink,
                ),
              ),
              const SizedBox(height: 16),
              if (own.isEmpty)
                const Text('You have not added any photos here.'),
              for (final photo in own)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: LiquidGlassSurface(
                    child: Column(
                      children: [
                        PlacePhoto(url: '${photo['url']}'),
                        TextButton.icon(
                          onPressed: () =>
                              Navigator.pop(sheet, '${photo['id']}'),
                          icon: const Icon(Icons.delete_outline),
                          label: const Text('Remove photo'),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
    if (remove == null || !mounted) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialog) => LiquidGlassDialog(
        title: const Text('Remove this photo?'),
        content: const Text(
          'It will be removed from this shared place for everyone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialog),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialog, true),
            child: const Text('Remove photo'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await _change(() => widget.repository.removePhoto(widget.id, remove));
    }
  }

  void _plot() {
    setState(() => _recenter++);
    if (MediaQuery.disableAnimationsOf(context)) {
      _scroll.jumpTo(0);
      return;
    }
    unawaited(
      _scroll.animateTo(
        0,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      ),
    );
  }

  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: 'Place details',
    scrollable: true,
    action: IconButton(
      tooltip: 'Refresh place',
      onPressed: _loading || _busy ? null : _load,
      icon: const Icon(Icons.refresh),
    ),
    child: _place == null
        ? SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: _error != null
                ? AppLoadError(message: _error!, onRetry: _load)
                : const PlaceCardSkeleton(),
          )
        : _content(),
  );
  Widget _content() {
    final place = _place!;
    final map = PlaceMap(
      places: [place],
      selectedId: widget.id,
      recenter: _recenter,
    );
    final point = ridePoint(place['latitude'], place['longitude']);
    final photos = placePhotos(place);
    final website = Uri.tryParse('${place['website'] ?? ''}');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        controller: _scroll,
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: LiquidGlassSurface(
              padding: const EdgeInsets.all(7),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: SizedBox(
                  height: 200,
                  child: widget.mapBuilder?.call(map) ?? map,
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: LiquidGlassSurface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    placeName(place),
                    style: const TextStyle(
                      fontSize: 23,
                      fontWeight: FontWeight.w600,
                      color: GlassTokens.ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${place['address']}',
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: GlassTokens.muted,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      LiquidGlassChip(
                        label: placeType(place),
                        icon: placeIcon(place),
                      ),
                      if ((rideNumber(place['review_count']) ?? 0) > 0 &&
                          rideNumber(place['rating']) != null)
                        LiquidGlassChip(
                          label:
                              '${rideNumber(place['rating'])!.toStringAsFixed(1)} · ${place['review_count']} reviews',
                          icon: Icons.star_outline,
                        ),
                      LiquidGlassChip(
                        label: place['saved'] == true ? 'Saved' : 'Save place',
                        selected: place['saved'] == true,
                        icon: Icons.bookmark_outline,
                        onPressed: _busy
                            ? null
                            : () => _change(
                                () => widget.repository.bookmark(
                                  widget.id,
                                  place['saved'] != true,
                                ),
                              ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          PlaceGallery(photos: photos),
          if (_userId != null &&
              rideMaps(
                place['photos'],
              ).any((photo) => photo['author_id'] == _userId))
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: _busy ? null : _managePhotos,
                  child: const Text('Manage your photos'),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: _busy || photos.length >= 10 ? null : _photo,
                icon: const Icon(Icons.add_photo_alternate_outlined),
                label: const Text('Add a photo'),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: PlaceVisitors(place),
          ),
          const SizedBox(height: 16),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: LayoutBuilder(
              builder: (context, size) => Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  SizedBox(
                    width: MediaQuery.textScalerOf(context).scale(14) > 20
                        ? size.maxWidth
                        : (size.maxWidth - 10) / 2,
                    child: AppButton(
                      text: 'Plot on map',
                      onPressed: point == null ? null : _plot,
                      icon: const Icon(Icons.place_outlined, size: 19),
                    ),
                  ),
                  LiquidGlassChip(
                    label: place['visited_at'] != null
                        ? 'Visited'
                        : 'Mark visited',
                    selected: place['visited_at'] != null,
                    icon: Icons.check_circle_outline,
                    onPressed: _busy
                        ? null
                        : () => _change(
                            () => widget.repository.visit(
                              widget.id,
                              place['visited_at'] == null,
                            ),
                          ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Wrap(
              spacing: 8,
              runSpacing: 10,
              children: [
                LiquidGlassChip(
                  label: 'Directions',
                  icon: Icons.directions_outlined,
                  onPressed: point == null
                      ? null
                      : () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => PlaceDirectionsPage(
                              place: place,
                              mapBuilder: widget.mapBuilder,
                            ),
                          ),
                        ),
                ),
                if ('${place['phone'] ?? ''}'.isNotEmpty)
                  LiquidGlassChip(
                    label: 'Call',
                    icon: Icons.call_outlined,
                    onPressed: () =>
                        _open(Uri(scheme: 'tel', path: '${place['phone']}')),
                  ),
                if (website != null &&
                    ['http', 'https'].contains(website.scheme) &&
                    website.host.isNotEmpty)
                  LiquidGlassChip(
                    label: 'Website',
                    icon: Icons.language,
                    onPressed: () => _open(website),
                  ),
                LiquidGlassChip(
                  label: 'Copy address',
                  icon: Icons.copy_outlined,
                  onPressed: () async {
                    await Clipboard.setData(
                      ClipboardData(text: '${place['address']}'),
                    );
                    if (mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Address copied.')),
                      );
                    }
                  },
                ),
                if (point != null)
                  LiquidGlassChip(
                    label: 'Share',
                    icon: Icons.share_outlined,
                    onPressed: () => _open(
                      Uri.https('wa.me', '/', {
                        'text':
                            '${placeName(place)}\n${place['address']}\nhttps://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=16/${point.latitude}/${point.longitude}',
                      }),
                    ),
                  ),
                if (_userId != null && _userId == place['created_by_id'])
                  LiquidGlassChip(
                    label: 'Edit place',
                    icon: Icons.edit_outlined,
                    onPressed: _busy ? null : _edit,
                  ),
              ],
            ),
          ),
          if ('${place['description'] ?? ''}'.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 18, 20, 0),
              child: LiquidGlassSurface(
                child: Text(
                  '${place['description']}',
                  style: const TextStyle(
                    fontSize: 14,
                    height: 1.6,
                    color: GlassTokens.ink,
                  ),
                ),
              ),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(20),
              child: LiquidGlassSurface(
                child: TextButton(
                  onPressed: _load,
                  child: Text('Showing the last loaded place. $_error · Retry'),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 12),
            child: Wrap(
              alignment: WrapAlignment.spaceBetween,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 10,
              children: [
                const Text(
                  'Reviews',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w600,
                    color: GlassTokens.ink,
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : _review,
                  child: Text(
                    place['own_review'] == null
                        ? 'Write a review'
                        : 'Edit your review',
                  ),
                ),
              ],
            ),
          ),
          if (_reviewsLoading && _reviews == null)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: PlaceCardSkeleton(),
            ),
          if (_reviewError != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: TextButton(
                onPressed: _loadReviews,
                child: Text('$_reviewError · Retry reviews'),
              ),
            ),
          if (_reviews != null && rideMaps(_reviews!['rows']).isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 20),
              child: LiquidGlassSurface(
                child: Text(
                  'No reviews yet. Share your experience after visiting.',
                  style: TextStyle(fontSize: 13, color: GlassTokens.muted),
                ),
              ),
            ),
          for (final review in rideMaps(_reviews?['rows']))
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: PlaceReviewCard(review),
            ),
          if ((rideNumber(_reviews?['total']) ?? 0) > 0)
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                TextButton(
                  onPressed: _reviewPage <= 1 || _reviewsLoading
                      ? null
                      : () => _loadReviews(page: _reviewPage - 1),
                  child: const Text('Previous'),
                ),
                Text(
                  'Page $_reviewPage',
                  style: const TextStyle(
                    color: GlassTokens.muted,
                    fontSize: 13,
                  ),
                ),
                TextButton(
                  onPressed:
                      _reviewPage * 20 >=
                              (rideNumber(_reviews?['total']) ?? 0) ||
                          _reviewsLoading
                      ? null
                      : () => _loadReviews(page: _reviewPage + 1),
                  child: const Text('Next'),
                ),
              ],
            ),
        ],
      ),
    );
  }
}

class PlaceReviewEditor extends StatefulWidget {
  final String id;
  final PlacesRepository repository;
  final Map<String, dynamic> initial;
  const PlaceReviewEditor({
    super.key,
    required this.id,
    required this.repository,
    this.initial = const {},
  });
  @override
  State<PlaceReviewEditor> createState() => _ReviewEditorState();
}

class _ReviewEditorState extends State<PlaceReviewEditor> {
  late int _score = (rideNumber(widget.initial['score']) ?? 0).toInt();
  late final _comment = TextEditingController(
    text: '${widget.initial['comment'] ?? ''}',
  );
  final _form = GlobalKey<FormState>();
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _save({bool remove = false}) async {
    if (_busy || (!remove && (!_form.currentState!.validate() || _score < 1))) {
      if (_score < 1 && !remove) setState(() => _error = 'Choose a rating.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (remove) {
        await widget.repository.removeReview(widget.id);
      } else {
        await widget.repository.review(widget.id, _score, _comment.text.trim());
      }
      if (mounted) Navigator.pop(context, true);
    } catch (error) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: LiquidGlassDialog(
      title: const Text('Your place review'),
      content: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Wrap(
              children: [
                for (var score = 1; score <= 5; score++)
                  IconButton(
                    tooltip: '$score out of 5',
                    onPressed: _busy
                        ? null
                        : () => setState(() => _score = score),
                    icon: Icon(
                      score <= _score ? Icons.star : Icons.star_outline,
                      color: GlassTokens.accent,
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _comment,
              readOnly: _busy,
              maxLength: 2000,
              minLines: 3,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'Share your experience',
              ),
              validator: (v) =>
                  v?.trim().isEmpty != false ? 'Write a short review' : null,
            ),
            if (_error != null)
              Text(_error!, style: const TextStyle(color: Colors.red)),
          ],
        ),
      ),
      actions: [
        if (widget.initial.isNotEmpty)
          TextButton(
            onPressed: _busy ? null : () => _save(remove: true),
            child: const Text('Remove review'),
          ),
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'Saving…' : 'Save review'),
        ),
      ],
    ),
  );
}

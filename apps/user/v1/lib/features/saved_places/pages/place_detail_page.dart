import 'package:user/components/ui/app_error_snackbar.dart';
import 'package:user/features/saved_places/controllers/place_review_controller.dart';
import 'package:user/features/saved_places/controllers/place_detail_controller.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/components/ui/solid_file_upload.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/places.repo.dart';
import 'package:user/features/saved_places/place_display.dart';
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
  late final _controller = PlaceDetailController(widget.repository, widget.id)
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  final _scroll = ScrollController();
  Map<String, dynamic>? get _place => _controller.place;
  Map<String, dynamic>? get _reviews => _controller.reviews;
  String? get _error => _controller.error;
  String? get _reviewError => _controller.reviewError;
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  bool get _reviewsLoading => _controller.reviewsLoading;
  int get _reviewPage => _controller.reviewPage;
  @override
  void initState() {
    super.initState();
    unawaited(_load());
    unawaited(_profile());
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _profile() => _controller.profile();

  Future<void> _load({bool replace = false}) =>
      _controller.load(replace: replace);

  Future<void> _loadReviews({int? page, bool replace = false}) =>
      _controller.loadReviews(page: page, replace: replace);

  Future<void> _change(Future<void> Function() action) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) await _load(replace: true);
    } catch (error) {
      if (mounted) {
        showAppError(context, ApiResult.errorMessage(error));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _review() async {
    final changed = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
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
            child: AlertDialog(
              title: const Text('Share this place photo?'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SolidFileUpload(
                    label: 'Place photo',
                    files: [
                      SolidUploadFile(
                        name: file.name,
                        path: file.path,
                        onRemove: () => Navigator.pop(dialog, false),
                      ),
                    ],
                    image: true,
                    camera: false,
                    busy: uploading,
                    onChoose: null,
                    limitText: 'JPEG, PNG, or WebP · up to 3 MB',
                    showGuidance: false,
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'This photo will be visible to all signed-in members.',
                  ),
                  if (error != null) AppErrorNotice(message: error),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: uploading ? null : () => Navigator.pop(dialog),
                  child: const Text('Cancel'),
                ),
                FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: Colors.black,
                    foregroundColor: Colors.white,
                  ),
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
        showAppError(context, ApiResult.errorMessage(error));
      }
    }
  }

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'Place details',
    child: _place == null
        ? Center(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: _error == null
                  ? const CircularProgressIndicator.adaptive()
                  : SolidSurface(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          AppErrorNotice(message: _error),
                          const SizedBox(height: 12),
                          SolidButton(text: 'Retry', onPressed: _load),
                        ],
                      ),
                    ),
            ),
          )
        : _content(),
  );
  Widget _content() {
    final place = _place!;
    final map = PlaceMap(
      places: [place],
      selectedId: widget.id,
      onSelected: (_) {},
    );
    final point = ridePoint(place['latitude'], place['longitude']);
    final photos = placePhotos(place);
    final reviewTotal = (rideNumber(_reviews?['total']) ?? 0).toInt();
    final ownReview = place['own_review'] != null;
    final visited = place['visited_at'] != null;
    final rating = rideNumber(place['rating']);
    final visitorCount = (rideNumber(place['visitor_count']) ?? 0).toInt();

    return RefreshIndicator(
      color: Colors.black,
      onRefresh: _load,
      child: ListView(
        controller: _scroll,
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              height: 172,
              child: widget.mapBuilder?.call(map) ?? map,
            ),
          ),
          const SizedBox(height: 14),
          SolidSurface(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(
                        placeName(place),
                        style: const TextStyle(
                          fontSize: 21,
                          height: 1.2,
                          fontWeight: FontWeight.w500,
                          color: RideTokens.ink,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      tooltip: place['saved'] == true
                          ? 'Remove from saved places'
                          : 'Save this place',
                      onPressed: _busy
                          ? null
                          : () => _change(
                              () => widget.repository.bookmark(
                                widget.id,
                                place['saved'] != true,
                              ),
                            ),
                      icon: Icon(
                        place['saved'] == true
                            ? Icons.bookmark
                            : Icons.bookmark_border,
                        color: RideTokens.ink,
                      ),
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '${place['address'] ?? ''}',
                  style: const TextStyle(
                    fontSize: 14,
                    height: 1.4,
                    color: RideTokens.muted,
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(placeIcon(place), size: 16, color: RideTokens.ink),
                    const SizedBox(width: 5),
                    Text(
                      placeType(place),
                      style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: RideTokens.ink,
                      ),
                    ),
                    if (rating != null && rating > 0) ...[
                      const SizedBox(width: 14),
                      const Icon(
                        Icons.star_rounded,
                        size: 17,
                        color: Color(0xFFB18A00),
                      ),
                      const SizedBox(width: 3),
                      Text(
                        '${rating.toStringAsFixed(1)}${reviewTotal > 0 ? ' ($reviewTotal)' : ''}',
                        style: const TextStyle(
                          fontSize: 13,
                          color: RideTokens.ink,
                        ),
                      ),
                    ],
                    const Spacer(),
                    if (visitorCount > 0)
                      Text(
                        '$visitorCount ${visitorCount == 1 ? 'visit' : 'visits'}',
                        style: const TextStyle(
                          fontSize: 12,
                          color: RideTokens.muted,
                        ),
                      ),
                  ],
                ),
                if ('${place['description'] ?? ''}'.trim().isNotEmpty) ...[
                  const SizedBox(height: 12),
                  const Divider(height: 1),
                  const SizedBox(height: 10),
                  Text(
                    '${place['description']}',
                    style: const TextStyle(
                      fontSize: 14,
                      height: 1.45,
                      color: RideTokens.ink,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Photos',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w500,
                    color: RideTokens.ink,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: _busy || photos.length >= 10 ? null : _photo,
                icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
                label: const Text('Add'),
              ),
            ],
          ),
          PlaceGallery(photos: photos),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: SolidButton(
                  text: 'Directions',
                  icon: const Icon(Icons.directions_outlined, size: 19),
                  minHeight: 52,
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
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy
                      ? null
                      : () => _change(
                          () => widget.repository.visit(widget.id, !visited),
                        ),
                  icon: Icon(
                    visited ? Icons.check_circle_outline : Icons.place_outlined,
                    size: 19,
                  ),
                  label: Text(visited ? 'Visited' : 'Mark visited'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: RideTokens.ink,
                    minimumSize: const Size(0, 52),
                    side: const BorderSide(color: RideTokens.line),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ),
            ],
          ),
          if (_error != null)
            AppErrorNotice(
              message: 'Showing saved details. $_error',
              child: TextButton(
                onPressed: _load,
                child: const Text('Retry details'),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(0, 26, 0, 10),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Reviews${reviewTotal > 0 ? ' ($reviewTotal)' : ''}',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w500,
                      color: RideTokens.ink,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: _busy ? null : _review,
                  child: Text(ownReview ? 'Edit review' : 'Write review'),
                ),
              ],
            ),
          ),
          if (_reviewsLoading && _reviews == null)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 18),
              child: Center(
                child: SizedBox.square(
                  dimension: 22,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
          if (_reviewError != null)
            AppErrorNotice(
              message: _reviewError,
              child: TextButton(
                onPressed: _loadReviews,
                child: const Text('Retry reviews'),
              ),
            ),
          if (_reviews != null && rideMaps(_reviews!['rows']).isEmpty)
            const SolidSurface(
              child: Text(
                'No reviews yet. Be the first to share your experience.',
                style: TextStyle(fontSize: 13, color: RideTokens.muted),
              ),
            ),
          for (final review in rideMaps(_reviews?['rows']))
            PlaceReviewCard(review),
          if (reviewTotal > 20)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  TextButton(
                    onPressed: _reviewPage <= 1 || _reviewsLoading
                        ? null
                        : () => _loadReviews(page: _reviewPage - 1),
                    child: const Text('Previous'),
                  ),
                  Text(
                    '$_reviewPage / ${(reviewTotal / 20).ceil()}',
                    style: const TextStyle(
                      fontSize: 12,
                      color: RideTokens.muted,
                    ),
                  ),
                  TextButton(
                    onPressed:
                        _reviewPage * 20 >= reviewTotal || _reviewsLoading
                        ? null
                        : () => _loadReviews(page: _reviewPage + 1),
                    child: const Text('Next'),
                  ),
                ],
              ),
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
  late final _controller = PlaceReviewController(widget.initial)
    ..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  int get _score => _controller.score;
  set _score(int value) => _controller.score = value;
  late final _comment = TextEditingController(
    text: '${widget.initial['comment'] ?? ''}',
  );
  final _form = GlobalKey<FormState>();
  bool get _busy => _controller.busy;
  set _busy(bool value) => _controller.busy = value;
  String? get _error => _controller.error;
  set _error(String? value) => _controller.error = value;
  bool get _hasReviewChanges =>
      _score != (rideNumber(widget.initial['score']) ?? 0).toInt() ||
      _comment.text.trim() != '${widget.initial['comment'] ?? ''}'.trim();
  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
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
  Widget build(BuildContext context) =>
      AppErrorNotice(message: _error, child: _buildSheet(context));

  Widget _buildSheet(BuildContext context) => PopScope(
    canPop: !_busy,
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
              maxHeight:
                  (MediaQuery.sizeOf(context).height -
                      MediaQuery.viewInsetsOf(context).bottom -
                      72) *
                  .84,
            ),
            child: SingleChildScrollView(
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(bottom: 14),
                      child: Text(
                        'Your place review',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w500,
                          color: RideTokens.ink,
                        ),
                      ),
                    ),
                    Center(
                      child: Wrap(
                        children: [
                          for (var score = 1; score <= 5; score++)
                            IconButton(
                              tooltip: '$score out of 5',
                              onPressed: _busy
                                  ? null
                                  : () => setState(() => _score = score),
                              icon: Icon(
                                score <= _score
                                    ? Icons.star_rounded
                                    : Icons.star_outline_rounded,
                                color: Colors.black,
                                size: 30,
                              ),
                            ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    SolidTextFormField(
                      controller: _comment,
                      label: 'Your experience',
                      enabled: !_busy,
                      maxLength: 2000,
                      minLines: 3,
                      maxLines: 5,
                      onChanged: (_) => setState(() {}),
                      textInputAction: TextInputAction.newline,
                      validator: (v) => v?.trim().isEmpty != false
                          ? 'Write a short review'
                          : null,
                    ),
                    const SizedBox(height: 16),
                    SolidButton(
                      text: 'Save review',
                      busy: _busy,
                      onPressed: _busy || !_hasReviewChanges ? null : _save,
                      minHeight: 54,
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        if (widget.initial.isNotEmpty)
                          TextButton(
                            onPressed: _busy ? null : () => _save(remove: true),
                            child: const Text('Remove review'),
                          )
                        else
                          const SizedBox.shrink(),
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () => Navigator.pop(context),
                          child: const Text('Cancel'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

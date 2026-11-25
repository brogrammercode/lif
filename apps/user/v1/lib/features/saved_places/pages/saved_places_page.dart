import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/saved_places/controllers/saved_places_controller.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/saved_places/places.repo.dart';
import 'package:user/features/saved_places/place_display.dart';
import 'package:user/features/saved_places/pages/place_picker_page.dart';
import 'package:user/features/saved_places/pages/place_detail_page.dart';
import 'package:user/features/saved_places/widgets/place_components.dart';
import 'package:user/features/saved_places/widgets/place_map.dart';

class SavedPlacesPage extends StatefulWidget {
  final PlacesRepository? repository;
  final Widget Function(PlaceMap)? mapBuilder;
  const SavedPlacesPage({super.key, this.repository, this.mapBuilder});
  @override
  State<SavedPlacesPage> createState() => _SavedPlacesState();
}

class _SavedPlacesState extends State<SavedPlacesPage>
    with WidgetsBindingObserver {
  late final _controller = SavedPlacesController(
    widget.repository ?? PlacesRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  PlacesRepository get _repo => _controller.repo;
  String? get _userId => _controller.userId;
  final _search = TextEditingController();
  final _cards = PageController(viewportFraction: .87);
  List<Map<String, dynamic>> get _places => _controller.places;
  set _places(List<Map<String, dynamic>> value) => _controller.places = value;
  String get _scope => _controller.scope;
  set _scope(String value) => _controller.scope = value;
  String get _query => _controller.query;
  set _query(String value) => _controller.query = value;
  String? get _selected => _controller.selected;
  set _selected(String? value) => _controller.selected = value;
  String? get _error => _controller.error;
  set _error(String? value) => _controller.error = value;
  String? get _type => _controller.type;
  set _type(String? value) => _controller.type = value;
  int get _page => _controller.page;
  set _page(int value) => _controller.page = value;
  int get _total => _controller.total;
  int get _generation => _controller.generation;
  set _generation(int value) => _controller.generation = value;
  int get _recenter => _controller.recenter;
  set _recenter(int value) => _controller.recenter = value;
  bool get _loading => _controller.loading;
  set _loading(bool value) => _controller.loading = value;
  bool get _loaded => _controller.loaded;
  set _loaded(bool value) => _controller.loaded = value;
  bool _removingLegacy = false;
  Timer? _debounce;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
    unawaited(_controller.loadProfile());
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    WidgetsBinding.instance.removeObserver(this);
    _debounce?.cancel();
    _search.dispose();
    _cards.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        ModalRoute.of(context)?.isCurrent == true) {
      unawaited(_load());
    }
  }

  Future<void> _load({bool changed = false}) async {
    await _controller.load(changed: changed);
    final generation = _generation;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted ||
          generation != _generation ||
          !_cards.hasClients ||
          _places.isEmpty) {
        return;
      }
      _cards.jumpToPage(
        _places
            .indexWhere((p) => '${p['id']}' == _selected)
            .clamp(0, _places.length - 1),
      );
    });
  }

  void _change(String scope, int page) {
    _debounce?.cancel();
    _scope = scope;
    _page = page;
    unawaited(_load(changed: true));
  }

  void _find(String query) {
    _debounce?.cancel();
    _query = query.trim();
    _page = 1;
    setState(() {
      _generation++;
      _places = [];
      _loaded = false;
      _loading = true;
      _error = null;
    });
    _debounce = Timer(
      const Duration(milliseconds: 450),
      () => unawaited(_load(changed: true)),
    );
  }

  void _select(String id) {
    final index = _places.indexWhere((p) => '${p['id']}' == id);
    if (index < 0) return;
    setState(() => _selected = id);
    if (_cards.hasClients && MediaQuery.disableAnimationsOf(context)) {
      _cards.jumpToPage(index);
      return;
    }
    if (_cards.hasClients) {
      unawaited(
        _cards.animateToPage(
          index,
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOut,
        ),
      );
    }
  }

  Future<void> _open(String id) async {
    await Navigator.push<void>(
      context,
      MaterialPageRoute(
        builder: (_) => PlaceDetailPage(
          id: id,
          repository: _repo,
          mapBuilder: widget.mapBuilder,
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _add([Map<String, dynamic>? legacy]) async {
    final id = await Navigator.push<String>(
      context,
      MaterialPageRoute(
        builder: (_) => PlacePickerPage(
          repository: _repo,
          initial: legacy,
          mapBuilder: widget.mapBuilder,
        ),
      ),
    );
    if (!mounted || id == null) return;
    _scope = 'saved';
    _query = '';
    _search.clear();
    _page = 1;
    _selected = id;
    await _load(changed: true);
    if (mounted) await _open(id);
  }

  Future<void> _edit(Map<String, dynamic> place) async {
    final id = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PlaceSaveForm(
        repository: _repo,
        initial: place,
        photos: [],
        userId: _userId,
      ),
    );
    if (!mounted || id == null) return;
    _selected = id;
    await _load(changed: true);
  }

  Future<void> _previous() async {
    final future = _repo.legacy();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheet) => SolidSheet(
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: MediaQuery.sizeOf(sheet).height * .72,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(18, 4, 18, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Previous saves',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w500,
                      color: RideTokens.ink,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: FutureBuilder<List<Map<String, dynamic>>>(
                      future: future,
                      builder: (context, snapshot) {
                        if (snapshot.hasError) {
                          return Center(
                            child: Text(
                              ApiResult.errorMessage(snapshot.error!),
                            ),
                          );
                        }
                        if (!snapshot.hasData) {
                          return const Center(
                            child: CircularProgressIndicator.adaptive(),
                          );
                        }
                        final places = snapshot.data!;
                        if (places.isEmpty) {
                          return const Center(
                            child: Text(
                              'No previous personal saves.',
                              style: TextStyle(color: RideTokens.muted),
                            ),
                          );
                        }
                        return ListView.separated(
                          itemCount: places.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (_, index) {
                            final place = places[index];
                            return SolidSurface(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 4,
                              ),
                              child: ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(placeName(place)),
                                subtitle: Text('${place['address'] ?? ''}'),
                                trailing: IconButton(
                                  tooltip: 'Remove saved address',
                                  icon: const Icon(Icons.delete_outline),
                                  onPressed: () => _removeLegacy(place, sheet),
                                ),
                                onTap: () {
                                  Navigator.pop(sheet);
                                  unawaited(_add(place));
                                },
                              ),
                            );
                          },
                        );
                      },
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

  Future<void> _openList() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheet) => SolidSheet(
        child: SizedBox(
          height: MediaQuery.sizeOf(sheet).height * .78,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(18, 4, 18, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Places',
                        style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                    Text(
                      '$_total',
                      style: const TextStyle(color: RideTokens.muted),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: _places.isEmpty
                      ? Center(
                          child: Text(
                            _error ?? 'No places to show.',
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: RideTokens.muted),
                          ),
                        )
                      : ListView.separated(
                          itemCount: _places.length,
                          separatorBuilder: (_, _) =>
                              const SizedBox(height: 10),
                          itemBuilder: (_, index) {
                            final place = _places[index];
                            final photo = placePhotos(place).firstOrNull;
                            return InkWell(
                              borderRadius: BorderRadius.circular(14),
                              onTap: () {
                                Navigator.pop(sheet);
                                unawaited(_open('${place['id']}'));
                              },
                              child: SolidSurface(
                                padding: const EdgeInsets.all(10),
                                child: Row(
                                  children: [
                                    SizedBox(
                                      width: 68,
                                      height: 68,
                                      child: PlacePhoto(
                                        url: photo,
                                        height: 68,
                                        showLabel: false,
                                      ),
                                    ),
                                    const SizedBox(width: 12),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            placeName(place),
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontSize: 14,
                                              fontWeight: FontWeight.w500,
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            '${place['address'] ?? ''}',
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontSize: 12,
                                              color: RideTokens.muted,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    const Icon(Icons.chevron_right),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
                if (_page * 20 < _total) ...[
                  const SizedBox(height: 10),
                  SolidButton(
                    text: 'Load more places',
                    onPressed: () {
                      Navigator.pop(sheet);
                      _change(_scope, _page + 1);
                    },
                  ),
                ],
                if (_scope == 'all') ...[
                  const SizedBox(height: 4),
                  TextButton(
                    onPressed: () {
                      Navigator.pop(sheet);
                      unawaited(_previous());
                    },
                    child: const Text('Previous personal saves'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _removeLegacy(
    Map<String, dynamic> place,
    BuildContext sheet,
  ) async {
    if (_removingLegacy) return;
    _removingLegacy = true;
    try {
      final remove = await showDialog<bool>(
        context: context,
        builder: (dialog) => AlertDialog(
          title: const Text('Remove saved address?'),
          content: Text(placeName(place)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Remove'),
            ),
          ],
        ),
      );
      if (remove != true) return;
      await _repo.removeLegacy('${place['id']}');
      if (sheet.mounted) Navigator.pop(sheet);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(ApiResult.errorMessage(error))));
      }
    } finally {
      _removingLegacy = false;
    }
  }

  Future<void> _openFilters() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheet) => SolidSheet(
        child: SafeArea(
          top: false,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(sheet).height * .8,
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(18, 4, 18, 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Filter places',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(height: 8),
                  for (final scope in {
                    'all': 'Explore all places',
                    'saved': 'Saved by me',
                    'visited': 'Visited by me',
                  }.entries)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(scope.value),
                      trailing: _scope == scope.key
                          ? const Icon(Icons.check, size: 20)
                          : null,
                      onTap: () => Navigator.pop(sheet, 'scope:${scope.key}'),
                    ),
                  const Divider(height: 16),
                  for (final entry in {
                    '': 'All place types',
                    'HOME': 'Home',
                    'WORK': 'Work',
                    'OTHER': 'Other',
                  }.entries)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(entry.value),
                      trailing: (_type ?? '') == entry.key
                          ? const Icon(Icons.check, size: 20)
                          : null,
                      onTap: () => Navigator.pop(sheet, 'type:${entry.key}'),
                    ),
                  if (_scope == 'all') ...[
                    const Divider(height: 16),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const Icon(Icons.history_outlined),
                      title: const Text('Previous personal saves'),
                      onTap: () => Navigator.pop(sheet, 'previous'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
    if (selected == null || !mounted) return;
    if (selected == 'previous') {
      unawaited(_previous());
      return;
    }
    if (selected.startsWith('scope:')) {
      _search.clear();
      _change(selected.substring(6), 1);
      return;
    }
    if (selected.startsWith('type:')) {
      _type = selected.substring(5).isEmpty ? null : selected.substring(5);
      _change(_scope, 1);
    }
  }

  Widget _filterButton() => SolidIconButton(
    icon: Icons.tune,
    tooltip: 'Filter places',
    onPressed: _openFilters,
  );

  Widget _mapSearch() => Expanded(
    child: SolidTextFormField(
      controller: _search,
      label: '',
      hint: 'Search destinations',
      showLabel: false,
      prefixIcon: const Icon(Icons.search, size: 20),
      suffixIcon: _search.text.isEmpty
          ? null
          : IconButton(
              tooltip: 'Clear search',
              onPressed: () {
                _search.clear();
                _find('');
              },
              icon: const Icon(Icons.close, size: 18),
            ),
      textInputAction: TextInputAction.search,
      onChanged: _find,
      onFieldSubmitted: (_) => FocusScope.of(context).unfocus(),
    ),
  );

  @override
  Widget build(BuildContext context) => SolidPage(
    title: 'Saved Places',
    action: IconButton(
      tooltip: 'Add a place',
      icon: const Icon(Icons.add),
      onPressed: () => _add(),
    ),
    child: LayoutBuilder(
      builder: (context, constraints) {
        final cardHeight = MediaQuery.sizeOf(context).height < 640
            ? 132.0
            : 146.0;
        final safe = MediaQuery.paddingOf(context);
        final bottomBarHeight = 48.0;
        final map = PlaceMap(
          places: _places,
          selectedId: _selected,
          onSelected: _select,
          recenter: _recenter,
          topInset: 74,
          bottomInset: cardHeight + bottomBarHeight + safe.bottom + 38,
        );
        final mapView = widget.mapBuilder?.call(map) ?? map;
        final selectedIndex = _places.indexWhere(
          (p) => '${p['id']}' == _selected,
        );
        final filterLabel = _type == null
            ? ''
            : placeType({'place_type': _type});
        return Stack(
          children: [
            Positioned.fill(child: mapView),
            Positioned(
              top: 12,
              left: 16,
              right: 16,
              child: Row(
                children: [
                  _mapSearch(),
                  const SizedBox(width: 10),
                  _filterButton(),
                ],
              ),
            ),
            if (MediaQuery.viewInsetsOf(context).bottom == 0) ...[
              Positioned(
                right: 16,
                bottom: cardHeight + bottomBarHeight + 70,
                child: SolidIconButton(
                  icon: Icons.my_location_outlined,
                  tooltip: 'Recenter map',
                  onPressed: () => setState(() => _recenter++),
                ),
              ),
              if (_places.isNotEmpty)
                Positioned(
                  right: 18,
                  bottom: cardHeight + bottomBarHeight + 22,
                  child: Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(20),
                      onTap: _openList,
                      child: const Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.list, size: 18),
                            SizedBox(width: 5),
                            Text('List', style: TextStyle(fontSize: 12)),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              if (_loading && !_loaded)
                Positioned(
                  left: 20,
                  right: 20,
                  bottom: bottomBarHeight + 12,
                  height: cardHeight,
                  child: const Center(child: PlaceCardSkeleton()),
                ),
              if (_error != null)
                Positioned(
                  left: 20,
                  right: 20,
                  bottom: bottomBarHeight + 12,
                  height: cardHeight,
                  child: Center(
                    child: SolidSurface(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              _error!,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 12,
                                color: RideTokens.ink,
                              ),
                            ),
                          ),
                          TextButton(
                            onPressed: _loading ? null : _load,
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              if (_places.isEmpty && !_loading && _error == null)
                Positioned(
                  left: 24,
                  right: 24,
                  bottom: 68,
                  child: SolidSurface(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        const Icon(Icons.place_outlined),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _query.isEmpty
                                ? 'No places in this view yet.'
                                : 'No places match this search.',
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                        TextButton(
                          onPressed: () => _add(),
                          child: const Text('Add'),
                        ),
                      ],
                    ),
                  ),
                ),
              if (selectedIndex >= 0)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: bottomBarHeight + 12,
                  child: SizedBox(
                    height: cardHeight,
                    child: PageView.builder(
                      controller: _cards,
                      itemCount: _places.length,
                      onPageChanged: (index) {
                        if (index < _places.length) {
                          setState(() => _selected = '${_places[index]['id']}');
                        }
                      },
                      itemBuilder: (_, index) => Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: PlaceCard(
                          key: ValueKey('place-${_places[index]['id']}'),
                          compact: true,
                          tilted: false,
                          place: _places[index],
                          onTap: () => _open('${_places[index]['id']}'),
                          onEdit:
                              '${_places[index]['created_by_id'] ?? ''}' ==
                                      _userId &&
                                  _userId != null
                              ? () => _edit(_places[index])
                              : null,
                        ),
                      ),
                    ),
                  ),
                ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 0,
                child: Material(
                  color: Colors.white,
                  child: SizedBox(
                    height: bottomBarHeight,
                    child: Center(
                      child: Text(
                        '$_total ${_total == 1 ? 'place' : 'places'}${filterLabel.isNotEmpty ? ' • $filterLabel' : ''}',
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: RideTokens.ink,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ],
        );
      },
    ),
  );
}

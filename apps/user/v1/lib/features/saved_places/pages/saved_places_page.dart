import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
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
  late final _repo = widget.repository ?? PlacesRepository();
  final _search = TextEditingController();
  final _cards = PageController(viewportFraction: .87);
  List<Map<String, dynamic>> _places = [];
  String _scope = 'all', _query = '';
  String? _selected, _error, _type;
  int _page = 1, _total = 0, _generation = 0, _recenter = 0;
  bool _loading = false, _loaded = false;
  bool _removingLegacy = false;
  Timer? _debounce;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void dispose() {
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
    if (_loading && !changed) return;
    final generation = ++_generation;
    setState(() {
      _loading = true;
      if (changed) {
        _places = [];
        _loaded = false;
        _error = null;
      }
    });
    try {
      final result = await _repo.list(
        page: _page,
        query: _query,
        scope: _scope,
        type: _type,
      );
      if (!mounted || generation != _generation) return;
      final rows = rideMaps(result['rows']);
      setState(() {
        _places = rows;
        _total = (rideNumber(result['total']) ?? 0).toInt();
        _selected = rows.any((p) => '${p['id']}' == _selected)
            ? _selected
            : rows.firstOrNull?['id'] as String?;
        if (changed || !_loaded) _recenter++;
        _loaded = true;
        _error = null;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted &&
            generation == _generation &&
            _cards.hasClients &&
            rows.isNotEmpty) {
          _cards.jumpToPage(
            rows
                .indexWhere((p) => '${p['id']}' == _selected)
                .clamp(0, rows.length - 1),
          );
        }
      });
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

  Future<void> _previous() async {
    final future = _repo.legacy();
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheet) => FractionallySizedBox(
        heightFactor: .75,
        child: LiquidGlassSheet(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: future,
            builder: (context, snapshot) => SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Previous saves',
                    style: TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w600,
                      color: GlassTokens.ink,
                    ),
                  ),
                  const SizedBox(height: 10),
                  const Text(
                    'Existing personal addresses are preserved here. Open one to pick its position and save it as a shared place.',
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: GlassTokens.muted,
                    ),
                  ),
                  const SizedBox(height: 18),
                  if (snapshot.hasError)
                    Text(ApiResult.errorMessage(snapshot.error!)),
                  if (!snapshot.hasData && !snapshot.hasError)
                    const PlaceCardSkeleton(),
                  if (snapshot.data?.isEmpty == true)
                    const Text('No previous personal saves.'),
                  for (final place in snapshot.data ?? <Map<String, dynamic>>[])
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: LiquidGlassSurface(
                        child: ListTile(
                          contentPadding: EdgeInsets.zero,
                          title: Text(placeName(place)),
                          subtitle: Text('${place['address']}'),
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

  void _menu() => showModalBottomSheet<void>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (sheet) => LiquidGlassSheet(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.refresh),
            title: const Text('Refresh places'),
            onTap: () {
              Navigator.pop(sheet);
              unawaited(_load());
            },
          ),
          ListTile(
            leading: const Icon(Icons.history),
            title: const Text('Previous saves'),
            onTap: () {
              Navigator.pop(sheet);
              unawaited(_previous());
            },
          ),
        ],
      ),
    ),
  );

  Future<void> _removeLegacy(
    Map<String, dynamic> place,
    BuildContext sheet,
  ) async {
    if (_removingLegacy) return;
    _removingLegacy = true;
    try {
      final remove = await showDialog<bool>(
        context: context,
        builder: (dialog) => LiquidGlassDialog(
          title: const Text('Remove saved address?'),
          content: Text(placeName(place)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialog),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialog, true),
              child: const Text('Remove address'),
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

  Future<void> _filterType() async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (sheet) => LiquidGlassSheet(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Place type',
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w600,
                  color: GlassTokens.ink,
                ),
              ),
              const SizedBox(height: 18),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final type in {
                    '': 'All types',
                    'HOME': 'Home',
                    'WORK': 'Work',
                    'OTHER': 'Other',
                  }.entries)
                    LiquidGlassChip(
                      label: type.value,
                      selected: (_type ?? '') == type.key,
                      onPressed: () => Navigator.pop(sheet, type.key),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (selected == null || !mounted) return;
    _type = selected.isEmpty ? null : selected;
    _change(_scope, 1);
  }

  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: Scaffold(
      body: LiquidGlassBackdrop(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final safe = MediaQuery.paddingOf(context);
            final compact =
                MediaQuery.sizeOf(context).height < 640 ||
                MediaQuery.textScalerOf(context).scale(14) > 20;
            final cardHeight = compact
                ? 360.0
                : math.min(290.0, math.max(150.0, constraints.maxHeight * .35));
            final map = PlaceMap(
              places: _places,
              selectedId: _selected,
              onSelected: _select,
              recenter: _recenter,
              topInset: compact ? 0 : safe.top + 180,
              bottomInset: compact ? 0 : cardHeight + safe.bottom + 70,
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
                    const SizedBox(width: 10),
                    const Expanded(
                      child: Text(
                        'Saved places',
                        style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w600,
                          color: GlassTokens.ink,
                        ),
                      ),
                    ),
                    LiquidGlassIconButton(
                      icon: Icons.add,
                      tooltip: 'Add shared place',
                      onPressed: () => _add(),
                    ),
                    const SizedBox(width: 8),
                    LiquidGlassIconButton(
                      icon: Icons.more_horiz,
                      tooltip: 'Place options',
                      onPressed: _menu,
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                LiquidGlassSurface(
                  radius: 20,
                  padding: EdgeInsets.zero,
                  child: TextField(
                    controller: _search,
                    key: const ValueKey('place-search'),
                    decoration: InputDecoration(
                      hintText: 'Search shared places',
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              tooltip: 'Clear place search',
                              onPressed: () {
                                _search.clear();
                                _find('');
                              },
                              icon: const Icon(Icons.close),
                            ),
                    ),
                    onChanged: _find,
                    onSubmitted: (_) {
                      FocusScope.of(context).unfocus();
                      _change(_scope, 1);
                    },
                  ),
                ),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final item in {
                        'all': 'Explore',
                        'saved': 'Saved',
                        'visited': 'Visited',
                      }.entries)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: LiquidGlassChip(
                            label: item.value,
                            selected: _scope == item.key,
                            onPressed: () => _change(item.key, 1),
                          ),
                        ),
                      LiquidGlassChip(
                        label: _type == null
                            ? 'Place type'
                            : placeType({'place_type': _type}),
                        icon: Icons.tune,
                        onPressed: _filterType,
                        onDeleted: _type == null
                            ? null
                            : () {
                                _type = null;
                                _change(_scope, 1);
                              },
                      ),
                    ],
                  ),
                ),
              ],
            );
            final results = Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
                    child: LiquidGlassSurface(
                      padding: const EdgeInsets.all(12),
                      child: TextButton(
                        onPressed: _loading ? null : _load,
                        child: Text(
                          '${_loaded ? 'Showing saved results. ' : ''}$_error · Retry',
                        ),
                      ),
                    ),
                  ),
                if (_loading && !_loaded)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 26),
                    child: SizedBox(
                      height: cardHeight,
                      child: const SingleChildScrollView(
                        child: PlaceCardSkeleton(),
                      ),
                    ),
                  )
                else if (_places.isEmpty && _error == null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 26),
                    child: LiquidGlassSurface(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.place_outlined,
                            size: 30,
                            color: GlassTokens.accent,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _query.isEmpty
                                ? 'No ${_scope == 'all' ? 'shared' : _scope} places yet'
                                : 'No places match',
                            style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w600,
                              color: GlassTokens.ink,
                            ),
                          ),
                          TextButton(
                            onPressed: () => _add(),
                            child: const Text('Pick a place on the map'),
                          ),
                        ],
                      ),
                    ),
                  )
                else if (_places.isNotEmpty)
                  SizedBox(
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
                          place: _places[index],
                          onTap: () => _open('${_places[index]['id']}'),
                        ),
                      ),
                    ),
                  ),
                if (_places.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(
                      top: 10,
                      left: 20,
                      right: 20,
                    ),
                    child: LiquidGlassSurface(
                      radius: 18,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 2,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          IconButton(
                            tooltip: 'Previous places page',
                            onPressed: _page > 1 && !_loading
                                ? () => _change(_scope, _page - 1)
                                : null,
                            icon: const Icon(Icons.chevron_left),
                          ),
                          Flexible(
                            child: Text(
                              _loading
                                  ? 'Updating places…'
                                  : '${(_page - 1) * 20 + 1}–${(_page - 1) * 20 + _places.length} of $_total places',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontSize: 12,
                                color: GlassTokens.ink,
                              ),
                            ),
                          ),
                          IconButton(
                            tooltip: 'Next places page',
                            onPressed: _page * 20 < _total && !_loading
                                ? () => _change(_scope, _page + 1)
                                : null,
                            icon: const Icon(Icons.chevron_right),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            );
            final mapView = widget.mapBuilder?.call(map) ?? map;
            final center = LiquidGlassIconButton(
              icon: Icons.center_focus_strong,
              tooltip: 'Show visible place pins',
              onPressed: () => setState(() => _recenter++),
            );
            if (compact) {
              return SafeArea(
                child: SingleChildScrollView(
                  child: Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 10, 20, 16),
                        child: header,
                      ),
                      SizedBox(
                        height: 280,
                        child: Stack(
                          children: [
                            Positioned.fill(child: mapView),
                            Positioned(right: 20, bottom: 12, child: center),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      results,
                      const SizedBox(height: 20),
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
                if (MediaQuery.viewInsetsOf(context).bottom == 0) ...[
                  Positioned(
                    right: 20,
                    bottom: safe.bottom + cardHeight + 76,
                    child: center,
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: safe.bottom + 14,
                    child: results,
                  ),
                ],
              ],
            );
          },
        ),
      ),
    ),
  );
}

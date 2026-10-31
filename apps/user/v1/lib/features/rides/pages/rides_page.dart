import 'package:user/components/ui/glass_chip.dart';
import 'package:user/features/rides/widgets/ride_history_filters.dart';
import 'package:user/features/rides/ride_detail_intent.dart';
import 'package:user/features/rides/widgets/trip_safety_sheet.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/route_observer.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class RidesPage extends StatefulWidget {
  final UserAppRepository? repository;
  const RidesPage({super.key, this.repository});
  @override
  State<RidesPage> createState() => _RidesState();
}

class _RidesState extends State<RidesPage>
    with WidgetsBindingObserver, RouteAware {
  late final _repo = widget.repository ?? UserAppRepository();
  Map<String, dynamic>? _data;
  String _section = 'all';
  int _page = 1;
  String? _error;
  final _search = TextEditingController();
  Timer? _debounce;
  int _request = 0;
  String _query = '';
  RideHistoryFilter _filters = const RideHistoryFilter();
  bool _loading = false;
  ModalRoute<dynamic>? _route;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final route = ModalRoute.of(context);
    if (_route != route) {
      appRouteObserver.unsubscribe(this);
      _route = route;
      if (route != null) appRouteObserver.subscribe(this, route);
    }
  }

  @override
  void didPopNext() => unawaited(_load());
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _route?.isCurrent == true) {
      unawaited(_load());
    }
  }

  Future<void> _load({bool replace = false}) async {
    if ((_loading && !replace) || !mounted) return;
    final request = ++_request;
    setState(() => _loading = true);
    try {
      final data = await _repo.riderHistory(
        page: _page,
        section: _section,
        query: _query,
        categoryId: _filters.categoryId,
        month: _filters.month,
      );
      if (mounted && request == _request) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted && request == _request) {
        setState(() => _error = ApiResult.errorMessage(e));
      }
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  void _change(String section, int page) {
    _debounce?.cancel();
    setState(() {
      _section = section;
      _page = page;
      _data = null;
      _error = null;
    });
    unawaited(_load(replace: true));
  }

  void _searchChanged(String value) {
    _debounce?.cancel();
    setState(() {
      _query = value.trim();
      _page = 1;
      _data = null;
      _error = null;
      _loading = true;
      _request++;
    });
    _debounce = Timer(
      const Duration(milliseconds: 400),
      () => unawaited(_load(replace: true)),
    );
  }

  Future<void> _filter() async {
    final selected = await showModalBottomSheet<RideHistoryFilter>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (_) => FractionallySizedBox(
        heightFactor: .85,
        child: RideHistoryFilters(repository: _repo, initial: _filters),
      ),
    );
    if (selected == null || !mounted) return;
    _filters = selected;
    _change(_section, 1);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    appRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppPage(
    glass: true,
    title: 'My rides',
    action: Wrap(
      children: [
        IconButton(
          tooltip: 'Filter rides',
          onPressed: _filter,
          icon: const Icon(Icons.tune),
        ),
        IconButton(
          tooltip: 'Refresh rides',
          onPressed: _loading ? null : _load,
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    child: RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.only(bottom: 28),
        children: [
          if (_data?['counts'] is Map)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                '${rideMap(_data!['counts'])['all']} ${_query.isNotEmpty || _filters.categoryId != null || _filters.month != null ? 'matching ride requests' : 'recorded ride requests'}',
                style: const TextStyle(fontSize: 12, color: GlassTokens.muted),
              ),
            ),
          LiquidGlassSurface(
            padding: const EdgeInsets.all(6),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final item in {
                    'all': 'All',
                    'active': 'Active',
                    'past': 'Past',
                    'completed': 'Completed',
                    'cancelled': 'Cancelled',
                    'unfulfilled': 'Unfulfilled',
                  }.entries)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: LiquidGlassChip(
                        label:
                            '${item.value}${rideMap(_data?['counts'])[item.key] is num ? ' (${rideMap(_data?['counts'])[item.key]})' : ''}',
                        selected: _section == item.key,
                        onPressed: () => _change(item.key, 1),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          LiquidGlassSurface(
            padding: EdgeInsets.zero,
            radius: 20,
            child: TextField(
              key: const ValueKey('ride-history-search'),
              controller: _search,
              decoration: InputDecoration(
                labelText: 'Search destination, pickup or trip ID',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _search.text.isEmpty
                    ? null
                    : IconButton(
                        tooltip: 'Clear ride search',
                        icon: const Icon(Icons.close),
                        onPressed: () {
                          _search.clear();
                          _query = '';
                          _change(_section, 1);
                        },
                      ),
              ),
              onChanged: _searchChanged,
              onSubmitted: (_) => _change(_section, 1),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              LiquidGlassChip(
                icon: Icons.tune,
                label: 'Date / category',
                onPressed: _filter,
              ),
              if (_filters.categoryId != null)
                LiquidGlassChip(
                  label: _filters.categoryName ?? 'Selected category',
                  onDeleted: () {
                    _filters = RideHistoryFilter(month: _filters.month);
                    _change(_section, 1);
                  },
                ),
              if (_filters.month != null)
                LiquidGlassChip(
                  label: rideMonthLabel(_filters.month!),
                  onDeleted: () {
                    _filters = RideHistoryFilter(
                      categoryId: _filters.categoryId,
                      categoryName: _filters.categoryName,
                    );
                    _change(_section, 1);
                  },
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (_loading && _data != null)
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                'Updating rides...',
                style: TextStyle(fontSize: 12, color: GlassTokens.muted),
              ),
            ),
          if (_error != null && _data != null)
            LiquidGlassSurface(
              margin: const EdgeInsets.only(bottom: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Showing your last loaded rides.',
                    style: TextStyle(fontSize: 13, color: GlassTokens.muted),
                  ),
                  TextButton(
                    onPressed: _loading ? null : _load,
                    child: Text('$_error - Retry'),
                  ),
                ],
              ),
            ),
          if (_data == null) ...[
            if (_loading)
              const RidesSkeleton(embedded: true)
            else
              AppLoadError(
                message: _error ?? 'Rides unavailable',
                onRetry: _load,
              ),
          ] else ...[
            if (rideMaps(_data!['rows']).isEmpty)
              LiquidGlassSurface(
                child: AppEmptyState(
                  icon: Icons.history,
                  title: _section == 'active'
                      ? 'No active rides'
                      : 'No rides match',
                  subtitle:
                      'Try another search or filter. Unbooked quotes are not included.',
                ),
              ),
            for (final ride in rideMaps(_data!['rows']))
              RideHistoryCard(
                key: ValueKey('ride-${ride['id']}'),
                ride: ride,
                onTap: () => Navigator.pushNamed(
                  context,
                  AppRoutes.rideDetail,
                  arguments: ride['id'],
                ),
                onRebook:
                    ridePoint(
                              ride['pickup_latitude'],
                              ride['pickup_longitude'],
                            ) ==
                            null ||
                        ridePoint(
                              ride['dropoff_latitude'],
                              ride['dropoff_longitude'],
                            ) ==
                            null
                    ? null
                    : () => Navigator.pushNamedAndRemoveUntil(
                        context,
                        AppRoutes.home,
                        (_) => false,
                        arguments: {'rebook': ride},
                      ),
                onReceipt: () => Navigator.pushNamed(
                  context,
                  AppRoutes.rideDetail,
                  arguments: RideDetailIntent('${ride['id']}', receipt: true),
                ),
                onHelp: () => showModalBottomSheet<void>(
                  context: context,
                  isScrollControlled: true,
                  useSafeArea: true,
                  backgroundColor: Colors.transparent,
                  builder: (_) => FractionallySizedBox(
                    heightFactor: .88,
                    child: LiquidGlassSheet(
                      child: TripSafetySheet(trip: ride, repository: _repo),
                    ),
                  ),
                ),
              ),
            if ((_data!['total'] as num) > 0)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Column(
                  children: [
                    Wrap(
                      alignment: WrapAlignment.center,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      spacing: 8,
                      children: [
                        TextButton(
                          onPressed: _loading || _page <= 1
                              ? null
                              : () => _change(_section, _page - 1),
                          child: const Text('Previous'),
                        ),
                        Text(
                          'Page ${_data!['page']}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: GlassTokens.muted,
                          ),
                        ),
                        TextButton(
                          onPressed:
                              _loading ||
                                  _page * (_data!['page_size'] as num) >=
                                      (_data!['total'] as num)
                              ? null
                              : () => _change(_section, _page + 1),
                          child: const Text('Next'),
                        ),
                      ],
                    ),
                    Text(
                      'Showing ${(_page - 1) * (_data!['page_size'] as num) + 1}-${((_page - 1) * (_data!['page_size'] as num) + rideMaps(_data!['rows']).length).clamp(0, (_data!['total'] as num))} of ${_data!['total']} journeys',
                      style: const TextStyle(
                        fontSize: 12,
                        color: GlassTokens.muted,
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    ),
  );
}

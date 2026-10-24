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

  Future<void> _load() async {
    if (_loading || !mounted) return;
    setState(() => _loading = true);
    try {
      final data = await _repo.riderHistory(page: _page, section: _section);
      if (mounted) {
        setState(() {
          _data = data;
          _error = null;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _change(String section, int page) {
    if (_loading) return;
    setState(() {
      _section = section;
      _page = page;
      _data = null;
      _error = null;
    });
    unawaited(_load());
  }

  @override
  void dispose() {
    appRouteObserver.unsubscribe(this);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AppPage(
    title: 'Your rides',
    child: Column(
      children: [
        Wrap(
          spacing: 8,
          children: [
            for (final item in {
              'all': 'All',
              'active': 'Active',
              'past': 'Past',
            }.entries)
              ChoiceChip(
                label: Text(item.value),
                selected: _section == item.key,
                onSelected: _loading ? null : (_) => _change(item.key, 1),
              ),
          ],
        ),
        if (_loading && _data != null) const LinearProgressIndicator(),
        if (_error != null && _data != null)
          TextButton(onPressed: _load, child: Text('$_error · Retry')),
        Expanded(
          child: _data == null
              ? (_loading
                    ? const Center(child: CircularProgressIndicator())
                    : AppLoadError(
                        message: _error ?? 'Rides unavailable',
                        onRetry: _load,
                      ))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.only(bottom: 20),
                    children: [
                      if (rideMaps(_data!['rows']).isEmpty)
                        AppEmptyState(
                          icon: Icons.history,
                          title: _section == 'active'
                              ? 'No active rides'
                              : 'No rides here yet',
                          subtitle:
                              'Your confirmed ride requests will appear here. Unbooked quotes are not included.',
                        ),
                      for (final ride in rideMaps(_data!['rows']))
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: AppCard(
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                riderStatusLabel('${ride['status']}'),
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              subtitle: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${ride['pickup_address']}\n${ride['dropoff_address']}',
                                    maxLines: 4,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(
                                    '${rideTime(ride['created_at'])} · ${rideMoney(ride['final_fare'] ?? ride['estimated_fare'])}',
                                  ),
                                  if (ride['payment'] != null)
                                    Text(
                                      ridePaymentLabel(
                                        rideMap(ride['payment'])['status'],
                                      ),
                                    ),
                                ],
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => Navigator.pushNamed(
                                context,
                                AppRoutes.rideDetail,
                                arguments: ride['id'],
                              ),
                            ),
                          ),
                        ),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          TextButton(
                            onPressed: _loading || _page <= 1
                                ? null
                                : () => _change(_section, _page - 1),
                            child: const Text('Previous'),
                          ),
                          Text('Page ${_data!['page']}'),
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
                    ],
                  ),
                ),
        ),
      ],
    ),
  );
}

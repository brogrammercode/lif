import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'ride_detail_page.dart';
import 'package:user/features/rides/controllers/ride_history_controller.dart';
import 'package:user/features/rides/ride_detail_intent.dart';
import 'package:user/features/rides/widgets/ride_history_layout.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class RidesPage extends StatefulWidget {
  final UserAppRepository? repository;
  final DriverOperationsRepository? operationsRepository;
  const RidesPage({super.key, this.repository, this.operationsRepository});
  @override
  State<RidesPage> createState() => _RidesState();
}

class _RidesState extends State<RidesPage> with WidgetsBindingObserver {
  late final _controller = RideHistoryController(
    widget.repository ?? UserAppRepository(),
  )..addListener(_controllerChanged);
  void _controllerChanged() {
    if (mounted) setState(() {});
  }

  UserAppRepository get _repo => _controller.repo;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        ModalRoute.isCurrentOf(context) == true) {
      unawaited(_load());
    }
  }

  Future<void> _load() => _controller.load();

  bool _onScroll(ScrollNotification notification) {
    if (notification.depth != 0 ||
        notification.metrics.axis != Axis.vertical ||
        notification.metrics.extentAfter > 320) {
      return false;
    }
    final forward = switch (notification) {
      ScrollUpdateNotification(:final scrollDelta) => (scrollDelta ?? 0) > 0,
      OverscrollNotification(:final overscroll) => overscroll > 0,
      _ => false,
    };
    if (forward) unawaited(_controller.loadMore());
    return false;
  }

  @override
  void dispose() {
    _controller.removeListener(_controllerChanged);
    _controller.dispose();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final rides = _controller.rides;
    final active = rides?.where(
      (ride) => riderActiveStatuses.contains(ride['status']),
    );
    final past = rides?.where(
      (ride) => !riderActiveStatuses.contains(ride['status']),
    );
    final error = _controller.error;
    return SolidPage(
      bodyColor: const Color(0xFFF6F7F8),
      title: 'My rides',
      child: RefreshIndicator(
        onRefresh: _load,
        child: NotificationListener<ScrollNotification>(
          onNotification: _onScroll,
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(12, 14, 12, 24),
            children: [
              if (rides == null && error == null)
                const RidesSkeleton(embedded: true),
              if (rides?.isEmpty == true && error == null)
                const Center(child: Text('No rides yet')),
              if (active?.isNotEmpty == true) ...[
                const RideHistoryHeading('Active rides'),
                for (final ride in active!) _rideCard(ride),
              ],
              if (past?.isNotEmpty == true) ...[
                const RideHistoryHeading('Past rides'),
                for (final ride in past!) _rideCard(ride),
              ],
              if (error != null)
                AppLoadError(message: error, onRetry: _controller.retry),
            ],
          ),
        ),
      ),
    );
  }

  Widget _rideCard(Map<String, dynamic> ride) => RideHistoryCard(
    key: ValueKey('ride-${ride['id']}'),
    ride: ride,
    onTap: () => _openRide('${ride['id']}'),
  );

  Future<void> _openRide(String id) async {
    final resume = await showRideHistorySheet(
      context,
      rideId: id,
      repository: _repo,
      operationsRepository: widget.operationsRepository,
    );
    if (!mounted) return;
    if (resume == true) {
      await Navigator.pushNamed(
        context,
        AppRoutes.rideDetail,
        arguments: RideDetailIntent(id, liveJourney: true),
      );
      if (mounted) unawaited(_load());
    }
  }
}

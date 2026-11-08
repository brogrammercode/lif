import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class RiderTripController extends FeatureController {
  final UserAppRepository repository;
  final DriverOperationsRepository ops;
  RiderTripController({required this.repository, required this.ops});
  String? id, error, routeError;
  Map<String, dynamic>? data, routeData;
  Map<String, dynamic> get trip => rideMap(data?['trip']);
  String get status => '${data?['status'] ?? ''}';
  bool get active => riderActiveStatuses.contains(status);
  bool get locationFresh {
    final captured = DateTime.tryParse(
      '${rideMap(data?['driver_location'])['captured_at']}',
    );
    final maxAge =
        rideNumber(rideMap(data?['settings'])['location_max_age_s']) ?? 60;
    return data?['driver_location_fresh'] == true &&
        captured != null &&
        now.difference(captured).inSeconds >= -10 &&
        now.difference(captured).inSeconds <= maxAge;
  }

  bool get routeFresh {
    final captured = DateTime.tryParse('${routeData?['captured_at']}');
    final maxAge =
        rideNumber(rideMap(data?['settings'])['location_max_age_s']) ?? 60;
    return routeData?['target'] ==
            (status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP') &&
        captured != null &&
        now.difference(captured).inSeconds >= -10 &&
        now.difference(captured).inSeconds <= maxAge &&
        lastRouteRequest != null &&
        DateTime.now().difference(lastRouteRequest!).inSeconds < 60;
  }

  bool get needsRoute =>
      ['DRIVER_ASSIGNED', 'DRIVER_ARRIVING', 'IN_PROGRESS'].contains(status);
  bool reading = false, busy = false, routing = false;
  bool liveJourney = false;
  Completer<void>? readDone;
  DateTime? checked, serverTime, lastRouteRequest;
  final clock = Stopwatch();
  List<LatLng> basePoints = [], remainingPoints = [];
  DateTime get now => (serverTime ?? DateTime.now()).add(clock.elapsed);
  bool get pollNeeded =>
      data == null ||
      active ||
      [
        'REQUESTED',
        'DISPUTED',
        'APPROVED',
      ].contains(rideMap(data?['review'])['status']) ||
      (status == 'COMPLETED' &&
          ![
            'CAPTURED',
            'CANCELLED',
            'REFUNDED',
            'PARTIALLY_REFUNDED',
          ].contains(rideMap(data?['payment'])['status']));

  Timer? _poll, _tick;
  bool _visible = true;
  Listenable? _source;
  void open(
    String tripId, {
    Listenable? source,
    bool livePresentation = false,
  }) {
    if (id != null) return;
    id = tripId;
    liveJourney = livePresentation;
    _source = source;
    source?.addListener(_sourceChanged);
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      if (_visible && !busy && pollNeeded) unawaited(load());
    });
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_visible && active) changed();
    });
    unawaited(load());
  }

  void _sourceChanged() {
    if (_visible) unawaited(load());
  }

  void setVisible(bool value) {
    _visible = value;
    if (value) unawaited(load());
  }

  Future<void> load() async {
    if (reading || isDisposed || id == null) return;
    update(() => reading = true);
    final done = readDone = Completer<void>();
    try {
      final data = await ops.context(id!);
      if (data['is_driver'] != false ||
          data['trip'] is! Map ||
          !riderTripStatuses.contains(data['status']) ||
          rideMap(data['trip'])['id'] != id ||
          rideMap(data['trip'])['status'] != data['status'] ||
          '${data['ride_id']}' != id) {
        throw StateError('This ride is not available to your rider account.');
      }
      if (isDisposed) return;
      update(() {
        this.data = data;
        liveJourney =
            liveJourney || riderActiveStatuses.contains(data['status']);
        error = null;
        checked = DateTime.now();
        serverTime =
            DateTime.tryParse('${data['server_time']}') ?? DateTime.now();
        clock
          ..reset()
          ..start();
        if (basePoints.isEmpty) {
          basePoints = rideGeometry(
            rideMap(rideMap(trip['route'])['route_data'])['geometry'],
          );
        }
        if (!needsRoute ||
            !locationFresh ||
            routeData?['target'] !=
                (status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP')) {
          routeData = null;
          remainingPoints = [];
        }
      });
      if (needsRoute && locationFresh) {
        unawaited(refreshRoute());
      }
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
    } finally {
      if (!isDisposed) {
        update(() => reading = false);
      } else {
        reading = false;
      }
      done.complete();
      readDone = null;
    }
  }

  Future<void> refresh() async {
    await readDone?.future;
    if (!isDisposed) await load();
  }

  Future<void> refreshRoute({bool force = false}) async {
    if (!needsRoute || routing || !locationFresh) {
      return;
    }
    final target = status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP';
    if (!force &&
        routeData?['target'] == target &&
        lastRouteRequest != null &&
        DateTime.now().difference(lastRouteRequest!).inSeconds < 30) {
      return;
    }
    if (routeData?['target'] != target) {
      routeData = null;
      remainingPoints = [];
    }
    routing = true;
    lastRouteRequest = DateTime.now();
    try {
      final route = await ops.riderRoute(id!);
      if (isDisposed ||
          !needsRoute ||
          (status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP') != target) {
        return;
      }
      final points = rideGeometry(route['geometry']);
      if (route['target'] != target ||
          points.length < 2 ||
          rideNumber(route['distance_m']) == null ||
          rideNumber(route['distance_m'])! < 0 ||
          rideNumber(route['duration_s']) == null ||
          rideNumber(route['duration_s'])! <= 0) {
        throw StateError('Route progress could not be verified. Please retry.');
      }
      update(() {
        routeData = route;
        remainingPoints = points;
        routeError = null;
      });
    } catch (e) {
      if (!isDisposed) {
        update(() {
          routeError = ApiResult.errorMessage(e);
          routeData = null;
          remainingPoints = [];
        });
      }
    } finally {
      routing = false;
      if (!isDisposed &&
          needsRoute &&
          (status == 'IN_PROGRESS' ? 'DROPOFF' : 'PICKUP') != target) {
        unawaited(refreshRoute(force: true));
      }
    }
  }

  Future<void> perform(Future<void> Function() action) async {
    if (busy || isDisposed) return;
    update(() => busy = true);
    try {
      await readDone?.future;
      if (!isDisposed) await action();
    } finally {
      if (!isDisposed) {
        await load();
        update(() => busy = false);
      }
    }
  }

  Future<void> cancel(String reason, String code) =>
      perform(() => ops.issue(id!, 'CANCELLATION', reason, reasonCode: code));
  Future<void> confirm() => perform(() => repository.confirmRideStart(id!));
  Future<void> rate(int score, String? comment) => perform(
    () => repository.review(
      id!,
      '${rideMap(trip['driver'])['user_id']}',
      score,
      comment,
    ),
  );
  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    clock.stop();
    _source?.removeListener(_sourceChanged);
    super.dispose();
  }
}

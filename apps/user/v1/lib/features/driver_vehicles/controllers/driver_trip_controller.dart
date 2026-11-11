import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/driver_operations/driver_tracking.service.dart';
import 'package:user/features/driver_operations/navigation_progress.dart';
import 'package:user/features/rides/ride_display.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverTripController extends FeatureController {
  DriverTripController(this.ops, this.tracking);
  bool get active => [
    'DRIVER_ASSIGNED',
    'DRIVER_ARRIVING',
    'DRIVER_WAITING',
    'IN_PROGRESS',
  ].contains(trip?['status']);
  String? get target => !active
      ? null
      : trip!['status'] == 'IN_PROGRESS'
      ? 'DROPOFF'
      : 'PICKUP';
  final DriverOperationsRepository ops;
  final DriverTrackingService tracking;
  String? id, error, navError, navTarget, offersError;
  Map<String, dynamic>? trip, context;
  List<Map<String, dynamic>> offers = [];
  List<LatLng> points = [];
  List<Map<String, dynamic>> steps = [];
  NavigationProgress? progress;
  bool get canComplete {
    final total = rideNumber(trip?['estimated_distance_m']);
    final remaining = progress?.remainingMetres;
    return points.length >= 2 &&
        progress?.offRouteMetres.isFinite == true &&
        trip?['status'] == 'IN_PROGRESS' &&
        total != null &&
        total > 0 &&
        remaining != null &&
        remaining >= 0 &&
        remaining / total < .1;
  }

  Completer<void>? readDone;
  DateTime? lastNavigation;
  bool loading = false,
      busy = false,
      readingOffers = false,
      navigating = false,
      foreground = true,
      follow = true;
  void updatePosition() {
    final fix = tracking.position.value;
    if (isDisposed || !active || fix == null) return;
    update(
      () => progress = NavigationProgress.calculate(
        LatLng(fix.latitude, fix.longitude),
        points,
        steps,
      ),
    );
    unawaited(navigation());
  }

  Future<void> load() async {
    if (loading || isDisposed || id == null) return;
    loading = true;
    final readDone = this.readDone = Completer<void>();
    try {
      final data = await ops.context(id!);
      if (data['is_driver'] != true ||
          data['trip'] is! Map ||
          !riderTripStatuses.contains(data['status']) ||
          rideMap(data['trip'])['id'] != id ||
          rideMap(data['trip'])['status'] != data['status'] ||
          data['ride_id'] != id) {
        throw StateError('This trip is not available to your driver account.');
      }
      final trip = rideMap(data['trip']);
      if (trip.isEmpty) {
        throw const FormatException('The server returned invalid trip data.');
      }
      if (isDisposed) return;
      update(() {
        this.trip = trip;
        context = data;
        error = null;
        // Invalidate pickup directions before awaiting GPS or a pending route.
        if (target != navTarget || !active) {
          points = [];
          steps = [];
          progress = null;
          navError = null;
          lastNavigation = null;
        }
      });
      try {
        await tracking.syncTrip(
          activeTrip: active || context?['driver_has_active_trip'] == true,
          availability: context?['driver_availability'] as String?,
        );
      } catch (e) {
        if (!isDisposed) update(() => navError = ApiResult.errorMessage(e));
      }
      if (active) unawaited(navigation());
      if (this.trip?['status'] == 'IN_PROGRESS') {
        unawaited(refreshOffers());
      }
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
    } finally {
      loading = false;
      readDone.complete();
      this.readDone = null;
    }
  }

  Future<void> refreshOffers() async {
    if (readingOffers || isDisposed || trip?['status'] != 'IN_PROGRESS') return;
    readingOffers = true;
    try {
      final dash = await ops.dashboard();
      if (isDisposed || trip?['status'] != 'IN_PROGRESS') return;
      update(() {
        offers = rideMaps(
          dash['offers'],
        ).where((offer) => rideMap(offer['ride']).isNotEmpty).toList();
        offersError = null;
      });
    } catch (e) {
      if (!isDisposed && trip?['status'] == 'IN_PROGRESS') {
        update(() {
          offers = [];
          offersError = ApiResult.errorMessage(e);
        });
      }
    } finally {
      readingOffers = false;
    }
  }

  Future<void> navigation({bool force = false}) async {
    final fix = tracking.position.value;
    if (isDisposed || !active || fix == null || navigating) return;
    final target = this.target!;
    if (!force &&
        target == navTarget &&
        lastNavigation != null &&
        DateTime.now().difference(lastNavigation!).inSeconds < 15) {
      return;
    }
    if (!force &&
        target == navTarget &&
        points.isNotEmpty &&
        (progress?.offRouteMetres ?? 0) < 60) {
      return;
    }
    if (navTarget != target) {
      points = [];
      steps = [];
      progress = null;
    }
    navTarget = target;
    navigating = true;
    lastNavigation = DateTime.now();
    try {
      final route = await ops.navigation(id!, fix.latitude, fix.longitude);
      if (isDisposed || this.target != target) {
        return;
      }
      if (route['target'] != null && route['target'] != target) {
        throw StateError('Trip destination changed. Refreshing trip status.');
      }
      final points = rideGeometry(route['geometry']);
      if (points.length < 2) {
        throw StateError('Route geometry is unavailable. Retry navigation.');
      }
      final steps = rideMaps(route['steps']);
      update(() {
        this.points = points;
        this.steps = steps;
        navTarget = target;
        navError = steps.isEmpty
            ? 'Turn instructions are unavailable for this route. Retry navigation.'
            : null;
        progress = NavigationProgress.calculate(
          LatLng(fix.latitude, fix.longitude),
          points,
          steps,
        );
      });
    } catch (e) {
      if (!isDisposed && this.target == target) {
        update(() => navError = ApiResult.errorMessage(e));
      }
    } finally {
      navigating = false;
      if (!isDisposed && active && this.target != target) {
        unawaited(navigation(force: true));
      }
    }
  }
}

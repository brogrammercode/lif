import 'package:user/core/network/api_result.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns the driver's history records and incremental pagination state.
class DriverTripsController extends FeatureController {
  DriverTripsController(this.repo);

  final UserAppRepository repo;
  List<Map<String, dynamic>>? rides;
  String? error;
  bool loading = false;
  bool _hasMore = false;
  int _page = 0;
  int _failedPage = 1;

  Future<void> load() => _fetch(page: 1);
  Future<void> retry() => _fetch(page: _failedPage);

  Future<void> loadMore() async {
    if (_hasMore && error == null) await _fetch(page: _page + 1);
  }

  Future<void> _fetch({required int page}) async {
    if (loading || isDisposed) return;
    update(() => loading = true);
    try {
      final data = await repo.driverRides(page: page);
      final incoming = rideMaps(data['rows']);
      final pageSize = rideNumber(data['page_size']);
      final total = rideNumber(data['total']);
      update(() {
        final previous = page == 1 ? const <Map<String, dynamic>>[] : rides!;
        rides = {
          for (final ride in previous) ride['id']: ride,
          for (final ride in incoming) ride['id']: ride,
        }.values.toList();
        _page = page;
        _hasMore =
            incoming.isNotEmpty &&
            pageSize != null &&
            pageSize > 0 &&
            total != null &&
            page * pageSize < total;
        error = null;
      });
    } catch (e) {
      update(() {
        _failedPage = page;
        error = ApiResult.errorMessage(e);
      });
    } finally {
      update(() => loading = false);
    }
  }
}

import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/rides/ride_history_filter.dart';
import 'dart:async';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class RideHistoryController extends FeatureController {
  RideHistoryController(this.repo);
  final UserAppRepository repo;
  Map<String, dynamic>? data;
  String section = 'all';
  int page = 1;
  String? error;
  int request = 0;
  String query = '';
  RideHistoryFilter filters = const RideHistoryFilter();
  bool loading = false;
  Future<void> load({bool replace = false}) async {
    if ((loading && !replace) || isDisposed) return;
    final request = ++this.request;
    update(() => loading = true);
    try {
      final data = await repo.riderHistory(
        page: page,
        section: section,
        query: query,
        categoryId: filters.categoryId,
        month: filters.month,
      );
      if (!isDisposed && request == this.request) {
        update(() {
          this.data = data;
          error = null;
        });
      }
    } catch (e) {
      if (!isDisposed && request == this.request) {
        update(() => error = ApiResult.errorMessage(e));
      }
    } finally {
      if (!isDisposed && request == this.request) update(() => loading = false);
    }
  }
}

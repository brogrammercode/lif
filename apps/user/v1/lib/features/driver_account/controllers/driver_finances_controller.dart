import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_account/driver_account.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverFinancesController extends FeatureController {
  DriverFinancesController(this.repo);
  final DriverAccountRepository repo;
  Map<String, dynamic>? data;
  String? error, from, to;
  String section = 'trips';
  int page = 1;
  bool loading = false;
  Future<void> load() async {
    if (loading || isDisposed) return;
    update(() => loading = true);
    try {
      final v = await repo.finances(
        from: from,
        to: to,
        page: page,
        section: section,
      );
      if (!isDisposed) {
        update(() {
          data = v;
          error = null;
        });
      }
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
    } finally {
      if (!isDisposed) update(() => loading = false);
    }
  }
}

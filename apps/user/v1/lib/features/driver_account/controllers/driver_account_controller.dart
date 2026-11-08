import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_account/driver_account.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverAccountController extends FeatureController {
  DriverAccountController(this.repo);
  final DriverAccountRepository repo;
  Map<String, dynamic>? data, requests;
  String? error;
  int tab = 0, page = 1;
  bool loading = false, busy = false;
  Future<void> load() async {
    if (loading || isDisposed) return;
    update(() => loading = true);
    try {
      final data = await repo.account();
      if (isDisposed) return;
      update(() => this.data = data);
      final requests = tab == 2 ? await repo.requests(page: page) : null;
      if (isDisposed) return;
      update(() {
        this.data = data;
        this.requests = requests;
        error = null;
      });
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
    } finally {
      if (!isDisposed) update(() => loading = false);
    }
  }
}

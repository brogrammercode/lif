import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class NotificationsController extends FeatureController {
  NotificationsController(this.repository);
  String? notice;
  final UserAppRepository repository;
  List<Map<String, dynamic>> items = const [];
  Object? error;
  bool loading = true;
  int generation = 0;
  String filter = 'ALL';
  Future<void> load({bool preserve = false}) async {
    final generation = ++this.generation;
    if (!preserve && !isDisposed) update(() => loading = true);
    try {
      final value = await repository.notifications();
      if (isDisposed || generation != this.generation) return;
      update(() {
        items = value;
        error = null;
        loading = false;
      });
    } catch (error) {
      if (isDisposed || generation != this.generation) return;
      if (preserve && items.isNotEmpty) {
        notice = ApiResult.errorMessage(error);
        return;
      }
      update(() {
        this.error = error;
        loading = false;
      });
    }
  }
}

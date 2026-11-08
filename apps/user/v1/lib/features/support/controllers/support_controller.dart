import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class SupportController extends FeatureController {
  SupportController(this.repository);
  String? notice;
  final UserAppRepository repository;
  List<Map<String, dynamic>> tickets = const [];
  Object? error;
  bool loading = true;
  int generation = 0;
  Future<void> load({bool preserve = false}) async {
    final generation = ++this.generation;
    if (!preserve && !isDisposed) update(() => loading = true);
    try {
      final value = await repository.supportTickets();
      if (isDisposed || generation != this.generation) return;
      update(() {
        tickets = value;
        error = null;
        loading = false;
      });
    } catch (error) {
      if (isDisposed || generation != this.generation) return;
      if (preserve && tickets.isNotEmpty) {
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

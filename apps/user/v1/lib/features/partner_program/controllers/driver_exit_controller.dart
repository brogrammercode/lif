import 'package:user/core/state/feature_controller.dart';
import 'dart:async';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/partner_program/partner_program.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverExitController extends FeatureController {
  DriverExitController(this.repo);
  final PartnerProgramRepository repo;
  Map<String, dynamic>? request;
  String? error;
  bool loading = true;
  bool saving = false;
  bool refreshing = false;
  int loadRevision = 0;
  Future<void> load({bool background = false, bool force = false}) async {
    if (isDisposed || (refreshing && !force)) return;
    final revision = ++loadRevision;
    refreshing = true;
    if (!background) update(() => loading = true);
    try {
      final data = await repo.exitRequest();
      if (isDisposed || revision != loadRevision) return;
      update(() {
        request = data;
        loading = false;
        error = null;
      });
    } catch (error) {
      if (!isDisposed && revision == loadRevision) {
        update(() {
          loading = false;
          this.error = ApiResult.errorMessage(error);
        });
      }
    } finally {
      if (revision == loadRevision) refreshing = false;
    }
  }
}

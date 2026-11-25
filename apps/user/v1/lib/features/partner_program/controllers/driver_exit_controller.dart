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
  List<Map<String, dynamic>> settlements = [];
  String? nextSettlementCursor;
  bool loadingSettlements = false;
  String? settlementError;

  Future<void> loadSettlements({bool more = false}) async {
    if (loadingSettlements || isDisposed) return;
    final cursor = more ? nextSettlementCursor : null;
    if (more && cursor == null) return;
    update(() {
      loadingSettlements = true;
      settlementError = null;
    });
    try {
      final page = await repo.exitHistory(after: cursor);
      if (isDisposed) return;
      final entries = (page['items'] as List).map(
        (item) => Map<String, dynamic>.from(item as Map),
      );
      update(() {
        settlements = [if (more) ...settlements, ...entries];
        nextSettlementCursor = page['next_cursor'] as String?;
        loadingSettlements = false;
      });
    } catch (error) {
      if (isDisposed) return;
      update(() {
        loadingSettlements = false;
        settlementError = ApiResult.errorMessage(error);
      });
    }
  }

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

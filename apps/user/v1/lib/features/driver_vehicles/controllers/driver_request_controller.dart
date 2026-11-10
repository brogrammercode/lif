import 'package:user/core/state/feature_controller.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/driver_operations/driver_operations.repo.dart';
import 'package:user/features/rides/ride_display.dart';

class DriverRequestController extends FeatureController {
  final DriverOperationsRepository repository;
  Map<String, dynamic> offer;
  bool busy = false, loading = false;
  bool _responding = false;
  String? error;
  DriverRequestController(this.repository, this.offer);
  bool get valid =>
      offer['can_accept'] == true &&
      (DateTime.tryParse('${offer['expires_at']}')?.isAfter(DateTime.now()) ??
          false);
  Future<void> refresh() async {
    if (loading || busy || isDisposed) return;
    loading = true;
    try {
      final data = await repository.dashboard();
      final current = rideMaps(
        data['offers'],
      ).where((row) => row['id'] == offer['id']).firstOrNull;
      if (!isDisposed) {
        update(() {
          offer = current ?? {...offer, 'can_accept': false};
          error = null;
        });
      }
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
    } finally {
      loading = false;
    }
  }

  Future<String?> respond(bool accept) async {
    if (busy || _responding || loading || isDisposed) return null;
    _responding = true;
    try {
      await refresh();
      if (error != null || !valid || isDisposed) return null;
      update(() => busy = true);
      if (accept) return await repository.accept('${offer['id']}');
      await repository.reject('${offer['id']}');
      return '';
    } catch (e) {
      if (!isDisposed) update(() => error = ApiResult.errorMessage(e));
      return null;
    } finally {
      _responding = false;
      if (!isDisposed) update(() => busy = false);
    }
  }
}

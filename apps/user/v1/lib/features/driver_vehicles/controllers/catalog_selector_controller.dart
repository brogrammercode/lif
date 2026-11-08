import 'package:user/core/network/api_result.dart';
import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/driver_vehicles/vehicle_verification.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class CatalogSelectorController extends FeatureController {
  final repo = VehicleVerificationRepository();
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;
  int page = 1;
  int request = 0;

  String? brandId;
  String query = '';
  Future<void> load() async {
    final request = ++this.request;
    update(() {
      loading = true;
      error = null;
    });
    try {
      final data = await repo.choices(
        brandId: brandId,
        query: query,
        page: page,
      );
      if (!isDisposed && request == this.request) {
        update(() => this.data = data);
      }
    } catch (error) {
      if (!isDisposed && request == this.request) {
        update(() => this.error = ApiResult.errorMessage(error));
      }
    } finally {
      if (!isDisposed && request == this.request) update(() => loading = false);
    }
  }
}

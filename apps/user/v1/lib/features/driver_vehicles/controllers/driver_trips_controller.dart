import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class DriverTripsController extends FeatureController {
  DriverTripsController(this.repo);
  final UserAppRepository repo;
  late Future<Map<String, dynamic>> data = repo.driverRides();
  int page = 1;
  Future<void> load([int? page]) async {
    if (isDisposed) return;
    update(() {
      this.page = page ?? this.page;
      data = repo.driverRides(page: this.page);
    });
    try {
      await data;
    } catch (_) {}
  }
}

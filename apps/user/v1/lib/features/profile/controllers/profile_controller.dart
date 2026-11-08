import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class ProfileController extends FeatureController {
  ProfileController(this.repository);
  final UserAppRepository repository;
  late Future<Map<String, dynamic>> profile = repository.profile();
  bool saving = false;
}

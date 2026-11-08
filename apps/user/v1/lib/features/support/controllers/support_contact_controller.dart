import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class SupportContactController extends FeatureController {
  SupportContactController(this.repository);
  final UserAppRepository repository;
  late Future<Map<String, dynamic>> data = repository.supportContacts();
}

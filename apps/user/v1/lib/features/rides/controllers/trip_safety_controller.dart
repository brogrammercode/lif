import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/user_app/user_app.repo.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owns feature records, query state and asynchronous loading independently of its view.
class TripSafetyController extends FeatureController {
  TripSafetyController(this.repository, {this.allowExternalActions = true});
  final UserAppRepository repository;
  final bool allowExternalActions;
  String get shareFailureMessage => allowExternalActions
      ? 'WhatsApp could not open. Copy the summary instead.'
      : 'External apps are disabled in the UI demo. You can copy the sample summary.';
  Future<bool> openExternal(Uri uri) async {
    if (!allowExternalActions || isDisposed) return false;
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  late final profile = repository.profile();
}

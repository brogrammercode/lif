import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/auth/auth.repo.dart';

class LoginController extends FeatureController {
  final AuthRepository? _injectedRepository;
  late final AuthRepository repository =
      _injectedRepository ?? AuthRepository();
  LoginController({AuthRepository? repository})
    : _injectedRepository = repository;
  bool signingIn = false;
  Future<bool> signIn() async {
    if (signingIn || isDisposed) return false;
    update(() => signingIn = true);
    try {
      await repository.signInWithGoogle();
      return !isDisposed;
    } finally {
      update(() => signingIn = false);
    }
  }
}

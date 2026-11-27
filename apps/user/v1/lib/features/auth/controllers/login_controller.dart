import 'package:user/core/state/feature_controller.dart';
import 'package:user/features/auth/auth.repo.dart';
import 'package:user/features/auth/models/user.model.dart';

class LoginController extends FeatureController {
  final AuthRepository? _injectedRepository;
  late final AuthRepository repository =
      _injectedRepository ?? AuthRepository();
  LoginController({AuthRepository? repository})
    : _injectedRepository = repository;
  bool signingIn = false;
  Future<UserModel?> signIn() async {
    if (signingIn || isDisposed) return null;
    update(() => signingIn = true);
    try {
      final user = await repository.signInWithGoogle();
      return isDisposed ? null : user;
    } finally {
      update(() => signingIn = false);
    }
  }
}

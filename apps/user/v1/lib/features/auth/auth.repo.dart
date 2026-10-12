import 'package:google_sign_in/google_sign_in.dart';
import 'package:user/core/config.dart';
import 'package:user/core/network/api.constant.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/network/dio_client.dart';
import 'package:user/features/auth/models/user.model.dart';

class AuthRepository {
  final DioClient _client = DioClient();
  final GoogleSignIn _googleSignIn = GoogleSignIn.instance;
  bool _googleInitialized = false;

  Future<UserModel> signInWithGoogle() async {
    if (!_googleInitialized) {
      final serverClientId = AppConfig.GOOGLE_SERVER_CLIENT_ID.trim();
      await _googleSignIn.initialize(
        serverClientId: serverClientId.isEmpty ? null : serverClientId,
      );
      _googleInitialized = true;
    }
    final account = await _googleSignIn.authenticate();
    final idToken = account.authentication.idToken;
    if (idToken == null || idToken.isEmpty)
      throw StateError('Google did not return an identity token.');
    final response = await _client.postData(
      ApiConstants.AUTH_GOOGLE,
      data: {'id_token': idToken},
    );
    final data = ApiResult.unwrap(response) as Map<String, dynamic>;
    await _client.saveTokens(
      data['access_token'] as String,
      data['refresh_token'] as String,
    );
    final user = UserModel.fromJson(data['user'] as Map<String, dynamic>);
    await _cacheUserLocation(user);
    return user;
  }

  Future<UserModel> currentUser() async {
    final response = await _client.getData(ApiConstants.AUTH_ME);
    final user = UserModel.fromJson(
      ApiResult.unwrap(response) as Map<String, dynamic>,
    );
    await _cacheUserLocation(user);
    return user;
  }

  Future<void> _cacheUserLocation(UserModel user) async {
    final latitude = user.last_known_latitude;
    final longitude = user.last_known_longitude;
    if (latitude == null || longitude == null) return;
    try {
      await _client.saveCachedUserLocation(
        latitude: latitude,
        longitude: longitude,
      );
    } catch (_) {}
  }

  Future<void> signOut() async {
    final refreshToken = await _client.readRefreshToken();
    if (refreshToken != null) {
      try {
        await _client.postData(
          ApiConstants.AUTH_LOGOUT,
          data: {'refresh_token': refreshToken},
        );
      } catch (_) {}
    }
    await _client.clearSession();
    await _googleSignIn.signOut();
  }

  Future<void> refreshSession() async {
    final refreshToken = await _client.readRefreshToken();
    if (refreshToken == null)
      throw StateError('Your session has expired. Please sign in again.');
    final response = await _client.postData(
      ApiConstants.AUTH_REFRESH,
      data: {'refresh_token': refreshToken},
    );
    final data = ApiResult.unwrap(response) as Map<String, dynamic>;
    await _client.saveTokens(
      data['access_token'] as String,
      data['refresh_token'] as String,
    );
  }
}

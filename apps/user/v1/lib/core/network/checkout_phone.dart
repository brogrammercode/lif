import 'api.constant.dart';
import 'api_result.dart';
import 'dio_client.dart';

Future<String?> checkoutPhone(DioClient client) async {
  try {
    final data = ApiResult.unwrap(await client.getData(ApiConstants.AUTH_ME));
    final phone = data is Map ? data['phone_e164'] : null;
    return phone is String && RegExp(r'^\+[1-9]\d{6,14}$').hasMatch(phone)
        ? phone
        : null;
  } catch (_) {
    return null;
  }
}

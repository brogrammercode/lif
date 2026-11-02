import 'package:user/core/network/dio_client.dart';
import 'package:user/core/network/api_result.dart';

class DriverAccountRepository {
  final _client = DioClient();
  Map<String, dynamic> _map(dynamic value) {
    final unwrapped = ApiResult.unwrap(value);
    if (unwrapped is! Map) {
      throw const FormatException('The server returned invalid driver data.');
    }
    return Map<String, dynamic>.from(unwrapped);
  }

  Future<Map<String, dynamic>> account() async =>
      _map(await _client.getData('/driver/account'));
  Future<Map<String, dynamic>> finances({
    String? from,
    String? to,
    int page = 1,
    String section = 'trips',
  }) async => _map(
    await _client.getData(
      '/driver/finances',
      queryParameters: {
        'from': ?from,
        'to': ?to,
        'page': page,
        'section': section,
      },
    ),
  );
  Future<void> requestPayout(String key, Map<String, dynamic> details) async {
    await _client.postData(
      '/driver/payout-changes',
      data: {'request_key': key, 'details': details},
    );
  }

  Future<Map<String, dynamic>> requests({int page = 1}) async => _map(
    await _client.getData(
      '/driver/catalog-requests',
      queryParameters: {'page': page},
    ),
  );
}

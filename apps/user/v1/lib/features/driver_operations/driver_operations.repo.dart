import 'package:user/core/network/dio_client.dart';
import 'package:user/core/network/api_result.dart';

class DriverOperationsRepository {
  final DioClient _client = DioClient();
  Map<String, dynamic> _map(dynamic v) =>
      Map<String, dynamic>.from(ApiResult.unwrap(v) as Map);
  String _trip(String id) => '/trips/${Uri.encodeComponent(id)}';
  String _driverTrip(String id) => '/driver/rides/${Uri.encodeComponent(id)}';
  Future<Map<String, dynamic>> dashboard() async =>
      _map(await _client.getData('/driver/operations'));
  Future<Map<String, dynamic>> context(String id) async =>
      _map(await _client.getData('${_trip(id)}/context'));
  Future<Map<String, dynamic>> riderRoute(String id) async =>
      _map(await _client.getData('${_trip(id)}/rider-route'));
  Future<void> availability(bool online) async {
    await _client.patchData(
      '/driver/availability',
      data: {'availability': online ? 'AVAILABLE' : 'OFFLINE'},
    );
  }

  Future<void> location(Map<String, dynamic> data) async {
    await _client.postData('/driver/location', data: data);
  }

  Future<String> accept(String id) async =>
      '${_map(await _client.postData('/driver/offers/${Uri.encodeComponent(id)}/accept'))['ride_id']}';
  Future<void> reject(String id) async {
    await _client.postData('/driver/offers/${Uri.encodeComponent(id)}/reject');
  }

  Future<void> arrive(String id) async {
    await _client.postData('${_driverTrip(id)}/arrive');
  }

  Future<void> start(String id, String code) async {
    await _client.postData('${_driverTrip(id)}/start', data: {'code': code});
  }

  Future<void> complete(String id) async {
    await _client.postData('${_driverTrip(id)}/complete');
  }

  Future<void> refreshCode(String id) async {
    await _client.postData('${_trip(id)}/start-code/refresh');
  }

  Future<void> collection(
    String id,
    String method,
    bool received,
    String? reason,
  ) async {
    await _client.postData(
      '${_driverTrip(id)}/collection',
      data: {'method': method, 'received': received, 'reason': ?reason},
    );
  }

  Future<Map<String, dynamic>> payment(String id, String method) async => _map(
    await _client.postData('${_trip(id)}/payment', data: {'method': method}),
  );
  Future<Map<String, dynamic>> navigation(
    String id,
    double latitude,
    double longitude,
  ) async => _map(
    await _client.getData(
      '${_driverTrip(id)}/navigation',
      queryParameters: {'latitude': latitude, 'longitude': longitude},
    ),
  );
  Future<List<Map<String, dynamic>>> messages(String id) async =>
      (ApiResult.unwrap(await _client.getData('${_trip(id)}/messages')) as List)
          .map((v) => Map<String, dynamic>.from(v as Map))
          .toList();
  Future<void> sendMessage(String id, String text, String key) async {
    await _client.postData(
      '${_trip(id)}/messages',
      data: {'body': text, 'client_key': key},
    );
  }

  Future<String> contact(String id) async =>
      '${_map(await _client.postData('${_trip(id)}/contact-attempt'))['phone']}';
  Future<void> issue(
    String id,
    String kind,
    String reason, {
    String? reasonCode,
  }) async {
    await _client.postData(
      '${_trip(id)}/issues',
      data: {'kind': kind, 'reason': reason, 'reason_code': ?reasonCode},
    );
  }

  Future<void> dispute(String id, String reason) async {
    await _client.postData('${_trip(id)}/dispute', data: {'reason': reason});
  }
}

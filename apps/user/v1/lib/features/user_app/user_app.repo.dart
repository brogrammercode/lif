import 'package:user/core/network/api.constant.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/network/dio_client.dart';

class UserAppRepository {
  final DioClient _client = DioClient();

  dynamic _data(dynamic response) => ApiResult.unwrap(response);

  Future<Map<String, dynamic>> profile() async => Map<String, dynamic>.from(
    _data(await _client.getData(ApiConstants.USER_ME)) as Map,
  );
  Future<Map<String, dynamic>> updateProfile(
    Map<String, dynamic> input,
  ) async => Map<String, dynamic>.from(
    _data(await _client.patchData(ApiConstants.USER_ME, data: input)) as Map,
  );
  Future<List<Map<String, dynamic>>> rides() async =>
      List<Map<String, dynamic>>.from(
        (_data(await _client.getData(ApiConstants.RIDES)) as List).map(
          (value) => Map<String, dynamic>.from(value as Map),
        ),
      );
  Future<Map<String, dynamic>> ride(String id) async =>
      Map<String, dynamic>.from(
        _data(await _client.getData('${ApiConstants.RIDES}/$id')) as Map,
      );
  Future<Map<String, dynamic>> requestQuote(Map<String, dynamic> input) async =>
      Map<String, dynamic>.from(
        _data(await _client.postData(ApiConstants.QUOTE, data: input)) as Map,
      );
  Future<Map<String, dynamic>> requestRide(
    String draftId,
    String quoteId,
  ) async => Map<String, dynamic>.from(
    _data(
          await _client.postData(
            ApiConstants.RIDES,
            data: {'draft_ride_id': draftId, 'quote_id': quoteId},
            headers: {
              ApiConstants.IDP_HEADER: DateTime.now().microsecondsSinceEpoch
                  .toString(),
            },
          ),
        )
        as Map,
  );
  Future<void> cancelRide(String id, String reason) async => _client.postData(
    '${ApiConstants.RIDES}/$id${ApiConstants.CANCEL_SUFFIX}',
    data: {'cancel_reason': reason},
    headers: {
      ApiConstants.IDP_HEADER: DateTime.now().microsecondsSinceEpoch.toString(),
    },
  );
  Future<Map<String, dynamic>> checkout(
    String rideId, {
    String? paymentMethodId,
  }) async => Map<String, dynamic>.from(
    ApiResult.unwrap(
          await _client.postData(
            ApiConstants.CHECKOUT,
            data: {
              'ride_id': rideId,
              if (paymentMethodId != null) 'payment_method_id': paymentMethodId,
            },
            headers: {
              ApiConstants.IDP_HEADER: DateTime.now().microsecondsSinceEpoch
                  .toString(),
            },
          ),
        )
        as Map,
  );
  Future<void> confirmRideStart(String id) async => _client.postData(
    '${ApiConstants.RIDES}/$id/confirm-start',
    headers: {
      ApiConstants.IDP_HEADER: DateTime.now().microsecondsSinceEpoch.toString(),
    },
  );
  Future<Map<String, dynamic>> receipt(String id) async =>
      Map<String, dynamic>.from(
        _data(
              await _client.getData(
                '${ApiConstants.RIDES}/$id${ApiConstants.RECEIPT_SUFFIX}',
              ),
            )
            as Map,
      );
  Future<void> review(
    String rideId,
    String revieweeId,
    int score,
    String? comment,
  ) async => _client.postData(
    '${ApiConstants.RIDES}/$rideId${ApiConstants.REVIEW_SUFFIX}',
    data: {'reviewee_id': revieweeId, 'score': score, 'comment': comment},
  );
  Future<List<Map<String, dynamic>>> savedPlaces() async =>
      List<Map<String, dynamic>>.from(
        (_data(await _client.getData(ApiConstants.SAVED_PLACES)) as List).map(
          (value) => Map<String, dynamic>.from(value as Map),
        ),
      );
  Future<void> addSavedPlace(Map<String, dynamic> input) async =>
      _client.postData(ApiConstants.SAVED_PLACES, data: input);
  Future<void> updateSavedPlace(String id, Map<String, dynamic> input) async =>
      _client.patchData('${ApiConstants.SAVED_PLACES}/$id', data: input);
  Future<void> deleteSavedPlace(String id) async =>
      _client.deleteData('${ApiConstants.SAVED_PLACES}/$id');
  Future<List<Map<String, dynamic>>> notifications() async =>
      List<Map<String, dynamic>>.from(
        (_data(await _client.getData(ApiConstants.NOTIFICATIONS)) as List).map(
          (value) => Map<String, dynamic>.from(value as Map),
        ),
      );
  Future<void> readNotification(String id) async =>
      _client.postData('${ApiConstants.NOTIFICATIONS}/$id/read');
  Future<List<Map<String, dynamic>>> paymentMethods() async =>
      List<Map<String, dynamic>>.from(
        (_data(await _client.getData(ApiConstants.PAYMENT_METHODS)) as List)
            .map((value) => Map<String, dynamic>.from(value as Map)),
      );
  Future<void> addPaymentMethod(Map<String, dynamic> input) async =>
      _client.postData('${ApiConstants.PAYMENT_METHODS}/setup', data: input);
  Future<void> deletePaymentMethod(String id) async =>
      _client.deleteData('${ApiConstants.PAYMENT_METHODS}/$id');
  Future<List<Map<String, dynamic>>> emergencyContacts() async =>
      List<Map<String, dynamic>>.from(
        (_data(await _client.getData(ApiConstants.EMERGENCY_CONTACTS)) as List)
            .map((value) => Map<String, dynamic>.from(value as Map)),
      );
  Future<void> addEmergencyContact(Map<String, dynamic> input) async =>
      _client.postData(ApiConstants.EMERGENCY_CONTACTS, data: input);
  Future<void> updateEmergencyContact(
    String id,
    Map<String, dynamic> input,
  ) async =>
      _client.patchData('${ApiConstants.EMERGENCY_CONTACTS}/$id', data: input);
  Future<void> deleteEmergencyContact(String id) async =>
      _client.deleteData('${ApiConstants.EMERGENCY_CONTACTS}/$id');
  Future<List<Map<String, dynamic>>> supportTickets() async =>
      List<Map<String, dynamic>>.from(
        (_data(await _client.getData(ApiConstants.SUPPORT_TICKETS)) as List)
            .map((value) => Map<String, dynamic>.from(value as Map)),
      );
  Future<void> createSupportTicket(Map<String, dynamic> input) async =>
      _client.postData(
        ApiConstants.SUPPORT_TICKETS,
        data: input,
        headers: {
          ApiConstants.IDP_HEADER: DateTime.now().microsecondsSinceEpoch
              .toString(),
        },
      );
  Future<Map<String, dynamic>> supportTicket(String id) async =>
      Map<String, dynamic>.from(
        _data(await _client.getData('${ApiConstants.SUPPORT_TICKETS}/$id'))
            as Map,
      );
  Future<void> sendSupportMessage(String id, String body) async =>
      _client.postData(
        '${ApiConstants.SUPPORT_TICKETS}/$id/messages',
        data: {'body': body},
      );
  Future<List<Map<String, dynamic>>> searchPlaces(String query) async =>
      List<Map<String, dynamic>>.from(
        (_data(
                  await _client.getData(
                    '/geocode/search',
                    queryParameters: {'q': query},
                  ),
                )
                as List)
            .map((value) => Map<String, dynamic>.from(value as Map)),
      );

  Future<Map<String, dynamic>> drivingRoute({
    required double fromLatitude,
    required double fromLongitude,
    required double toLatitude,
    required double toLongitude,
  }) async => Map<String, dynamic>.from(
    _data(
          await _client.getData(
            '/geocode/route',
            queryParameters: {
              'from_latitude': fromLatitude,
              'from_longitude': fromLongitude,
              'to_latitude': toLatitude,
              'to_longitude': toLongitude,
            },
          ),
        )
        as Map,
  );

  Future<List<Map<String, dynamic>>> rideLocations(String rideId) async =>
      List<Map<String, dynamic>>.from(
        (_data(await _client.getData('/rides/$rideId/locations')) as List).map(
          (value) => Map<String, dynamic>.from(value as Map),
        ),
      );
}

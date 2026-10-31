import 'ride_display.dart';

/// A quote, a ride fare, a recorded receipt and a reviewed penalty are separate
/// records. Presentation must never turn one into evidence of another.
class RideFareSummary {
  final Map<String, dynamic> trip;
  final Map<String, dynamic> payment;
  RideFareSummary(this.trip, {Map<String, dynamic>? payment})
    : payment = payment ?? rideMap(trip['payment']);

  String get status => '${trip['status'] ?? ''}';
  String get paymentStatus => '${payment['status'] ?? ''}';
  bool get unfulfilled => ['NO_DRIVER_FOUND', 'EXPIRED'].contains(status);
  bool get stopped => unfulfilled || status == 'CANCELLED';
  bool get providerManaged =>
      payment['provider_managed'] == true || payment['provider'] != null;
  bool get refunded => paymentStatus == 'REFUNDED';
  bool get waived => paymentStatus == 'CANCELLED';
  bool get received => paymentStatus == 'CAPTURED';
  double? _money(dynamic value) {
    final number = rideNumber(value);
    return number != null && number >= 0 ? number : null;
  }

  double? get quote =>
      _money(trip['estimated_fare'] ?? rideMap(trip['quote'])['total_fare']);
  double? get fare => _money(trip['final_fare']);
  double? get recordedCollection => _money(payment['amount']);
  bool get noRideCharge =>
      waived ||
      refunded ||
      (stopped &&
          !providerManaged &&
          ['', 'PENDING', 'FAILED'].contains(paymentStatus));
  double? get primaryAmount => noRideCharge
      ? 0
      : received || paymentStatus == 'PARTIALLY_REFUNDED'
      ? recordedCollection ?? fare ?? quote
      : fare ?? quote;
  String get primaryLabel => refunded
      ? 'Net ride fare'
      : waived
      ? 'Ride fare due'
      : noRideCharge
      ? 'Ride fare collected'
      : received
      ? 'Recorded collection'
      : fare != null
      ? 'Final ride fare'
      : 'Quoted fare';
  String get method =>
      '${payment['method'] ?? payment['collection_method'] ?? trip['collection_preference'] ?? ''}';
  String get collectionLabel {
    if (refunded) return 'Refunded';
    if (waived) return 'Fare waived';
    if (noRideCharge) return 'No ride fare collected';
    if (received) {
      if (providerManaged) return 'Payment received';
      return method == 'UPI'
          ? 'Direct UPI received'
          : method == 'CASH'
          ? 'Cash received'
          : 'Payment received';
    }
    if (paymentStatus == 'PARTIALLY_REFUNDED') {
      return 'Partially refunded; net amount not recorded here';
    }
    if (providerManaged) return ridePaymentLabel(paymentStatus);
    return status == 'COMPLETED'
        ? 'Awaiting driver receipt'
        : stopped
        ? 'Collection status requires verification'
        : 'Pay driver after completion';
  }

  String get amountLabel => paymentStatus == 'PARTIALLY_REFUNDED'
      ? 'Original ride fare'
      : primaryLabel;
}

Map<String, dynamic> rideSelectedQuote(Map<String, dynamic> trip) =>
    trip['quote'] is Map
    ? rideMap(trip['quote'])
    : rideMaps(trip['quotes']).firstOrNull ?? {};
Map<String, dynamic> rideCategory(Map<String, dynamic> trip) =>
    rideMap(rideSelectedQuote(trip)['category_snapshot']);
String rideReference(dynamic id) =>
    id == null || '$id'.isEmpty ? 'Reference unavailable' : 'TRP-$id';
String rideCategoryName(Map<String, dynamic> trip) {
  final snapshot = rideCategory(trip);
  final name = '${snapshot['name'] ?? ''}'.trim();
  return name.isNotEmpty ? name : '1More ride';
}

import 'package:maplibre_gl/maplibre_gl.dart';

const riderActiveStatuses = [
  'REQUESTED',
  'SEARCHING',
  'DRIVER_ASSIGNED',
  'DRIVER_ARRIVING',
  'DRIVER_WAITING',
  'IN_PROGRESS',
];
const riderTerminalStatuses = [
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'NO_DRIVER_FOUND',
];
const riderTripStatuses = [
  'DRAFT',
  ...riderActiveStatuses,
  ...riderTerminalStatuses,
];
Map<String, dynamic> rideMap(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : {};
List<Map<String, dynamic>> rideMaps(dynamic value) => value is List
    ? value.whereType<Map>().map((v) => Map<String, dynamic>.from(v)).toList()
    : [];
double? rideNumber(dynamic value) {
  final number = value is num ? value.toDouble() : double.tryParse('$value');
  return number != null && number.isFinite ? number : null;
}

LatLng? ridePoint(dynamic latitude, dynamic longitude) {
  final lat = rideNumber(latitude), lon = rideNumber(longitude);
  return lat == null ||
          lon == null ||
          !lat.isFinite ||
          !lon.isFinite ||
          lat.abs() > 90 ||
          lon.abs() > 180
      ? null
      : LatLng(lat, lon);
}

List<LatLng> rideGeometry(dynamic value) => value is List
    ? value
          .whereType<List>()
          .where((p) => p.length >= 2)
          .map((p) => ridePoint(p[1], p[0]))
          .whereType<LatLng>()
          .toList()
    : [];
String rideMoney(dynamic amount) => rideNumber(amount) == null
    ? 'Unavailable'
    : 'INR ${rideNumber(amount)!.toStringAsFixed(2)}';
String rideDistance(dynamic metres) => rideNumber(metres) == null
    ? 'Unavailable'
    : '${(rideNumber(metres)! / 1000).toStringAsFixed(1)} km';
String rideDuration(dynamic seconds) => rideNumber(seconds) == null
    ? 'Unavailable'
    : '${(rideNumber(seconds)! / 60).ceil().clamp(1, 9999)} min';
String rideTime(dynamic value) {
  final date = DateTime.tryParse('$value')?.toLocal();
  return date == null
      ? 'Not recorded'
      : '${date.day}/${date.month}/${date.year} ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
}

String riderStatusLabel(String status) => switch (status) {
  'REQUESTED' || 'SEARCHING' => 'Finding your driver',
  'DRIVER_ASSIGNED' || 'DRIVER_ARRIVING' => 'Your driver is on the way',
  'DRIVER_WAITING' => 'Your driver has arrived',
  'IN_PROGRESS' => 'On your way',
  'COMPLETED' => 'Your trip is complete',
  'NO_DRIVER_FOUND' => 'No driver available',
  'CANCELLED' => 'Ride cancelled',
  'DRAFT' => 'Ride not booked',
  'EXPIRED' => 'Ride request expired',
  _ => status.replaceAll('_', ' '),
};
String ridePaymentLabel(dynamic status) => switch (status) {
  'CAPTURED' => 'Received by driver',
  'CANCELLED' => 'Fare waived',
  'REFUNDED' => 'Refunded',
  'PARTIALLY_REFUNDED' => 'Partially refunded',
  'AUTHORIZED' => 'Awaiting provider settlement',
  'REQUIRES_ACTION' => 'Payment requires action',
  'FAILED' => 'Payment not received',
  _ => 'Awaiting driver receipt',
};
String staticTripSummary(Map<String, dynamic> trip) {
  final vehicle = rideMap(trip['vehicle']),
      driver = rideMap(rideMap(trip['driver'])['user']);
  return '1More trip ${trip['id']}\n${riderStatusLabel('${trip['status']}')}\nPickup: ${trip['pickup_address']}\nDrop-off: ${trip['dropoff_address']}\nDriver: ${driver['first_name'] ?? 'Not assigned'} ${driver['last_name'] ?? ''}\nVehicle: ${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''} ${vehicle['plate_number'] ?? ''}\nShared summary only; this is not live tracking.';
}

import 'package:flutter/material.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/ride_fare_summary.dart';

String rideEventTitle(String type) => switch (type) {
  'RIDE_REQUESTED' => 'Ride requested',
  'SEARCH_STARTED' || 'SEARCHING' => 'Driver search started',
  'NO_DRIVER_FOUND' => 'No driver found',
  'DRIVER_ASSIGNED' || 'OFFER_ACCEPTED' => 'Driver accepted',
  'DRIVER_WAITING' => 'Driver arrived at pickup',
  'TRIP_STARTED' => 'Trip started',
  'TRIP_COMPLETED' => 'Trip completed',
  'CANCELLATION_REPORTED' => 'Cancellation reported',
  'PASSENGER_NO_SHOW_REPORTED' => 'Passenger no-show reported',
  'CHARGE_DISPUTED' => 'Charge disputed',
  'PAYMENT_RECEIVED' => 'Driver confirmed payment',
  'COLLECTION_CONFIRMED' => 'Driver confirmed payment',
  'FARE_UNPAID_REPORTED' => 'Unpaid fare reported',
  'PAYMENT_METHOD_SELECTED' => 'Payment method selected',
  'CALL_ATTEMPT' => 'Call requested',
  'TRIP_CODE_REFRESHED' => 'Trip start code refreshed',
  _ =>
    type.isEmpty
        ? 'Trip update'
        : '${type[0]}${type.substring(1).replaceAll('_', ' ').toLowerCase()}',
};

class RideOutcomePanel extends StatelessWidget {
  final Map<String, dynamic> trip, payment;
  const RideOutcomePanel({
    super.key,
    required this.trip,
    required this.payment,
  });
  @override
  Widget build(BuildContext context) {
    final money = RideFareSummary(trip, payment: payment);
    final cancelled = trip['status'] == 'CANCELLED';
    final events = rideMaps(trip['events']);
    final ended = DateTime.tryParse(
      '${trip['cancelled_at'] ?? events.where((event) => ['NO_DRIVER_FOUND', 'REQUEST_EXPIRED'].contains(event['event_type'])).lastOrNull?['created_at']}',
    );
    final began = DateTime.tryParse('${trip['requested_at']}');
    final elapsed = ended != null && began != null && !ended.isBefore(began)
        ? ended.difference(began).inSeconds
        : null;
    final color = cancelled ? GlassTokens.muted : AppColors.googleRed;
    return LiquidGlassSurface(
      tint: color,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 40,
                height: 40,
                child: LiquidGlassSurface(
                  radius: 99,
                  padding: EdgeInsets.zero,
                  child: Icon(
                    cancelled ? Icons.close : Icons.search_off,
                    color: color,
                    size: 21,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  riderStatusLabel('${trip['status']}'),
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: GlassTokens.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            cancelled
                ? '${trip['cancel_reason'] ?? 'This ride was cancelled.'}'
                : trip['status'] == 'NO_DRIVER_FOUND'
                ? 'The driver search ended without a match. You can request a fresh quote and try again.'
                : 'This request expired. A new booking needs a fresh quote.',
            style: const TextStyle(
              fontSize: 13,
              height: 1.5,
              color: GlassTokens.muted,
            ),
          ),
          if (elapsed != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '${cancelled ? 'Cancelled after' : 'Search duration'} ${rideDuration(elapsed)}',
                style: const TextStyle(fontSize: 12, color: GlassTokens.muted),
              ),
            ),
          const SizedBox(height: 10),
          Text(
            money.collectionLabel,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: money.noRideCharge ? GlassTokens.accent : color,
            ),
          ),
          if (!money.noRideCharge && (money.received || money.providerManaged))
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(
                'A payment record exists. Review the collection details or contact Support.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: GlassTokens.muted,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class RideActivityTimeline extends StatelessWidget {
  final Map<String, dynamic> trip;
  const RideActivityTimeline(this.trip, {super.key});
  @override
  Widget build(BuildContext context) {
    final events = rideMaps(trip['events']);
    return LiquidGlassSurface(
      padding: const EdgeInsets.all(4),
      child: ExpansionTile(
        initiallyExpanded: [
          'NO_DRIVER_FOUND',
          'EXPIRED',
        ].contains(trip['status']),
        title: const Text(
          'Trip activity',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            color: GlassTokens.ink,
          ),
        ),
        subtitle: Text(
          events.length >= 200
              ? 'Latest 200 recorded events'
              : 'Recorded trip events',
          style: const TextStyle(fontSize: 12, color: GlassTokens.muted),
        ),
        childrenPadding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
        children: [
          if (events.isEmpty)
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'No activity recorded yet.',
                style: TextStyle(fontSize: 13, color: GlassTokens.muted),
              ),
            ),
          for (final event in events)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 5),
                    child: Icon(
                      Icons.circle,
                      size: 8,
                      color: GlassTokens.accent,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rideEventTitle('${event['event_type'] ?? ''}'),
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: GlassTokens.ink,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          rideTime(event['created_at']),
                          style: const TextStyle(
                            fontSize: 12,
                            color: GlassTokens.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

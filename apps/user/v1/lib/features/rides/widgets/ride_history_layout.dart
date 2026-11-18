import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/ride_fare_summary.dart';
import 'rider_flow_components.dart';

const _label = TextStyle(fontSize: 12, color: RideTokens.muted);
const _value = TextStyle(
  fontSize: 14,
  fontWeight: FontWeight.w500,
  color: RideTokens.ink,
);
const _pickup = Color(0xFF087A8B);

class RideHistoryHeading extends StatelessWidget {
  final String text;
  const RideHistoryHeading(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8, bottom: 8),
    child: Text(text, style: _value.copyWith(fontSize: 16)),
  );
}

class RideHistoryCard extends StatelessWidget {
  final Map<String, dynamic> ride;
  final VoidCallback onTap;
  const RideHistoryCard({super.key, required this.ride, required this.onTap});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: RideHistoryRoute(ride: ride, onTap: onTap),
  );
}

class RideHistoryRoute extends StatelessWidget {
  final Map<String, dynamic> ride;
  final Map<String, dynamic>? payment;
  final VoidCallback? onTap;
  const RideHistoryRoute({
    super.key,
    required this.ride,
    this.payment,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final fare = RideFareSummary(ride, payment: payment);
    final distance = ride['actual_distance_m'] ?? ride['estimated_distance_m'];
    final amount = fare.primaryAmount;
    final fareFact = _HistoryFact(
      fare.received ? 'Payment' : 'Fare',
      rideMoney(amount),
      badge: amount != null,
      received: fare.received,
      alignEnd: true,
    );
    final distanceFact = _HistoryFact(
      'Distance',
      rideDistance(distance),
      alignEnd: true,
    );
    return _HistorySurface(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(
                width: 26,
                child: Column(
                  children: [
                    const _EndpointIcon(Icons.arrow_downward, _pickup),
                    Expanded(
                      child: CustomPaint(
                        painter: const _DottedConnector(),
                        size: const Size(2, 0),
                      ),
                    ),
                    const _EndpointIcon(Icons.location_on, RideTokens.ink),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    _EndpointRow(
                      address: ride['pickup_address'],
                      label: 'Pickup point',
                      fallback: 'Pickup unavailable',
                      fact: fareFact,
                    ),
                    const SizedBox(height: 16),
                    _EndpointRow(
                      address: ride['dropoff_address'],
                      label: 'Destination',
                      fallback: 'Destination unavailable',
                      fact: distanceFact,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HistorySurface extends StatelessWidget {
  final Widget child;
  final VoidCallback? onTap;
  const _HistorySurface({required this.child, this.onTap});

  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    clipBehavior: Clip.antiAlias,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(12),
      side: const BorderSide(color: Color(0xFFE9EBED)),
    ),
    child: onTap == null ? child : InkWell(onTap: onTap, child: child),
  );
}

class _EndpointIcon extends StatelessWidget {
  final IconData icon;
  final Color color;
  const _EndpointIcon(this.icon, this.color);

  @override
  Widget build(BuildContext context) => Container(
    width: 25,
    height: 25,
    decoration: const BoxDecoration(
      shape: BoxShape.circle,
      color: Color(0xFFF4F6F7),
    ),
    child: Icon(icon, color: color, size: 15),
  );
}

class _DottedConnector extends CustomPainter {
  const _DottedConnector();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFFD1D5D8);
    for (double y = 4; y < size.height - 3; y += 5) {
      canvas.drawCircle(Offset(size.width / 2, y), 0.8, paint);
    }
  }

  @override
  bool shouldRepaint(_DottedConnector oldDelegate) => false;
}

class _EndpointRow extends StatelessWidget {
  final Object? address;
  final String label, fallback;
  final Widget fact;
  const _EndpointRow({
    required this.address,
    required this.label,
    required this.fallback,
    required this.fact,
  });

  @override
  Widget build(BuildContext context) {
    final name = address?.toString().trim() ?? '';
    final title = Text(
      name.isEmpty ? fallback : name,
      style: _value.copyWith(fontSize: 16),
    );
    final caption = Text(label, style: _label);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [title, caption],
          ),
        ),
        const SizedBox(width: 14),
        Flexible(
          flex: 2,
          child: Align(alignment: Alignment.topRight, child: fact),
        ),
      ],
    );
  }
}

class _HistoryFact extends StatelessWidget {
  final String title, value;
  final bool badge, received, alignEnd;
  const _HistoryFact(
    this.title,
    this.value, {
    this.badge = false,
    this.received = false,
    this.alignEnd = false,
  });

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: alignEnd
        ? CrossAxisAlignment.end
        : CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        title,
        style: _label,
        textAlign: alignEnd ? TextAlign.end : TextAlign.start,
      ),
      if (badge)
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: received ? const Color(0xFFE4F3E9) : const Color(0xFFF1F2F4),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: _value.copyWith(
              color: received ? const Color(0xFF176443) : RideTokens.ink,
            ),
          ),
        )
      else
        Text(
          value,
          style: _value,
          textAlign: alignEnd ? TextAlign.end : TextAlign.start,
        ),
    ],
  );
}

class RideHistoryDetails extends StatelessWidget {
  final Map<String, dynamic> trip, payment;
  final VoidCallback? onRate;
  final Widget? contactActions;
  const RideHistoryDetails({
    super.key,
    required this.trip,
    required this.payment,
    this.onRate,
    this.contactActions,
  });

  @override
  Widget build(BuildContext context) {
    final driver = rideMap(trip['driver']);
    final vehicle = rideMap(trip['vehicle']);
    final review = rideMap(trip['review']);
    final score = rideNumber(review['score']);
    final feedback = '${review['comment'] ?? ''}'.trim();
    final money = RideFareSummary(trip, payment: payment);
    final method = switch (money.method) {
      'CASH' => 'Cash',
      'UPI' => 'Direct UPI',
      '' => 'Unavailable',
      _ => money.method.replaceAll('_', ' '),
    };
    final facts = <Widget>[
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Rating', style: _label),
          if (score != null && score >= 1 && score <= 5)
            Semantics(
              label: '${score.toInt()} out of 5 stars',
              child: Wrap(
                children: [
                  for (var star = 1; star <= 5; star++)
                    Icon(
                      star <= score ? Icons.star : Icons.star_border,
                      color: const Color(0xFFAC7600),
                      size: 15,
                    ),
                ],
              ),
            )
          else if (onRate != null)
            TextButton(onPressed: onRate, child: const Text('Rate ride'))
          else
            const Text('Unrated', style: _value),
        ],
      ),
      _HistoryFact('Payment method', method),
      _HistoryFact(
        trip['actual_duration_s'] == null ? 'Est. duration' : 'Travel duration',
        rideDuration(trip['actual_duration_s'] ?? trip['estimated_duration_s']),
      ),
      _HistoryFact('Ride fare', rideMoney(money.fare ?? money.quote)),
      if (rideNumber(trip['discount_amount']) case final double discount
          when discount > 0)
        _HistoryFact('Discount', rideMoney(discount)),
      _HistoryFact(money.amountLabel, rideMoney(money.primaryAmount)),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (driver.isNotEmpty || vehicle.isNotEmpty) ...[
          RideVehicleDriverCard(
            vehicle: vehicle,
            driver: driver,
            contactActions: contactActions,
          ),
          const SizedBox(height: 24),
        ],
        LayoutBuilder(
          builder: (context, bounds) {
            final columns =
                bounds.maxWidth >= 300 &&
                    MediaQuery.textScalerOf(context).scale(14) < 22
                ? 3
                : 2;
            return Wrap(
              spacing: 8,
              runSpacing: 18,
              children: [
                for (final fact in facts)
                  SizedBox(
                    width: (bounds.maxWidth - (columns - 1) * 8) / columns,
                    child: fact,
                  ),
              ],
            );
          },
        ),
        if (feedback.isNotEmpty) ...[
          const SizedBox(height: 22),
          const Text('Feedback', style: _label),
          const SizedBox(height: 6),
          _HistorySurface(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Text(feedback, style: _value),
            ),
          ),
        ],
      ],
    );
  }
}

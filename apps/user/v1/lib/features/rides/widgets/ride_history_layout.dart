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
    return HistoryTimelineCard(
      onTap: onTap,
      firstIcon: Icons.arrow_downward,
      secondIcon: Icons.location_on,
      firstColor: _pickup,
      firstRow: HistoryTimelineRow(
        title: '${ride['pickup_address'] ?? ''}'.trim(),
        subtitle: 'Pickup point',
        fallback: 'Pickup unavailable',
        fact: fare.status == 'CANCELLED' ? null : fareFact,
      ),
      secondRow: HistoryTimelineRow(
        title: '${ride['dropoff_address'] ?? ''}'.trim(),
        subtitle: 'Destination',
        fallback: 'Destination unavailable',
        fact: distanceFact,
      ),
    );
  }
}

class HistoryTimelineCard extends StatelessWidget {
  final IconData firstIcon, secondIcon;
  final Color firstColor;
  final Widget firstRow, secondRow;
  final VoidCallback? onTap;

  const HistoryTimelineCard({
    super.key,
    required this.firstIcon,
    required this.secondIcon,
    required this.firstColor,
    required this.firstRow,
    required this.secondRow,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) => _HistorySurface(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.all(14),
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 26,
              child: Column(
                children: [
                  _EndpointIcon(firstIcon, firstColor),
                  const Expanded(
                    child: CustomPaint(
                      painter: _DottedConnector(),
                      size: Size(2, 0),
                    ),
                  ),
                  _EndpointIcon(secondIcon, RideTokens.ink),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [firstRow, const SizedBox(height: 16), secondRow],
              ),
            ),
          ],
        ),
      ),
    ),
  );
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

class HistoryTimelineRow extends StatelessWidget {
  final String title, subtitle, fallback;
  final Widget? fact;
  const HistoryTimelineRow({
    super.key,
    required this.title,
    required this.subtitle,
    this.fallback = 'Unavailable',
    required this.fact,
  });

  @override
  Widget build(BuildContext context) {
    final heading = Text(
      title.isEmpty ? fallback : title,
      style: _value.copyWith(fontSize: 16),
    );
    final caption = Text(subtitle, style: _label);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 3,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [heading, caption],
          ),
        ),
        if (fact != null) ...[
          const SizedBox(width: 14),
          Flexible(
            flex: 2,
            child: Align(alignment: Alignment.topRight, child: fact),
          ),
        ],
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
        HistoryAmountChip(
          value: value,
          color: received ? const Color(0xFF176443) : RideTokens.ink,
          background: received
              ? const Color(0xFFE4F3E9)
              : const Color(0xFFF1F2F4),
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

class HistoryAmountChip extends StatelessWidget {
  final String value;
  final Color color, background;
  const HistoryAmountChip({
    super.key,
    required this.value,
    required this.color,
    required this.background,
  });

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
    decoration: BoxDecoration(
      color: background,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(
      value,
      textAlign: TextAlign.end,
      style: _value.copyWith(color: color),
    ),
  );
}

class RideHistoryDetails extends StatelessWidget {
  final Map<String, dynamic> trip, payment;
  final VoidCallback? onRate;
  final Widget? contactActions;
  final bool driverView;
  const RideHistoryDetails({
    super.key,
    required this.trip,
    required this.payment,
    this.onRate,
    this.contactActions,
    this.driverView = false,
  });

  @override
  Widget build(BuildContext context) {
    final driver = rideMap(trip[driverView ? 'rider' : 'driver']);
    final person = driverView && driver.isNotEmpty ? {'user': driver} : driver;
    final vehicle = rideMap(trip['vehicle']);
    final review = rideMap(trip['review']);
    final score = rideNumber(review['score']);
    final feedback = '${review['comment'] ?? ''}'.trim();
    final money = RideFareSummary(trip, payment: payment);
    final method = switch (money.method) {
      'CASH' => 'Cash',
      'UPI' => 'Direct UPI',
      'WALLET' => 'Wallet',
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
      if (money.status != 'CANCELLED') _HistoryFact('Payment method', method),
      _HistoryFact(
        trip['actual_duration_s'] == null ? 'Est. duration' : 'Travel duration',
        rideDuration(trip['actual_duration_s'] ?? trip['estimated_duration_s']),
      ),
      if (money.status != 'CANCELLED') ...[
        _HistoryFact('Ride fare', rideMoney(money.fare ?? money.quote)),
        if (rideNumber(trip['discount_amount']) case final double discount
            when discount > 0)
          _HistoryFact('Discount', rideMoney(discount)),
        _HistoryFact(money.amountLabel, rideMoney(money.primaryAmount)),
      ],
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (driver.isNotEmpty || vehicle.isNotEmpty) ...[
          RideVehicleDriverCard(
            vehicle: vehicle,
            driver: person,
            contactActions: contactActions,
            personLabel: driverView ? 'Passenger' : null,
            showRating: !driverView,
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

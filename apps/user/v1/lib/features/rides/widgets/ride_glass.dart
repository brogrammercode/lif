import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/core/color.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/ride_fare_summary.dart';
import 'package:user/components/ui/button.dart';

class RideStatusBadge extends StatelessWidget {
  final String status;
  final bool concise;
  const RideStatusBadge(this.status, {super.key, this.concise = false});
  @override
  Widget build(BuildContext context) {
    final color = status == 'COMPLETED'
        ? AppColors.primaryGreen
        : status == 'NO_DRIVER_FOUND' || status == 'EXPIRED'
        ? AppColors.googleRed
        : status == 'CANCELLED'
        ? GlassTokens.muted
        : GlassTokens.accent;
    return LiquidGlassSurface(
      radius: 14,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      tint: color,
      child: Text(
        concise
            ? switch (status) {
                'COMPLETED' => 'Completed',
                'CANCELLED' => 'Cancelled',
                'NO_DRIVER_FOUND' => 'No driver available',
                'EXPIRED' => 'Request expired',
                _ => riderStatusLabel(status),
              }
            : riderStatusLabel(status),
        style: TextStyle(
          fontSize: 12,
          height: 1.3,
          color: color,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class RideEndpoints extends StatelessWidget {
  final Map<String, dynamic> trip;
  final bool compact;
  const RideEndpoints(this.trip, {super.key, this.compact = false});
  Widget _point(
    String title,
    dynamic address,
    dynamic time,
    bool pickup, {
    dynamic latitude,
    dynamic longitude,
  }) => Row(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      SizedBox(
        width: 30,
        height: 30,
        child: LiquidGlassSurface(
          radius: 99,
          padding: EdgeInsets.zero,
          child: Icon(
            pickup ? Icons.trip_origin : Icons.location_on_outlined,
            size: 17,
            color: pickup ? GlassTokens.accent : GlassTokens.ink,
          ),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!compact)
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: GlassTokens.ink,
                ),
              ),
            if (!compact) const SizedBox(height: 3),
            Text(
              address == null || '$address'.trim().isEmpty
                  ? 'Not recorded'
                  : compact
                  ? '$address'.split(',').first.trim()
                  : '$address',
              maxLines: compact ? 2 : null,
              overflow: compact ? TextOverflow.ellipsis : null,
              style: TextStyle(
                fontSize: compact ? 14 : 13,
                height: 1.45,
                color: compact ? GlassTokens.ink : GlassTokens.muted,
                fontWeight: compact ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
            if (compact && address != null && '$address'.contains(','))
              Text(
                '$address',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.4,
                  color: GlassTokens.muted,
                ),
              ),
            if (!compact && ridePoint(latitude, longitude) != null)
              Text(
                '${rideNumber(latitude)!.toStringAsFixed(4)}, ${rideNumber(longitude)!.toStringAsFixed(4)}',
                style: const TextStyle(
                  fontSize: 11,
                  height: 1.5,
                  color: GlassTokens.muted,
                ),
              ),
            if (time != null)
              Text(
                rideTime(time),
                style: const TextStyle(fontSize: 12, color: GlassTokens.muted),
              ),
          ],
        ),
      ),
    ],
  );
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _point(
        'Pickup',
        trip['pickup_address'],
        compact ? null : trip['started_at'],
        true,
        latitude: trip['pickup_latitude'],
        longitude: trip['pickup_longitude'],
      ),
      Padding(
        padding: const EdgeInsets.only(left: 14, top: 5, bottom: 5),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Container(
            width: 1,
            height: compact ? 10 : 18,
            color: GlassTokens.accent.withValues(alpha: .3),
          ),
        ),
      ),
      _point(
        'Drop-off',
        trip['dropoff_address'],
        compact ? null : trip['completed_at'],
        false,
        latitude: trip['dropoff_latitude'],
        longitude: trip['dropoff_longitude'],
      ),
    ],
  );
}

class RideFact extends StatelessWidget {
  final String label;
  final String value;
  final Widget? trailing;
  const RideFact(this.label, this.value, {super.key, this.trailing});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 7),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 13,
              height: 1.4,
              color: GlassTokens.muted,
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child:
              trailing ??
              Text(
                value,
                textAlign: TextAlign.end,
                style: const TextStyle(
                  fontSize: 13,
                  height: 1.4,
                  fontWeight: FontWeight.w500,
                  color: GlassTokens.ink,
                ),
              ),
        ),
      ],
    ),
  );
}

class RideCostDetails extends StatelessWidget {
  final Map<String, dynamic> trip, payment, review;
  const RideCostDetails({
    super.key,
    required this.trip,
    required this.payment,
    this.review = const {},
  });
  @override
  Widget build(BuildContext context) {
    final quote = rideSelectedQuote(trip);
    final money = RideFareSummary(trip, payment: payment);
    final policy = rideMap(rideCategory(trip)['payment_policy']);
    final penalty = review.isNotEmpty
        ? review
        : rideMap(trip['settlement_review']);
    return LiquidGlassSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Cost details',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: GlassTokens.ink,
            ),
          ),
          const SizedBox(height: 12),
          if (quote['base_fare'] != null)
            RideFact('Base fare', rideMoney(quote['base_fare'])),
          if (quote['distance_fare'] != null)
            RideFact('Distance fare', rideMoney(quote['distance_fare'])),
          if (quote['time_fare'] != null)
            RideFact('Time charge', rideMoney(quote['time_fare'])),
          if (policy['commission_percent'] != null)
            RideFact('Commission', '${policy['commission_percent']}%'),
          if (money.quote != null)
            RideFact('Quoted fare', rideMoney(money.quote)),
          if (money.fare != null)
            RideFact('Final ride fare', rideMoney(money.fare)),
          if (money.refunded && money.recordedCollection != null)
            RideFact('Original payment', rideMoney(money.recordedCollection)),
          const Divider(height: 24),
          RideFact(
            money.amountLabel,
            rideMoney(money.primaryAmount),
            trailing: Text(
              rideMoney(money.primaryAmount),
              textAlign: TextAlign.end,
              style: const TextStyle(
                fontSize: 21,
                fontWeight: FontWeight.w600,
                color: GlassTokens.ink,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            money.collectionLabel,
            style: const TextStyle(
              fontSize: 13,
              height: 1.5,
              color: GlassTokens.muted,
            ),
          ),
          if (money.noRideCharge && money.quote != null)
            const Padding(
              padding: EdgeInsets.only(top: 6),
              child: Text(
                'The quote is shown for reference. It is not a collected ride fare.',
                style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: GlassTokens.muted,
                ),
              ),
            ),
          if (money.method.isNotEmpty)
            RideFact(
              'Payment method',
              money.method == 'UPI'
                  ? 'Direct driver UPI'
                  : money.method == 'CASH'
                  ? 'Cash'
                  : money.method,
            ),
          if (penalty.isNotEmpty) ...[
            const Divider(height: 28),
            Text(
              penalty['kind'] == 'UNPAID'
                  ? 'Unpaid fare review'
                  : 'Cancellation / no-show review',
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: GlassTokens.ink,
              ),
            ),
            RideFact(
              'Review status',
              '${penalty['status'] ?? 'Pending'}'
                  .replaceAll('_', ' ')
                  .toLowerCase(),
            ),
            if ([
                  'APPROVED',
                  'SETTLED',
                  'REQUESTED',
                  'DISPUTED',
                ].contains(penalty['status']) &&
                rideNumber(penalty['fee_amount']) != null)
              RideFact(
                ['REQUESTED', 'DISPUTED'].contains(penalty['status'])
                    ? 'Proposed amount'
                    : penalty['status'] == 'SETTLED'
                    ? 'Settled amount'
                    : 'Reviewed amount',
                rideMoney(penalty['fee_amount']),
              ),
            if ('${penalty['resolution_note'] ?? ''}'.isNotEmpty)
              Text(
                '${penalty['resolution_note']}',
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: GlassTokens.muted,
                ),
              ),
            if (penalty['kind'] != 'UNPAID')
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'This review is separate from the ride fare and can be disputed through trip support.',
                  style: TextStyle(
                    fontSize: 12,
                    height: 1.5,
                    color: GlassTokens.muted,
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _RideDriverAvatar extends StatelessWidget {
  final Map<String, dynamic> person;
  const _RideDriverAvatar(this.person);
  @override
  Widget build(BuildContext context) {
    final url = person['avatar_url'];
    const fallback = Icon(Icons.person_outline, color: GlassTokens.accent);
    return SizedBox(
      width: 44,
      height: 44,
      child: LiquidGlassSurface(
        radius: 99,
        padding: EdgeInsets.zero,
        child: url is String && url.trim().isNotEmpty
            ? ClipOval(
                child: Image.network(
                  url,
                  fit: BoxFit.cover,
                  cacheWidth: 132,
                  cacheHeight: 132,
                  excludeFromSemantics: true,
                  errorBuilder: (_, error, stack) => fallback,
                ),
              )
            : fallback,
      ),
    );
  }
}

class RideTripFacts extends StatelessWidget {
  final Map<String, dynamic> trip;
  const RideTripFacts(this.trip, {super.key});
  @override
  Widget build(BuildContext context) {
    final vehicle = rideMap(trip['vehicle']);
    final driver = rideMap(rideMap(trip['driver'])['user']);
    final score = rideNumber(rideMap(trip['review'])['score']);
    final rated = score != null && score >= 1 && score <= 5;
    final name = [
      driver['first_name'],
      driver['last_name'],
    ].where((part) => part != null && '$part'.trim().isNotEmpty).join(' ');
    final vehicleName = [
      vehicle['make'],
      vehicle['model'],
      vehicle['color'],
    ].where((part) => part != null && '$part'.trim().isNotEmpty).join(' ');
    return LiquidGlassSurface(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          RideEndpoints(trip),
          if ('${trip['rider_note'] ?? ''}'.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(
                'Pickup instructions: ${trip['rider_note']}',
                style: const TextStyle(fontSize: 13, color: GlassTokens.muted),
              ),
            ),
          const Divider(height: 30),
          if (driver.isNotEmpty) ...[
            Row(
              children: [
                _RideDriverAvatar(driver),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name.isEmpty ? 'Assigned driver' : name,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: GlassTokens.ink,
                        ),
                      ),
                      if (vehicleName.isNotEmpty)
                        Text(
                          vehicleName,
                          style: const TextStyle(
                            fontSize: 12,
                            height: 1.4,
                            color: GlassTokens.muted,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
          ],
          if (trip['status'] == 'COMPLETED' || rated)
            RideFact(
              'Your rating',
              rated ? '${score.toInt()}/5' : 'Not rated',
              trailing: rated
                  ? Wrap(
                      alignment: WrapAlignment.end,
                      spacing: 2,
                      children: [
                        for (var star = 1; star <= 5; star++)
                          Icon(
                            star <= score ? Icons.star : Icons.star_border,
                            size: 18,
                            color: GlassTokens.accent,
                          ),
                        Semantics(
                          label: 'Your rating: ${score.toInt()} out of 5',
                          child: Text(
                            '${score.toInt()}/5',
                            style: const TextStyle(
                              fontSize: 12,
                              color: GlassTokens.muted,
                            ),
                          ),
                        ),
                      ],
                    )
                  : null,
            ),
          if (driver.isEmpty)
            RideFact(
              'Assigned driver',
              trip['status'] == 'COMPLETED' || trip['matched_at'] != null
                  ? 'Not available'
                  : 'Not assigned',
            ),
          RideFact(
            'License plate',
            '${vehicle['plate_number'] ?? (trip['status'] == 'COMPLETED' || trip['matched_at'] != null ? 'Not available' : 'Not assigned')}',
          ),
          RideFact(
            trip['actual_distance_m'] != null
                ? 'Recorded distance'
                : 'Quoted distance',
            rideDistance(
              trip['actual_distance_m'] ?? trip['estimated_distance_m'],
            ),
          ),
          RideFact(
            trip['actual_duration_s'] != null
                ? 'Recorded duration'
                : 'Quoted duration',
            rideDuration(
              trip['actual_duration_s'] ?? trip['estimated_duration_s'],
            ),
          ),
        ],
      ),
    );
  }
}

IconData rideVehicleIcon(Map<String, dynamic> trip) =>
    switch ('${rideSelectedQuote(trip)['vehicle_type'] ?? rideMap(trip['vehicle'])['type'] ?? ''}') {
      'BIKE' || 'SCOOTER' => Icons.two_wheeler,
      'AUTO' => Icons.electric_rickshaw,
      _ => Icons.directions_car_outlined,
    };

class RideHistoryCard extends StatelessWidget {
  final Map<String, dynamic> ride;
  final VoidCallback onTap;
  final VoidCallback? onRebook, onReceipt, onHelp;
  const RideHistoryCard({
    super.key,
    required this.ride,
    required this.onTap,
    this.onRebook,
    this.onReceipt,
    this.onHelp,
  });
  @override
  Widget build(BuildContext context) {
    final money = RideFareSummary(ride);
    final status = '${ride['status']}';
    final driver = rideMap(ride['driver']);
    final person = rideMap(driver['user']);
    final vehicle = rideMap(ride['vehicle']);
    final name = [
      person['first_name'],
      person['last_name'],
    ].where((part) => part != null && '$part'.trim().isNotEmpty).join(' ');
    final average = rideNumber(driver['rating_average']);
    final hasRating =
        average != null &&
        average >= 1 &&
        average <= 5 &&
        (rideNumber(driver['ratings_count']) ?? 0) > 0;
    final completed = status == 'COMPLETED';
    final active = riderActiveStatuses.contains(status);
    final image = rideCategory(ride)['image_url'];
    final distance = ride['actual_distance_m'] ?? ride['estimated_distance_m'];
    final duration = ride['actual_duration_s'] ?? ride['estimated_duration_s'];
    return LiquidGlassSurface(
      margin: const EdgeInsets.only(bottom: 18),
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 12,
                runSpacing: 10,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        rideTime(ride['created_at']),
                        style: const TextStyle(
                          fontSize: 12,
                          color: GlassTokens.ink,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        rideReference(ride['id']),
                        style: const TextStyle(
                          fontSize: 11,
                          color: GlassTokens.muted,
                        ),
                      ),
                    ],
                  ),
                  RideStatusBadge(status, concise: true),
                ],
              ),
              const SizedBox(height: 18),
              RideEndpoints(ride, compact: true),
              if (distance != null || duration != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12, left: 42),
                  child: Text(
                    [
                      if (distance != null) rideDistance(distance),
                      if (duration != null)
                        '${ride['actual_duration_s'] == null ? 'Est. ' : ''}${rideDuration(duration)}',
                    ].join(' - '),
                    style: const TextStyle(
                      fontSize: 12,
                      color: GlassTokens.muted,
                    ),
                  ),
                ),
              if (name.isNotEmpty) ...[
                const SizedBox(height: 16),
                LiquidGlassSurface(
                  radius: 18,
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      _RideDriverAvatar(person),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              name,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: GlassTokens.ink,
                              ),
                            ),
                            Text(
                              [
                                    vehicle['make'],
                                    vehicle['model'],
                                    vehicle['plate_number'],
                                  ]
                                  .where(
                                    (part) =>
                                        part != null &&
                                        '$part'.trim().isNotEmpty,
                                  )
                                  .join(' - '),
                              style: const TextStyle(
                                fontSize: 11,
                                height: 1.4,
                                color: GlassTokens.muted,
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (hasRating)
                        Padding(
                          padding: const EdgeInsets.only(left: 8),
                          child: Text(
                            '${average.toStringAsFixed(1)} ★',
                            style: const TextStyle(
                              fontSize: 12,
                              color: GlassTokens.accent,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
              const Divider(height: 28),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 38,
                    height: 38,
                    child: LiquidGlassSurface(
                      radius: 99,
                      padding: const EdgeInsets.all(6),
                      child: image is String && image.isNotEmpty
                          ? ClipOval(
                              child: Image.network(
                                image,
                                fit: BoxFit.cover,
                                cacheWidth: 96,
                                cacheHeight: 96,
                                errorBuilder: (_, error, stack) => Icon(
                                  rideVehicleIcon(ride),
                                  size: 21,
                                  color: GlassTokens.accent,
                                ),
                              ),
                            )
                          : Icon(
                              rideVehicleIcon(ride),
                              size: 21,
                              color: GlassTokens.accent,
                            ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rideCategoryName(ride),
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: GlassTokens.ink,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          money.collectionLabel,
                          style: const TextStyle(
                            fontSize: 11,
                            height: 1.4,
                            color: GlassTokens.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 12),
                  Flexible(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          rideMoney(money.primaryAmount),
                          style: const TextStyle(
                            fontSize: 19,
                            fontWeight: FontWeight.w600,
                            color: GlassTokens.ink,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          money.amountLabel,
                          textAlign: TextAlign.end,
                          style: const TextStyle(
                            fontSize: 10,
                            color: GlassTokens.muted,
                          ),
                        ),
                        if (money.noRideCharge && money.quote != null)
                          Text(
                            'Quoted ${rideMoney(money.quote)}',
                            textAlign: TextAlign.end,
                            style: const TextStyle(
                              fontSize: 11,
                              color: GlassTokens.muted,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              LayoutBuilder(
                builder: (context, constraints) {
                  final columns =
                      constraints.maxWidth >=
                          300 *
                              (MediaQuery.textScalerOf(context).scale(13) / 13)
                      ? 2
                      : 1;
                  final width =
                      (constraints.maxWidth - (columns - 1) * 10) / columns;
                  return Wrap(
                    spacing: 10,
                    runSpacing: 10,
                    children: [
                      SizedBox(
                        width: width,
                        child: AppButton(
                          text: active
                              ? 'View trip'
                              : onRebook == null
                              ? 'Trip details'
                              : money.unfulfilled
                              ? 'Retry booking'
                              : 'Book again',
                          onPressed: active || onRebook == null
                              ? onTap
                              : onRebook,
                          icon: Icon(
                            active ? Icons.arrow_forward : Icons.refresh,
                            size: 18,
                          ),
                        ),
                      ),
                      SizedBox(
                        width: width,
                        child: OutlinedButton.icon(
                          onPressed: completed
                              ? onReceipt ?? onTap
                              : onHelp ?? onTap,
                          icon: Icon(
                            completed
                                ? Icons.receipt_long_outlined
                                : Icons.support_agent,
                            size: 18,
                          ),
                          label: Text(completed ? 'View receipt' : 'Help'),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class RidesSkeleton extends StatelessWidget {
  final bool detail;
  final bool embedded;
  const RidesSkeleton({super.key, this.detail = false, this.embedded = false});
  @override
  Widget build(BuildContext context) {
    final content = AppSkeleton(
      label: detail ? 'Loading trip details' : 'Loading rides',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (var i = 0; i < (detail ? 3 : 2); i++)
            LiquidGlassSurface(
              margin: const EdgeInsets.only(top: 8, bottom: 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (detail && i == 0) ...[
                    const SkeletonBox(height: 170),
                    const SizedBox(height: 16),
                  ],
                  const FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: .5,
                    child: SkeletonBox(height: 14),
                  ),
                  const SizedBox(height: 20),
                  const SkeletonBox(height: 18),
                  const SizedBox(height: 20),
                  const SkeletonBox(height: 18),
                  const SizedBox(height: 20),
                  const FractionallySizedBox(
                    alignment: Alignment.centerRight,
                    widthFactor: .3,
                    child: SkeletonBox(height: 16),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
    return embedded ? content : SingleChildScrollView(child: content);
  }
}

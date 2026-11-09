import 'package:user/components/ui/solid_ui.dart';
import 'package:flutter/material.dart';

import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/ride_fare_summary.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';

/// Reference search / approach / ongoing layouts share one data-bound panel.
class RiderLivePanel extends StatelessWidget {
  final Map<String, dynamic> data;
  final String elapsed, waiting, estimate;
  final Widget actions;
  final Widget? contactActions;
  final VoidCallback onCancel, onSafety, onRefresh;
  final String? error;
  final bool busy, locationFresh;
  final double? remainingDistance;
  const RiderLivePanel({
    super.key,
    required this.data,
    required this.elapsed,
    required this.waiting,
    required this.estimate,
    required this.actions,
    this.contactActions,
    required this.onCancel,
    required this.onSafety,
    required this.onRefresh,
    this.error,
    required this.busy,
    required this.locationFresh,
    this.remainingDistance,
  });
  @override
  Widget build(BuildContext context) {
    final status = '${data['status']}', trip = rideMap(data['trip']);
    final searching = ['SEARCHING', 'REQUESTED'].contains(status);
    final moving = status == 'IN_PROGRESS';
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 6, 20, 20),
      children: [
        if (error != null) ...[
          Text(
            'Connection update failed: $error',
            style: const TextStyle(color: Colors.red),
          ),
          TextButton(onPressed: onRefresh, child: const Text('Retry update')),
        ],
        if (searching) ...[
          const Center(child: DriverSearchRadar()),
          const SizedBox(height: 16),
          Text(
            'Searching for $elapsed${data['search_radius_km'] == null ? '' : ' · ${data['search_radius_km']} km search area'}',
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'We expand the search while drivers remain unavailable. Your booking is confirmed when a driver accepts.',
            textAlign: TextAlign.center,
            style: TextStyle(color: RideTokens.muted),
          ),
          const SizedBox(height: 20),
          RideEndpoints(trip, compact: true),
        ] else ...[
          if (!locationFresh)
            const Padding(
              padding: EdgeInsets.only(bottom: 10),
              child: Text(
                'Last known driver location. Waiting for a fresh update.',
                style: TextStyle(color: RideTokens.muted),
              ),
            ),
          RideVehicleDriverCard(
            compact: moving,
            contactActions: contactActions,
            categoryLabel: rideMap(trip['quote'])['category_snapshot'] is Map
                ? '${rideMap(rideMap(trip['quote'])['category_snapshot'])['name'] ?? ''}'
                : null,
            vehicle: rideMap(trip['vehicle']),
            driver: rideMap(trip['driver']),
          ),
          const SizedBox(height: 12),
          if (moving)
            RideRouteProgress(
              remainingDistance: remainingDistance,
              totalDistance: rideNumber(trip['estimated_distance_m']),
            )
          else
            Padding(
              padding: const EdgeInsets.only(top: 16),
              child: RideRouteTimeline(trip),
            ),
          const SizedBox(height: 12),
          if (status == 'DRIVER_WAITING')
            actions
          else
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              title: const Text('Trip actions', style: TextStyle(fontSize: 13)),
              children: [actions],
            ),
        ],
        const SizedBox(height: 12),
        if (searching)
          OutlinedButton(
            onPressed: busy ? null : onCancel,
            child: const Text('Cancel ride'),
          ),
        TextButton.icon(
          onPressed: onSafety,
          icon: const Icon(Icons.health_and_safety_outlined),
          label: const Text('Safety, sharing & trip support'),
        ),
      ],
    );
  }
}

class RiderCompletionPanel extends StatefulWidget {
  final Map<String, dynamic> data;
  final Future<void> Function(int, String) onRate;
  final VoidCallback onHome, onReceipt, onSafety;
  final Widget actions;
  final bool busy;
  const RiderCompletionPanel({
    super.key,
    required this.data,
    required this.onRate,
    required this.onHome,
    required this.onReceipt,
    required this.onSafety,
    required this.actions,
    required this.busy,
  });
  @override
  State<RiderCompletionPanel> createState() => _CompletionState();
}

class _CompletionState extends State<RiderCompletionPanel> {
  bool _reminder = true;
  int _score = 0;
  final _comment = TextEditingController();
  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final trip = rideMap(widget.data['trip']),
        vehicle = rideMap(trip['vehicle']),
        driver = rideMap(trip['driver']);
    final user = rideMap(driver['user']);
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (_reminder)
          SolidSurface(
            padding: const EdgeInsets.only(left: 14),
            child: Row(
              children: [
                const Expanded(
                  child: Text('Make sure you have all your belongings.'),
                ),
                IconButton(
                  tooltip: 'Dismiss reminder',
                  onPressed: () => setState(() => _reminder = false),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
        const SizedBox(height: 18),
        Center(
          child: SizedBox(
            height: 115,
            width: 170,
            child: Stack(
              alignment: Alignment.center,
              children: [
                RideFlowImage(url: vehicle['photo_url'] as String?, size: 110),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: SolidSurface(
                    radius: 99,
                    padding: const EdgeInsets.all(4),
                    child: RideFlowImage(
                      url: user['avatar_url'] as String?,
                      size: 44,
                      fallback: Icons.person_outline,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '${user['first_name'] ?? ''} ${user['last_name'] ?? ''}'.trim(),
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600),
        ),
        Text(
          [
            vehicle['make'],
            vehicle['model'],
            vehicle['plate_number'],
          ].where((v) => v != null).join(' · '),
          textAlign: TextAlign.center,
          style: const TextStyle(color: RideTokens.muted),
        ),
        const SizedBox(height: 18),
        RideFact('Trip reference', rideReference(trip['id'])),
        RideFact('Completed', rideTime(trip['completed_at'])),
        const SizedBox(height: 20),
        if (trip['review'] == null && driver['user_id'] != null) ...[
          const Text(
            'How was your trip?',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          Wrap(
            alignment: WrapAlignment.center,
            children: [
              for (int i = 1; i <= 5; i++)
                IconButton(
                  tooltip: 'Rate $i stars',
                  onPressed: widget.busy
                      ? null
                      : () => setState(() => _score = i),
                  icon: Icon(
                    i <= _score
                        ? Icons.star_rounded
                        : Icons.star_outline_rounded,
                    color: RideTokens.accent,
                    size: 32,
                  ),
                ),
            ],
          ),
          if (_score > 0) ...[
            TextField(
              controller: _comment,
              maxLength: 500,
              decoration: const InputDecoration(
                labelText: 'Comment (optional)',
              ),
            ),
            TextButton(
              onPressed: widget.busy
                  ? null
                  : () => widget.onRate(_score, _comment.text.trim()),
              child: const Text('Submit rating'),
            ),
          ],
        ] else if (trip['review'] != null)
          const Text(
            'Your rating has been saved. Thank you for your feedback.',
            textAlign: TextAlign.center,
          ),
        const SizedBox(height: 16),
        SolidSurface(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              RideEndpoints(trip),
              const SizedBox(height: 12),
              RideTripFacts(trip),
            ],
          ),
        ),
        const SizedBox(height: 12),
        RideCostDetails(
          trip: trip,
          payment: rideMap(widget.data['payment']),
          review: rideMap(widget.data['review']),
        ),
        const SizedBox(height: 12),
        widget.actions,
        const SizedBox(height: 14),
        Wrap(
          alignment: WrapAlignment.center,
          spacing: 12,
          runSpacing: 12,
          children: [
            OutlinedButton(
              onPressed: widget.onHome,
              child: const Text('Back to Home'),
            ),
            SolidButton(
              text: 'View receipt',
              onPressed: widget.busy ? null : widget.onReceipt,
            ),
          ],
        ),
        TextButton(
          onPressed: widget.onSafety,
          child: const Text('Safety, sharing & trip support'),
        ),
      ],
    );
  }
}

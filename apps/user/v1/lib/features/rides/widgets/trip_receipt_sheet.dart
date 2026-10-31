import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/rides/ride_fare_summary.dart';

class TripReceiptSheet extends StatelessWidget {
  final Map<String, dynamic> data;
  const TripReceiptSheet({super.key, required this.data});
  @override
  Widget build(BuildContext context) {
    final trip = rideMap(data['trip']),
        quote = rideSelectedQuote(rideMap(data['trip'])),
        payment = rideMap(data['payment']);
    final money = RideFareSummary(trip, payment: payment);
    final policy = rideMap(
      rideMap(quote['category_snapshot'])['payment_policy'],
    );
    final category = rideMap(quote['category_snapshot']),
        vehicle = rideMap(trip['vehicle']);
    final lines = <String, String>{
      'Ride reference': '${trip['id']}',
      'Pickup': '${trip['pickup_address']}',
      'Drop-off': '${trip['dropoff_address']}',
      'Category':
          '${category['name'] ?? quote['vehicle_type'] ?? 'Not recorded'}',
      'Vehicle':
          '${vehicle['make'] ?? ''} ${vehicle['model'] ?? ''} ${vehicle['plate_number'] ?? ''}',
      'Completed': rideTime(trip['completed_at']),
      trip['actual_distance_m'] != null
          ? 'Recorded distance'
          : 'Quoted distance': rideDistance(
        trip['actual_distance_m'] ?? trip['estimated_distance_m'],
      ),
      trip['actual_duration_s'] != null
          ? 'Recorded duration'
          : 'Quoted duration': rideDuration(
        trip['actual_duration_s'] ?? trip['estimated_duration_s'],
      ),
      if (quote['base_fare'] != null)
        'Base fare': rideMoney(quote['base_fare']),
      if (quote['distance_fare'] != null)
        'Distance fare': rideMoney(quote['distance_fare']),
      if (quote['time_fare'] != null)
        'Time charge': rideMoney(quote['time_fare']),
      if (policy['commission_percent'] != null)
        'Commission': '${policy['commission_percent']}%',
      'Final fare': rideMoney(trip['final_fare']),
      if (money.refunded && money.recordedCollection != null)
        'Original payment': rideMoney(money.recordedCollection),
      money.amountLabel: rideMoney(money.primaryAmount),
      'Collection method':
          '${payment['method'] ?? trip['collection_preference'] ?? data['collection_preference'] ?? 'Pending selection'}',
      'Collection status': money.collectionLabel,
      'Last checked': rideTime(data['server_time']),
    };
    final summary =
        '1More ride receipt\n${lines.entries.map((e) => '${e.key}: ${e.value}').join('\n')}\nPayment receipt is confirmed only by the driver or reviewed by admin.';
    return LiquidGlassScope(
      child: LiquidGlassSheet(
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Ride receipt',
                  style: TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w600,
                    color: GlassTokens.ink,
                  ),
                ),
                const SizedBox(height: 12),
                for (final line in lines.entries)
                  RideFact(line.key, line.value),
                const Divider(),
                const Text(
                  'The accepted fare is fixed. GPS distance is recorded only when usable points exist. Cancellation or no-show reviews are separate obligations and never added to another ride.',
                ),
                if (payment['status'] == 'CANCELLED')
                  const Text('The fare has been waived; it is not payable.'),
                OutlinedButton.icon(
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: summary));
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Receipt summary copied.'),
                        ),
                      );
                    }
                  },
                  icon: const Icon(Icons.copy_outlined),
                  label: const Text('Copy receipt summary'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Done'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

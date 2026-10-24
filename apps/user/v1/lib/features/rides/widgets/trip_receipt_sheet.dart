import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:user/features/rides/ride_display.dart';

class TripReceiptSheet extends StatelessWidget {
  final Map<String, dynamic> data;
  const TripReceiptSheet({super.key, required this.data});
  @override
  Widget build(BuildContext context) {
    final trip = rideMap(data['trip']),
        quote = rideMap(trip['quote']),
        payment = rideMap(data['payment']);
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
      'Distance fare': rideMoney(quote['distance_fare'] ?? trip['final_fare']),
      'Base / time charge': 'INR 0.00',
      'Platform fee / commission': 'INR 0.00',
      'Final fare': rideMoney(trip['final_fare']),
      'Collection method':
          '${payment['method'] ?? trip['collection_preference'] ?? data['collection_preference'] ?? 'Pending selection'}',
      'Collection status': ridePaymentLabel(payment['status']),
      'Last checked': rideTime(data['server_time']),
    };
    final summary =
        '1More ride receipt\n${lines.entries.map((e) => '${e.key}: ${e.value}').join('\n')}\nPayment receipt is confirmed only by the driver or reviewed by admin.';
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Ride receipt',
              style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 12),
            for (final line in lines.entries)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: Text(line.key)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        line.value,
                        textAlign: TextAlign.end,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
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
                    const SnackBar(content: Text('Receipt summary copied.')),
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
    );
  }
}

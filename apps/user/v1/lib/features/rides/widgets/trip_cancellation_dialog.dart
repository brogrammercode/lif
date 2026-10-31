import 'package:user/components/ui/glass_dropdown.dart';
import 'package:flutter/material.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/rides/ride_display.dart';

class TripCancellationDialog extends StatefulWidget {
  final Map<String, dynamic> contextData;
  const TripCancellationDialog({super.key, required this.contextData});
  @override
  State<TripCancellationDialog> createState() => _CancellationState();
}

class _CancellationState extends State<TripCancellationDialog> {
  final _note = TextEditingController();
  String _code = 'CHANGED_PLANS';
  static const reasons = {
    'CHANGED_PLANS': 'My plans changed',
    'WRONG_PICKUP': 'Pickup is incorrect',
    'SAFETY': 'Driver or vehicle safety concern',
    'DRIVER_LATE': 'Driver is significantly late',
    'DRIVER_REFUSED': 'Driver refused the ride',
    'OTHER': 'Other reason',
  };
  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final policy = rideMap(widget.contextData['cancellation']);
    final freeUntil = DateTime.tryParse('${policy['free_until']}');
    return LiquidGlassDialog(
      title: const Text('Cancel this ride?'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'If the ride has already started, it cannot be cancelled here. Contact Support for help.',
            ),
            const SizedBox(height: 12),
            Text(
              freeUntil == null
                  ? 'Before assignment, cancellation is free.'
                  : 'Free cancellation until ${rideTime(freeUntil.toIso8601String())}. After that, up to ${rideMoney(policy['maximum_proposed_fee'])} may be proposed for review. Valid safety, late-driver and refusal reasons can be exempted by the admin. No fee is collected now.',
            ),
            const SizedBox(height: 16),
            LiquidGlassDropdownFormField<String>(
              initialValue: _code,
              decoration: const InputDecoration(labelText: 'Reason'),
              items: reasons.entries
                  .map(
                    (e) => DropdownMenuItem(
                      value: e.key,
                      child: Text(e.value, overflow: TextOverflow.ellipsis),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _code = v!),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _note,
              maxLength: 900,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                labelText: 'Additional details (optional)',
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Keep ride'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, {
            'reason_code': _code,
            'reason':
                '${reasons[_code]}${_note.text.trim().isEmpty ? '' : ': ${_note.text.trim()}'}',
          }),
          child: const Text('Confirm cancellation'),
        ),
      ],
    );
  }
}

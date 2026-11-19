import 'package:flutter/material.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/widgets/rider_flow_components.dart';

/// Location rationale shown before asking the operating system for permission.
class LocationAccessSheet extends StatelessWidget {
  final String title;
  final String message;
  final String actionLabel;
  final String? secondaryLabel;

  const LocationAccessSheet({
    super.key,
    this.title = 'Allow location access',
    this.message =
        'Your company needs it and personalised recommendations of service providers.',
    this.actionLabel = 'Continue',
    this.secondaryLabel,
  });

  static Future<bool?> show(
    BuildContext context, {
    String title = 'Allow location access',
    String message =
        'Your company needs it and personalised recommendations of service providers.',
    String actionLabel = 'Continue',
    String? secondaryLabel,
  }) => showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => LocationAccessSheet(
      title: title,
      message: message,
      actionLabel: actionLabel,
      secondaryLabel: secondaryLabel,
    ),
  );

  @override
  Widget build(BuildContext context) => SolidScope(
    child: RideStagePanel(
      header: RideArrivalStrip(label: 'Location access', value: ''),
      blackHeight: RideArrivalStrip.heightFor(context),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 3,
              margin: const EdgeInsets.symmetric(vertical: 9),
              decoration: BoxDecoration(
                color: const Color(0xFFCCCCCC),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Image.asset(
                      'assets/images/location_access.png',
                      width: 156,
                      height: 156,
                      fit: BoxFit.contain,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 17,
                      height: 1.2,
                      fontWeight: FontWeight.w500,
                      color: RideTokens.ink,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 13,
                      height: 1.4,
                      fontWeight: FontWeight.w400,
                      color: RideTokens.muted,
                    ),
                  ),
                  const SizedBox(height: 20),
                  SolidButton(
                    text: actionLabel,
                    onPressed: () => Navigator.of(context).pop(true),
                    minHeight: 54,
                  ),
                  if (secondaryLabel != null) ...[
                    const SizedBox(height: 6),
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      child: Text(secondaryLabel!),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

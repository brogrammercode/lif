import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/button.dart';
import 'package:user/features/rides/widgets/ride_glass.dart';
import 'package:user/features/rides/ride_fare_summary.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/core/routes.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/support/widgets/support_contact_card.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class TripSafetySheet extends StatefulWidget {
  final Map<String, dynamic> trip;
  final UserAppRepository repository;
  const TripSafetySheet({
    super.key,
    required this.trip,
    required this.repository,
  });
  @override
  State<TripSafetySheet> createState() => _TripSafetySheetState();
}

class _TripSafetySheetState extends State<TripSafetySheet> {
  late final _profile = widget.repository.profile();
  Map<String, dynamic> get trip => widget.trip;
  @override
  Widget build(BuildContext context) => LiquidGlassScope(
    child: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'Trip safety & help',
                    style: TextStyle(
                      fontSize: 21,
                      fontWeight: FontWeight.w600,
                      color: GlassTokens.ink,
                    ),
                  ),
                ),
                IconButton(
                  tooltip: 'Close trip help',
                  onPressed: () => Navigator.maybePop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 16),
            LiquidGlassSurface(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    rideReference(trip['id']),
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: GlassTokens.accent,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: RideStatusBadge('${trip['status']}', concise: true),
                  ),
                  const SizedBox(height: 12),
                  RideFact(
                    'Pickup',
                    '${trip['pickup_address'] ?? 'Not recorded'}',
                  ),
                  RideFact(
                    'Drop-off',
                    '${trip['dropoff_address'] ?? 'Not recorded'}',
                  ),
                  FutureBuilder<Map<String, dynamic>>(
                    future: _profile,
                    builder: (context, snapshot) {
                      final person = snapshot.data ?? rideMap(trip['rider']);
                      final name = [person['first_name'], person['last_name']]
                          .where(
                            (part) => part != null && '$part'.trim().isNotEmpty,
                          )
                          .join(' ');
                      return RideFact(
                        'Account',
                        name.isEmpty
                            ? 'Your signed-in account'
                            : [
                                name,
                                if (person['phone_e164'] != null)
                                  person['phone_e164'],
                              ].join(' - '),
                      );
                    },
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'This is a static trip summary, not live tracking. You choose when and with whom to share it.',
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.5,
                      color: GlassTokens.muted,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            SupportContactCard(repository: widget.repository),
            const SizedBox(height: 12),
            const Text(
              'Phone and WhatsApp actions open your own apps. A support request does not dispatch emergency help.',
              style: TextStyle(
                fontSize: 12,
                height: 1.5,
                color: GlassTokens.muted,
              ),
            ),
            const SizedBox(height: 18),
            OutlinedButton.icon(
              icon: const Icon(Icons.copy_outlined, size: 19),
              label: const Text('Copy trip summary'),
              onPressed: () async {
                await Clipboard.setData(
                  ClipboardData(text: staticTripSummary(trip)),
                );
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Trip summary copied.')),
                  );
                }
              },
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              icon: const Icon(Icons.share_outlined, size: 19),
              label: const Text('Share summary on WhatsApp'),
              onPressed: () async {
                try {
                  if (await launchUrl(
                    Uri.https('wa.me', '/', {'text': staticTripSummary(trip)}),
                    mode: LaunchMode.externalApplication,
                  )) {
                    return;
                  }
                } catch (_) {}
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text(
                        'WhatsApp could not open. Copy the summary instead.',
                      ),
                    ),
                  );
                }
              },
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: () =>
                  Navigator.pushNamed(context, AppRoutes.emergencyContacts),
              child: const Text('Manage emergency contacts'),
            ),
            const SizedBox(height: 10),
            AppButton(
              text: 'Report a trip issue or dispute',
              onPressed: () => showDialog<bool>(
                context: context,
                builder: (_) => TripSupportDialog(
                  tripId: '${trip['id']}',
                  repository: widget.repository,
                ),
              ),
            ),
            const SizedBox(height: 10),
            TextButton(
              onPressed: () => Navigator.pushNamed(context, AppRoutes.support),
              child: const Text('View support requests'),
            ),
          ],
        ),
      ),
    ),
  );
}

class TripSupportDialog extends StatefulWidget {
  final String tripId;
  final UserAppRepository repository;
  const TripSupportDialog({
    super.key,
    required this.tripId,
    required this.repository,
  });
  @override
  State<TripSupportDialog> createState() => _TripSupportState();
}

class _TripSupportState extends State<TripSupportDialog> {
  final _form = GlobalKey<FormState>();
  final _subject = TextEditingController(), _body = TextEditingController();
  late final _key =
      'trip-support-${widget.tripId}-${DateTime.now().microsecondsSinceEpoch}';
  bool _busy = false, _attempted = false;
  String? _error;
  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _attempted = true;
    });
    try {
      await widget.repository.createSupportTicket({
        'ride_id': widget.tripId,
        'subject': _subject.text.trim(),
        'body': _body.text.trim(),
        'priority': 'HIGH',
      }, requestKey: _key);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Request submitted. Replies will appear in Support.'),
        ),
      );
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: LiquidGlassDialog(
      title: const Text('Report a trip issue'),
      content: SingleChildScrollView(
        child: Form(
          key: _form,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Trip ${widget.tripId}. For immediate help, use a configured phone contact.',
              ),
              TextFormField(
                controller: _subject,
                enabled: !_attempted,
                maxLength: 160,
                decoration: const InputDecoration(labelText: 'Subject'),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Enter a subject' : null,
              ),
              TextFormField(
                controller: _body,
                enabled: !_attempted,
                maxLength: 5000,
                minLines: 3,
                maxLines: 6,
                decoration: const InputDecoration(labelText: 'What happened?'),
                validator: (v) =>
                    v == null || v.trim().isEmpty ? 'Enter details' : null,
              ),
              if (_error != null)
                Text(_error!, style: const TextStyle(color: Colors.red)),
              if (_attempted && _error != null)
                const Text(
                  'Retry sends the same request and preserves your message.',
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context),
          child: const Text('Close'),
        ),
        FilledButton(
          onPressed: _busy ? null : _send,
          child: Text(
            _busy
                ? 'Sending…'
                : _attempted
                ? 'Retry request'
                : 'Send request',
          ),
        ),
      ],
    ),
  );
}

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:user/components/ui/app_page.dart';
import 'package:user/core/network/api_result.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/user_app/user_app.repo.dart';

class BookingReviewResult {
  final String? rideId;
  final bool refresh;
  const BookingReviewResult({this.rideId, this.refresh = false});
}

enum _BookingStatus { draft, booked, unknown }

class BookingReviewSheet extends StatefulWidget {
  final String draftId, pickup, dropoff, method;
  final Map<String, dynamic> quote;
  final UserAppRepository repository;
  const BookingReviewSheet({
    super.key,
    required this.draftId,
    required this.pickup,
    required this.dropoff,
    required this.method,
    required this.quote,
    required this.repository,
  });
  @override
  State<BookingReviewSheet> createState() => _BookingReviewState();
}

class _BookingReviewState extends State<BookingReviewSheet> {
  final _note = TextEditingController();
  late final String _key =
      'booking-${widget.draftId}-${DateTime.now().microsecondsSinceEpoch}';
  late String _method = widget.method;
  bool _busy = false, _attempted = false;
  String? _error;
  Timer? _clock;
  DateTime? get _expires => DateTime.tryParse('${widget.quote['expires_at']}');
  bool get _expired => _expires == null || !_expires!.isAfter(DateTime.now());
  @override
  void initState() {
    super.initState();
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    _note.dispose();
    super.dispose();
  }

  Future<_BookingStatus> _reconcile() async {
    try {
      final ride = await widget.repository.ride(widget.draftId);
      if (ride['id'] != widget.draftId) return _BookingStatus.unknown;
      if (ride['status'] == 'DRAFT') return _BookingStatus.draft;
      if ([
        ...riderActiveStatuses,
        ...riderTerminalStatuses,
      ].contains(ride['status'])) {
        if (mounted) {
          Navigator.pop(context, BookingReviewResult(rideId: widget.draftId));
        }
        return _BookingStatus.booked;
      }
    } catch (_) {
      /* Retry the same immutable request; a failed read is not proof of failure. */
    }
    return _BookingStatus.unknown;
  }

  Future<void> _freshOptions() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      if (_attempted) {
        final status = await _reconcile();
        if (!mounted || status == _BookingStatus.booked) return;
        if (status == _BookingStatus.unknown) {
          throw StateError(
            'Your booking status could not be verified. Check and retry before requesting fresh options.',
          );
        }
      }
      if (mounted) {
        Navigator.pop(context, const BookingReviewResult(refresh: true));
      }
    } catch (e) {
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      if (_attempted && await _reconcile() == _BookingStatus.booked) return;
      if (!mounted) return;
      if (_expired) {
        throw StateError(
          'This quote has expired. Check the booking status, then get fresh ride options.',
        );
      }
      setState(() => _attempted = true);
      final ride = await widget.repository.requestRide(
        widget.draftId,
        '${widget.quote['id']}',
        method: _method,
        note: _note.text.trim(),
        requestKey: _key,
      );
      if (ride['id'] != widget.draftId) {
        throw StateError(
          'The booking response could not be verified. Check this booking before continuing.',
        );
      }
      if (mounted) {
        Navigator.pop(context, BookingReviewResult(rideId: '${ride['id']}'));
      }
    } catch (e) {
      if (_attempted && await _reconcile() == _BookingStatus.booked) return;
      if (mounted) setState(() => _error = ApiResult.errorMessage(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final category = rideMap(widget.quote['category_snapshot']),
        policy = rideMap(category['payment_policy']);
    final methods = [
      if (policy['cash_enabled'] != false) 'CASH',
      if (policy['direct_upi_enabled'] == true) 'UPI',
    ];
    if (!methods.contains(_method) && methods.isNotEmpty && !_attempted) {
      _method = methods.first;
    }
    return PopScope(
      canPop: !_busy,
      child: SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            20,
            20,
            20 + MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Review your ride',
                  style: TextStyle(fontSize: 23, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 16),
                Text('Pickup\n${widget.pickup}'),
                const SizedBox(height: 12),
                Text('Drop-off\n${widget.dropoff}'),
                const SizedBox(height: 16),
                AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${category['name'] ?? widget.quote['vehicle_type']}',
                        style: const TextStyle(fontWeight: FontWeight.w800),
                      ),
                      Text(
                        '${category['capacity'] ?? '-'} passenger seats · ${rideDistance(widget.quote['distance_m'])} · ${rideDuration(widget.quote['duration_s'])} trip estimate',
                      ),
                      Text(
                        rideMoney(widget.quote['total_fare']),
                        style: const TextStyle(
                          fontSize: 25,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        'Distance fare ${rideMoney(widget.quote['distance_fare'])}. No platform fee or commission. Pay the driver after completion.',
                      ),
                      const Text(
                        'Pickup ETA is available after a driver is assigned. Availability is confirmed when a driver accepts.',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  _expired
                      ? 'Quote expired'
                      : 'Quote valid until ${rideTime(widget.quote['expires_at'])}',
                ),
                if (methods.isNotEmpty)
                  DropdownButtonFormField<String>(
                    initialValue: _method,
                    decoration: const InputDecoration(
                      labelText: 'Payment after the ride',
                    ),
                    items: methods
                        .map(
                          (m) => DropdownMenuItem(
                            value: m,
                            child: Text(
                              m == 'UPI'
                                  ? 'Direct driver UPI'
                                  : 'Cash to driver',
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: _busy || _attempted
                        ? null
                        : (v) => setState(() => _method = v!),
                  ),
                TextField(
                  controller: _note,
                  enabled: !_busy && !_attempted,
                  maxLength: 500,
                  minLines: 1,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Pickup landmark or instructions (optional)',
                  ),
                ),
                if (_attempted)
                  const Text(
                    'Retries keep the same booking request. If the connection drops, we check this ride before creating another booking.',
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                FilledButton(
                  onPressed:
                      _busy || methods.isEmpty || (_expired && !_attempted)
                      ? null
                      : _submit,
                  child: Text(
                    _busy
                        ? 'Checking your booking…'
                        : _attempted
                        ? 'Check and retry booking'
                        : 'Confirm booking',
                  ),
                ),
                if (_expired)
                  TextButton(
                    onPressed: _busy ? null : _freshOptions,
                    child: const Text('Get fresh ride options'),
                  ),
                TextButton(
                  onPressed: _busy ? null : () => Navigator.pop(context),
                  child: const Text('Back to map'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
